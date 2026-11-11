import "server-only";
import { randomInt } from "node:crypto";

// No 0/O/1/I/L — codes get read aloud and typed on a machine keypad.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const newOrderNumber = () => `TF-${randomCode(5)}`;
export const newWalkUpNumber = () => `M-${randomCode(5)}`;
/** Shown as a QR in the app and typed/scanned at the fridge. */
export const newPickupCode = () => `TF-${randomCode(6)}`;
export const newCourierCode = () => `CR-${randomCode(6)}`;
export const newReferralCode = (name: string) =>
  `${name.replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase() || "FRIDGE"}${randomCode(3)}`;
