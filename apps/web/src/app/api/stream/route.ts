import { getSession } from "@/server/auth/session";
import { subscribe, type Channel } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: live stock + machine status for everyone,
 * plus the signed-in user's orders/notifications, plus the admin feed for admins.
 */
export async function GET(req: Request) {
  const session = await getSession();
  const channels: Channel[] = ["public"];
  if (session) channels.push(`user:${session.userId}`);
  if (session?.role === "admin") channels.push("admin");

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("ready", { signedIn: Boolean(session), admin: session?.role === "admin" });
      const unsubscribe = subscribe(channels, (event) => send("message", event));
      const ping = setInterval(() => send("ping", Date.now()), 25_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
