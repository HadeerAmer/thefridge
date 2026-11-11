import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { formatEgp } from "@/lib/money";
import { Issue, Order, ProductRequest } from "./db/models";
import { withTransaction } from "./db/mongo";
import { Errors } from "./errors";
import { feed, notify } from "./notifications";
import { publish } from "./realtime/bus";
import { creditWallet } from "./wallet";

/** "Item didn't drop" reports with wallet refunds, and member product requests + votes. */

export const IssueInputSchema = z.object({
  kind: z.enum(["not_dispensed", "wrong_item", "quality", "other"]),
  message: z.string().trim().min(3).max(500),
});

const ISSUE_LABELS: Record<z.infer<typeof IssueInputSchema>["kind"], string> = {
  not_dispensed: "Item didn't drop",
  wrong_item: "Wrong item",
  quality: "Quality problem",
  other: "Something else",
};

export async function reportIssue(userId: string, orderId: string, input: z.infer<typeof IssueInputSchema>) {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound("Order");
  const order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) throw Errors.notFound("Order");
  const open = await Issue.findOne({ orderId: order._id, status: "open" }).lean();
  if (open) throw Errors.conflict("We're already looking into this order.");
  await Issue.create({ userId, orderId: order._id, orderNumber: order.number, ...input });
  feed("issue", `🆘 ${ISSUE_LABELS[input.kind]} on ${order.number}: “${input.message.slice(0, 80)}”`);
  return { ok: true };
}

export async function listIssues(status?: string) {
  const issues = await Issue.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(50).populate("userId", "name phone").lean();
  const orders = new Map(
    (await Order.find({ _id: { $in: issues.map((i) => i.orderId) } }, { totals: 1, machineId: 1, items: 1 }).lean()).map((o) => [
      String(o._id),
      o,
    ]),
  );
  return issues.map((i) => {
    const order = orders.get(String(i.orderId));
    const user = i.userId as unknown as { name?: string; phone?: string } | null;
    return {
      id: String(i._id),
      orderId: String(i.orderId),
      orderNumber: i.orderNumber,
      kind: i.kind,
      kindLabel: ISSUE_LABELS[i.kind],
      message: i.message,
      status: i.status,
      refundCents: i.refundCents ?? 0,
      orderTotalCents: order?.totals.totalCents ?? 0,
      machineId: order?.machineId ?? "",
      items: order?.items.map((it) => `${it.qty}× ${it.name}`).join(", ") ?? "",
      customer: user?.name ?? "Customer",
      phone: user?.phone ?? "",
      createdAt: (i as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    };
  });
}

export async function refundIssue(issueId: string, amountCents?: number) {
  const issue = await Issue.findById(issueId).lean();
  if (!issue || issue.status !== "open") throw Errors.conflict("This issue is already closed.");
  const order = await Order.findById(issue.orderId).lean();
  if (!order) throw Errors.notFound("Order");
  const refund = Math.min(amountCents ?? order.totals.totalCents, order.totals.totalCents);

  await withTransaction(async (session) => {
    const updated = await Issue.updateOne(
      { _id: issue._id, status: "open" },
      { $set: { status: "refunded", refundCents: refund, resolvedAt: new Date() } },
      { session },
    );
    if (updated.modifiedCount === 0) throw Errors.conflict("This issue is already closed.");
    await creditWallet(issue.userId, refund, { type: "refund", description: `Refund · ${ISSUE_LABELS[issue.kind]} (${order.number})`, orderId: order._id }, session);
  });
  await notify(issue.userId, {
    kind: "order",
    title: "Sorry about that — refunded",
    body: `${formatEgp(refund)} is back in your wallet for order ${order.number}.`,
    href: "/wallet",
  });
  publish(`user:${String(issue.userId)}`, { type: "me" });
  feed("issue", `Refunded ${formatEgp(refund)} for ${order.number}`);
}

export async function resolveIssue(issueId: string, status: "resolved" | "rejected") {
  await Issue.updateOne({ _id: issueId, status: "open" }, { $set: { status, resolvedAt: new Date() } });
}

// ------------------------------------------------------------------ product requests

export const ProductRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  note: z.string().trim().max(280).optional(),
});

export async function listProductRequests(userId?: string | null) {
  const docs = await ProductRequest.find().sort({ votes: -1, createdAt: -1 }).limit(30).lean();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    note: d.note ?? null,
    votes: d.votes ?? 0,
    voted: userId ? (d.voterIds ?? []).some((v) => String(v) === userId) : false,
  }));
}

export async function createProductRequest(userId: string, input: z.infer<typeof ProductRequestSchema>) {
  const existing = await ProductRequest.findOne({ name: new RegExp(`^${escapeRegex(input.name)}$`, "i") });
  if (existing) return voteProductRequest(userId, String(existing._id));
  await ProductRequest.create({ userId, ...input, voterIds: [userId], votes: 1 });
  feed("issue", `💡 New product request: “${input.name}”`);
}

export async function voteProductRequest(userId: string, requestId: string) {
  if (!Types.ObjectId.isValid(requestId)) throw Errors.notFound("Request");
  // $addToSet + guarded $inc: one vote per member.
  await ProductRequest.updateOne(
    { _id: requestId, voterIds: { $ne: new Types.ObjectId(userId) } },
    { $addToSet: { voterIds: new Types.ObjectId(userId) }, $inc: { votes: 1 } },
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
