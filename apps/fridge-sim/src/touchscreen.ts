import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RedeemResponse, VendResult } from "@thefridge/shared/contracts";
import type { CloudClient } from "./cloud";
import type { Fleet } from "./domain/fleet";
import type { VendRecord } from "./domain/types";

/**
 * The machine's customer-facing flow: scan a pickup QR → (pay if due) → dispense.
 * One session per scan; the UI renders the latest session of each machine.
 */

export type ScanSession = {
  id: string;
  machineId: string;
  code: string;
  status: "verifying" | "awaiting_payment" | "vending" | "completed" | "rejected" | "cancelled";
  message: string;
  order: RedeemResponse | null;
  vend: VendResult | null;
  createdAt: string;
  updatedAt: string;
};

const DISPENSE_MS = 1400;
const formatEgp = (cents: number) => `EGP ${(cents / 100).toLocaleString("en-EG")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Touchscreen extends EventEmitter<{ changed: [session: ScanSession] }> {
  private readonly sessions = new Map<string, ScanSession>();

  constructor(
    private readonly fleet: Fleet,
    private readonly cloud: CloudClient,
  ) {
    super();
  }

  latest(machineId: string): ScanSession | null {
    let latest: ScanSession | null = null;
    for (const s of this.sessions.values()) {
      if (s.machineId === machineId && (!latest || s.createdAt > latest.createdAt)) latest = s;
    }
    return latest;
  }

  get(sessionId: string): ScanSession | undefined {
    return this.sessions.get(sessionId);
  }

  async scan(machineId: string, rawCode: string): Promise<ScanSession> {
    const machine = this.fleet.machine(machineId);
    const code = rawCode.trim().toUpperCase();
    const session = this.create(machineId, code);

    if (machine.status !== "online" || machine.salesLocked) {
      return this.update(session, { status: "rejected", message: "Sorry — this fridge is not selling right now." });
    }

    try {
      const order = await this.cloud.redeem(machineId, code);
      session.order = order;
      if (order.amountDueCents > 0) {
        return this.update(session, {
          status: "awaiting_payment",
          message: `${formatEgp(order.amountDueCents)} to pay · tap your card`,
        });
      }
      await this.dispense(session);
    } catch (error) {
      this.update(session, { status: "rejected", message: error instanceof Error ? error.message : "Code not accepted" });
    }
    return session;
  }

  async pay(sessionId: string, method: "card" | "cash"): Promise<ScanSession> {
    const session = this.require(sessionId);
    if (session.status !== "awaiting_payment" || !session.order) return session;
    const payment = {
      method,
      amountCents: session.order.amountDueCents,
      reference: `pos_${randomUUID().slice(0, 8)}`,
    };
    try {
      this.update(session, { message: method === "card" ? "Approving card…" : "Counting cash…" });
      await this.cloud.reportPayment(session.machineId, session.order.orderId, payment);
      await this.dispense(session, payment);
    } catch (error) {
      this.update(session, { status: "rejected", message: error instanceof Error ? error.message : "Payment failed" });
    }
    return session;
  }

  cancel(sessionId: string): ScanSession {
    const session = this.require(sessionId);
    if (session.status === "awaiting_payment" || session.status === "verifying") {
      this.update(session, { status: "cancelled", message: "Cancelled — your reservation is still held." });
    }
    return session;
  }

  private async dispense(session: ScanSession, payment?: VendRecord["payment"]): Promise<void> {
    const order = session.order!;
    const names = order.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`).join(", ");
    this.update(session, { status: "vending", message: `Dropping ${names}…` });
    await sleep(DISPENSE_MS);
    session.vend = this.fleet.vendHold(session.machineId, order.holdId, {
      channel: order.purpose === "courier" ? "courier" : "app",
      payment,
    });
    const who = order.customerName ? `, ${order.customerName.split(" ")[0]}` : "";
    this.update(session, { status: "completed", message: `Enjoy${who}! Always a good cal(l).` });
  }

  private create(machineId: string, code: string): ScanSession {
    const now = new Date().toISOString();
    const session: ScanSession = {
      id: `scan_${randomUUID().slice(0, 8)}`,
      machineId,
      code,
      status: "verifying",
      message: "Checking your code…",
      order: null,
      vend: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    if (this.sessions.size > 100) this.sessions.delete(this.sessions.keys().next().value!);
    this.emit("changed", session);
    return session;
  }

  private update(session: ScanSession, patch: Partial<Pick<ScanSession, "status" | "message">>): ScanSession {
    Object.assign(session, patch, { updatedAt: new Date().toISOString() });
    this.emit("changed", session);
    return session;
  }

  private require(sessionId: string): ScanSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }
}
