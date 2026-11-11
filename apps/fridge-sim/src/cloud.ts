import { EventEmitter } from "node:events";
import {
  RedeemResponseSchema,
  type MachineEvent,
  type MachinePaymentRequest,
  type RedeemResponse,
} from "@thefridge/shared/contracts";
import { signedHeaders } from "@thefridge/shared/signing";

export type WebhookLogEntry = {
  id: string;
  type: MachineEvent["type"];
  machineId: string;
  status: "delivered" | "retrying" | "dropped";
  attempts: number;
  at: string;
  detail?: string;
};

type Outgoing = { event: MachineEvent; attempts: number; nextAttemptAt: number };

const MAX_QUEUE = 1000;
const MAX_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;

export class CloudError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CloudError";
  }
}

/**
 * Talks to the cloud backend.
 * Webhooks go through an in-order outbox with exponential backoff, so a cloud outage
 * never loses stock changes; each event carries absolute stock levels and a unique id.
 */
export class CloudClient extends EventEmitter<{ log: [entry: WebhookLogEntry] }> {
  private readonly queue: Outgoing[] = [];
  private readonly history: WebhookLogEntry[] = [];
  private flushing = false;
  private timer: NodeJS.Timeout | null = null;
  online = false;

  constructor(private readonly options: { cloudUrl: string; secret: string }) {
    super();
  }

  start(): void {
    this.timer ??= setInterval(() => void this.flush(), 500);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get pending(): number {
    return this.queue.length;
  }

  get log(): WebhookLogEntry[] {
    return [...this.history].reverse();
  }

  publish(event: MachineEvent): void {
    this.queue.push({ event, attempts: 0, nextAttemptAt: Date.now() });
    if (this.queue.length > MAX_QUEUE) {
      const dropped = this.queue.splice(0, this.queue.length - MAX_QUEUE);
      for (const item of dropped) this.record(item, "dropped", "outbox full");
    }
    void this.flush();
  }

  async redeem(machineId: string, code: string): Promise<RedeemResponse> {
    const json = await this.post(machineId, "/api/machine/v1/redeem", { code });
    return RedeemResponseSchema.parse(json);
  }

  async reportPayment(machineId: string, orderId: string, payment: MachinePaymentRequest): Promise<void> {
    await this.post(machineId, `/api/machine/v1/orders/${encodeURIComponent(orderId)}/payment`, payment);
  }

  // ------------------------------------------------------------------ internals

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const head = this.queue[0]!;
        if (head.nextAttemptAt > Date.now()) break;
        const outcome = await this.deliver(head.event);
        head.attempts += 1;
        if (outcome.ok || outcome.permanent) {
          this.queue.shift();
          this.record(head, outcome.ok ? "delivered" : "dropped", outcome.detail);
          continue;
        }
        head.nextAttemptAt = Date.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** head.attempts);
        this.record(head, "retrying", outcome.detail);
        break; // keep order: nothing overtakes a failed event
      }
    } finally {
      this.flushing = false;
    }
  }

  private async deliver(event: MachineEvent): Promise<{ ok: boolean; permanent?: boolean; detail?: string }> {
    const body = JSON.stringify(event);
    try {
      const res = await fetch(`${this.options.cloudUrl}/api/machine/v1/events`, {
        method: "POST",
        headers: signedHeaders(this.options.secret, event.machineId, body),
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      this.online = true;
      if (res.ok) return { ok: true };
      const detail = `HTTP ${res.status}`;
      // 4xx other than 408/429 will not succeed on retry (bad signature, invalid payload).
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      return { ok: false, permanent, detail };
    } catch (error) {
      this.online = false;
      return { ok: false, detail: error instanceof Error ? error.message : "network error" };
    }
  }

  private async post(machineId: string, path: string, payload: unknown): Promise<unknown> {
    const body = JSON.stringify(payload);
    let res: Response;
    try {
      res = await fetch(`${this.options.cloudUrl}${path}`, {
        method: "POST",
        headers: signedHeaders(this.options.secret, machineId, body),
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      this.online = false;
      throw new CloudError("Can't reach The Fridge cloud. Check the connection and try again.", 503);
    }
    this.online = true;
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) throw new CloudError(json?.error?.message ?? `Cloud error (${res.status})`, res.status);
    return json;
  }

  private record(item: Outgoing, status: WebhookLogEntry["status"], detail?: string): void {
    const entry: WebhookLogEntry = {
      id: item.event.id,
      type: item.event.type,
      machineId: item.event.machineId,
      status,
      attempts: item.attempts,
      at: new Date().toISOString(),
      detail,
    };
    // Heartbeats are noisy; only show them when something went wrong.
    if (!(item.event.type === "machine.status" && status === "delivered")) {
      this.history.push(entry);
      if (this.history.length > 60) this.history.shift();
    }
    this.emit("log", entry);
  }
}
