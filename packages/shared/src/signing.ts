import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC request signing for machine → cloud traffic (webhooks and redeem calls).
 * signature = "v1=" + hex(HMAC_SHA256(secret, `${timestamp}.${body}`))
 * The timestamp bounds replay; the event id (in the body) makes delivery idempotent.
 */

export const SIGNATURE_HEADER = "x-fridge-signature";
export const TIMESTAMP_HEADER = "x-fridge-timestamp";
export const MACHINE_ID_HEADER = "x-fridge-machine-id";
export const API_KEY_HEADER = "x-api-key";

const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `v1=${digest}`;
}

export function signedHeaders(secret: string, machineId: string, body: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  return {
    "content-type": "application/json",
    [MACHINE_ID_HEADER]: machineId,
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signPayload(secret, timestamp, body),
  };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export function verifySignature(params: {
  secret: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  toleranceSeconds?: number;
  now?: number;
}): VerifyResult {
  const { secret, body, timestamp, signature } = params;
  if (!timestamp || !signature) return { ok: false, reason: "missing" };

  const ts = Number(timestamp);
  const nowSec = Math.floor((params.now ?? Date.now()) / 1000);
  const tolerance = params.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > tolerance) return { ok: false, reason: "stale" };

  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
