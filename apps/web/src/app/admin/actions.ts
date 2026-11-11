"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { Product } from "@/server/db/models";
import { connectDb } from "@/server/db/mongo";
import { adminAdvanceDelivery } from "@/server/delivery";
import { AppError } from "@/server/errors";
import { refundIssue, resolveIssue } from "@/server/feedback";
import { syncMachine } from "@/server/inventory";
import { machineGateway } from "@/server/machines/gateway";
import { feed } from "@/server/notifications";
import { saveSettings, SettingsSchema, type Settings } from "@/server/settings";
import { adminCredit } from "@/server/wallet";

/** Admin mutations. Every action re-checks the admin session and returns { ok, message }. */

type Result = { ok: true; message?: string } | { ok: false; message: string };

async function guard<T>(work: () => Promise<T>, success?: string, paths: string[] = ["/admin"]): Promise<Result> {
  try {
    await requireAdmin();
    await connectDb();
    await work();
    for (const p of paths) revalidatePath(p);
    return { ok: true, message: success };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    console.error("[admin action]", error);
    return { ok: false, message: "Something went wrong." };
  }
}

export async function saveSettingsAction(settings: Settings): Promise<Result> {
  return guard(async () => {
    await saveSettings(SettingsSchema.parse(settings));
    feed("machine", `⚙️ Settings updated — reservations held ${settings.reservation.holdMinutes} min`);
  }, "Settings saved", ["/admin/settings"]);
}

export async function updateProductAction(id: string, patch: { priceEgp?: number; isActive?: boolean }): Promise<Result> {
  const input = z.object({ priceEgp: z.number().min(1).max(5000).optional(), isActive: z.boolean().optional() }).parse(patch);
  return guard(async () => {
    const set: Record<string, unknown> = {};
    if (input.priceEgp !== undefined) set.priceCents = Math.round(input.priceEgp) * 100;
    if (input.isActive !== undefined) set.isActive = input.isActive;
    const product = await Product.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!product) throw new AppError("not_found", "Product not found", 404);
    feed("stock", `Menu updated: ${product.name}${input.priceEgp ? ` now EGP ${input.priceEgp}` : ""}${input.isActive === false ? " (hidden)" : ""}`);
  }, "Product updated", ["/admin/products"]);
}

export async function advanceDeliveryAction(orderId: string): Promise<Result> {
  return guard(() => adminAdvanceDelivery(orderId), "Moved to the next step", ["/admin/delivery", "/admin/orders"]);
}

export async function refundIssueAction(issueId: string): Promise<Result> {
  return guard(() => refundIssue(issueId), "Refunded to the customer's wallet", ["/admin/feedback"]);
}

export async function resolveIssueAction(issueId: string, status: "resolved" | "rejected"): Promise<Result> {
  return guard(() => resolveIssue(issueId, status), status === "resolved" ? "Marked resolved" : "Closed", ["/admin/feedback"]);
}

export async function setNoticeAction(machineId: string, message: string | null): Promise<Result> {
  return guard(async () => {
    // Sent to the machine; its machine.status webhook updates the app for everyone.
    await machineGateway.setNotice(machineId, message?.trim() ? message.trim().slice(0, 280) : null);
  }, message ? "Notice sent to the fridge" : "Notice cleared", ["/admin/machines"]);
}

export async function syncMachineAction(machineId: string): Promise<Result> {
  return guard(async () => {
    const ok = await syncMachine(machineId);
    if (!ok) throw new AppError("machine_unreachable", "Couldn't reach that fridge.", 503);
  }, "Stock re-synced from the fridge", ["/admin/machines"]);
}

export async function creditCustomerAction(userId: string, amountEgp: number, reason: string): Promise<Result> {
  const input = z.object({ amountEgp: z.number().int().min(1).max(2000), reason: z.string().trim().min(3).max(120) }).parse({ amountEgp, reason });
  return guard(() => adminCredit(userId, input.amountEgp * 100, input.reason), `EGP ${input.amountEgp} credited`, ["/admin/customers"]);
}
