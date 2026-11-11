import "server-only";
import { EventEmitter } from "node:events";
import type { RealtimeEvent } from "@/lib/types";

/**
 * In-process pub/sub feeding the SSE stream (/api/stream).
 * Channels: "public" (stock + machine status), "admin", and "user:<id>".
 * Production with several instances would swap this for Redis pub/sub — same interface.
 */
export type Channel = "public" | "admin" | `user:${string}`;

const globalForBus = globalThis as unknown as { __bus?: EventEmitter };
const emitter = (globalForBus.__bus ??= new EventEmitter().setMaxListeners(0));

export function publish(channel: Channel, event: RealtimeEvent): void {
  emitter.emit(channel, event);
}

export function subscribe(channels: Channel[], listener: (event: RealtimeEvent, channel: Channel) => void): () => void {
  const handlers = channels.map((channel) => {
    const handler = (event: RealtimeEvent) => listener(event, channel);
    emitter.on(channel, handler);
    return [channel, handler] as const;
  });
  return () => handlers.forEach(([channel, handler]) => emitter.off(channel, handler));
}
