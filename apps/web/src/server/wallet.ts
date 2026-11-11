import "server-only";
import { Types, type ClientSession } from "mongoose";
import { formatEgp } from "@/lib/money";
import type { WalletTxnDTO } from "@/lib/types";
import { Payment, User, WalletTransaction } from "./db/models";
import { withTransaction } from "./db/mongo";
import { AppError } from "./errors";
import { feed, notify } from "./notifications";
import { paymentProvider, type CardInput, type TopUpMethod } from "./payments";
import { publish } from "./realtime/bus";

/**
 * Wallet = append-only ledger (wallet_transactions) + cached balance on the user.
 * Both change in the same transaction; debits use a guarded $inc so the balance never goes negative.
 */

type Entry = {
  type: "topup" | "payment" | "refund" | "reward" | "adjustment";
  description: string;
  orderId?: Types.ObjectId;
  paymentRef?: string;
};

export async function creditWallet(
  userId: Types.ObjectId | string,
  amountCents: number,
  entry: Entry,
  session?: ClientSession,
): Promise<number> {
  if (amountCents <= 0) throw new AppError("invalid_amount", "Amount must be positive.");
  const user = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { walletCents: amountCents } },
    { new: true, session, projection: { walletCents: 1 } },
  ).lean();
  if (!user) throw new AppError("not_found", "Account not found.", 404);
  await WalletTransaction.create([{ userId, amountCents, balanceAfterCents: user.walletCents, ...entry }], { session });
  return user.walletCents;
}

export async function debitWallet(
  userId: Types.ObjectId | string,
  amountCents: number,
  entry: Omit<Entry, "type">,
  session?: ClientSession,
): Promise<number> {
  const user = await User.findOneAndUpdate(
    { _id: userId, walletCents: { $gte: amountCents } },
    { $inc: { walletCents: -amountCents } },
    { new: true, session, projection: { walletCents: 1 } },
  ).lean();
  if (!user) throw new AppError("insufficient_funds", "Not enough balance in your wallet.", 402);
  await WalletTransaction.create(
    [{ userId, type: "payment", amountCents: -amountCents, balanceAfterCents: user.walletCents, ...entry }],
    { session },
  );
  return user.walletCents;
}

export async function walletHistory(userId: string, limit = 30): Promise<WalletTxnDTO[]> {
  const docs = await WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map((d) => ({
    id: String(d._id),
    type: d.type,
    amountCents: d.amountCents,
    balanceAfterCents: d.balanceAfterCents,
    description: d.description,
    createdAt: (d as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function topUp(
  userId: string,
  input: { amountCents: number; method: TopUpMethod; card?: CardInput },
): Promise<{ walletCents: number }> {
  const charge = await paymentProvider.charge({ ...input, description: "Wallet top-up" });
  if (!charge.ok) throw new AppError("payment_declined", charge.reason, 402);

  const methodLabel = { card: "card", instapay: "InstaPay", fawry: "Fawry", mobile_wallet: "mobile wallet" }[input.method];
  try {
    const walletCents = await withTransaction(async (session) => {
      await Payment.create(
        [
          {
            userId,
            purpose: "topup",
            method: input.method,
            provider: "sandbox",
            amountCents: input.amountCents,
            status: "succeeded",
            providerRef: charge.reference,
          },
        ],
        { session },
      );
      return creditWallet(userId, input.amountCents, {
        type: "topup",
        description: `Top-up via ${methodLabel}`,
        paymentRef: charge.reference,
      }, session);
    });
    publish(`user:${userId}`, { type: "me" });
    feed("payment", `Wallet top-up ${formatEgp(input.amountCents)} via ${methodLabel}`);
    return { walletCents };
  } catch (error) {
    await paymentProvider.refund(charge.reference, input.amountCents);
    throw error;
  }
}

/** Admin goodwill credit, e.g. after a complaint. */
export async function adminCredit(userId: string, amountCents: number, reason: string): Promise<number> {
  const balance = await withTransaction((session) =>
    creditWallet(userId, amountCents, { type: "adjustment", description: reason }, session),
  );
  await notify(userId, { kind: "system", title: `${formatEgp(amountCents)} added to your wallet`, body: reason, href: "/wallet" });
  publish(`user:${userId}`, { type: "me" });
  return balance;
}
