import "server-only";
import { connectDb } from "./db/mongo";
import { runDeliveryAutopilot } from "./delivery";
import { syncFleet } from "./inventory";
import { expireOverdueOrders } from "./orders/service";

/**
 * Background work for this server process (started from instrumentation.ts):
 * - every 3 s: expire overdue reservations, move deliveries along
 * - fleet sync: right away, then every minute (every 10 s while the fridges are unreachable)
 * Production would run these on a scheduler/queue with a lock, not in the web process.
 */
const globalForJobs = globalThis as unknown as { __jobsStarted?: boolean };

export function startBackgroundJobs(): void {
  if (globalForJobs.__jobsStarted) return;
  globalForJobs.__jobsStarted = true;

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await connectDb();
      await expireOverdueOrders();
      await runDeliveryAutopilot();
    } catch (error) {
      console.error("[jobs] tick failed:", error instanceof Error ? error.message : error);
    } finally {
      busy = false;
    }
  }, 3000);

  const syncLoop = async () => {
    let reachable = false;
    try {
      await connectDb();
      reachable = await syncFleet();
      if (!reachable) console.warn("[jobs] fridge fleet unreachable — retrying in 10 s");
    } catch (error) {
      console.error("[jobs] fleet sync failed:", error instanceof Error ? error.message : error);
    }
    setTimeout(syncLoop, reachable ? 60_000 : 10_000);
  };
  setTimeout(syncLoop, 1500);
}
