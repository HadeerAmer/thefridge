import "server-only";
import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import type { FeedItem, NotificationDTO } from "@/lib/types";
import { Notification } from "./db/models";
import { publish } from "./realtime/bus";

type NotificationInput = Pick<NotificationDTO, "kind" | "title" | "body"> & { href?: string | null };

function toDTO(doc: {
  _id: unknown;
  kind: NotificationDTO["kind"];
  title: string;
  body: string;
  href?: string | null;
  createdAt?: Date;
  readAt?: Date | null;
}): NotificationDTO {
  return {
    id: String(doc._id),
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    href: doc.href ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
  };
}

/** Stores an in-app notification and pushes it to the user's open apps. */
export async function notify(userId: Types.ObjectId | string, input: NotificationInput): Promise<NotificationDTO> {
  const doc = await Notification.create({ userId, ...input, href: input.href ?? undefined });
  const dto = toDTO(doc.toObject());
  publish(`user:${String(userId)}`, { type: "notification", notification: dto });
  return dto;
}

export async function listNotifications(userId: string, limit = 20): Promise<NotificationDTO[]> {
  const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map((d) => toDTO(d as Parameters<typeof toDTO>[0]));
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}

// ------------------------------------------------------------------ admin live feed

const globalForFeed = globalThis as unknown as { __feed?: FeedItem[] };
const feedBuffer = (globalForFeed.__feed ??= []);

/** One line in the admin dashboard's live activity feed. */
export function feed(kind: FeedItem["kind"], text: string): void {
  const item: FeedItem = { id: randomUUID(), at: new Date().toISOString(), kind, text };
  feedBuffer.unshift(item);
  feedBuffer.splice(40);
  publish("admin", { type: "feed", item });
}

export function recentFeed(): FeedItem[] {
  return [...feedBuffer];
}
