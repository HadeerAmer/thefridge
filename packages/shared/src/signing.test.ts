import { describe, expect, it } from "vitest";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signedHeaders, verifySignature } from "./signing";

const secret = "test-secret-123";
const body = JSON.stringify({ id: "evt_1", type: "stock.changed" });

describe("request signing", () => {
  it("verifies a request it signed", () => {
    const headers = signedHeaders(secret, "cbp-zayed", body);
    expect(verifySignature({ secret, body, timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER] })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const headers = signedHeaders(secret, "cbp-zayed", body);
    const result = verifySignature({ secret, body: body.replace("stock", "stuck"), timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER] });
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects the wrong secret", () => {
    const headers = signedHeaders("other-secret", "cbp-zayed", body);
    expect(verifySignature({ secret, body, timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER] }).ok).toBe(false);
  });

  it("rejects replays outside the time window", () => {
    const tenMinutesAgo = Date.now() - 10 * 60_000;
    const headers = signedHeaders(secret, "cbp-zayed", body, tenMinutesAgo);
    expect(verifySignature({ secret, body, timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER] })).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects missing headers", () => {
    expect(verifySignature({ secret, body, timestamp: null, signature: null })).toEqual({ ok: false, reason: "missing" });
  });
});
