import "server-only";
import { z } from "zod";
import { randomCode } from "./codes";

/**
 * Payment provider boundary. The demo uses a sandbox; a Paymob / Fawry / InstaPay
 * integration would implement the same interface.
 */

export const CardSchema = z.object({
  number: z.string().transform((v) => v.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{12,19}$/, "Card number looks wrong")),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY"),
  cvc: z.string().regex(/^\d{3,4}$/, "CVC is 3–4 digits"),
});
export type CardInput = z.infer<typeof CardSchema>;

export const TOPUP_METHODS = ["card", "instapay", "fawry", "mobile_wallet"] as const;
export type TopUpMethod = (typeof TOPUP_METHODS)[number];

export type ChargeResult = { ok: true; reference: string } | { ok: false; reason: string };

export interface PaymentProvider {
  readonly name: "sandbox";
  charge(input: { amountCents: number; method: TopUpMethod; card?: CardInput; description: string }): Promise<ChargeResult>;
  refund(reference: string, amountCents: number): Promise<void>;
}

/** Published test cards, like a real gateway's sandbox. */
export const TEST_CARDS = {
  approved: "4242 4242 4242 4242",
  declined: "4000 0000 0000 0002",
  insufficientFunds: "4000 0000 0000 9995",
} as const;

class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox" as const;

  async charge({ amountCents, method, card }: Parameters<PaymentProvider["charge"]>[0]): Promise<ChargeResult> {
    if (amountCents <= 0) return { ok: false, reason: "Amount must be positive." };
    if (method === "card") {
      if (!card) return { ok: false, reason: "Card details are missing." };
      if (!luhn(card.number)) return { ok: false, reason: "That card number isn't valid." };
      if (isExpired(card.expiry)) return { ok: false, reason: "That card has expired." };
      if (card.number === TEST_CARDS.declined.replaceAll(" ", "")) return { ok: false, reason: "Your bank declined the card." };
      if (card.number === TEST_CARDS.insufficientFunds.replaceAll(" ", "")) {
        return { ok: false, reason: "Insufficient funds on the card." };
      }
    }
    await new Promise((r) => setTimeout(r, 350)); // feel of a network round-trip
    return { ok: true, reference: `sbx_${randomCode(12)}` };
  }

  async refund(): Promise<void> {
    // Sandbox: nothing to do. A real provider would call its refund API here.
  }
}

export const paymentProvider: PaymentProvider = new SandboxProvider();

function luhn(number: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isExpired(expiry: string): boolean {
  const [mm, yy] = expiry.split("/").map(Number) as [number, number];
  const endOfMonth = new Date(2000 + yy, mm, 1);
  return endOfMonth.getTime() <= Date.now();
}
