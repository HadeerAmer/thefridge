import { serve } from "@hono/node-server";
import { config } from "./config";
import { CloudClient } from "./cloud";
import { Fleet } from "./domain/fleet";
import { createApp } from "./http/app";
import { createPersister, loadState } from "./store";
import { Touchscreen } from "./touchscreen";

const persister = createPersister(config.DATA_FILE);
const fleet = new Fleet(loadState(config.DATA_FILE) ?? Fleet.fresh(), (state) => persister.schedule(state));
const cloud = new CloudClient({ cloudUrl: config.CLOUD_URL, secret: config.WEBHOOK_SECRET });
const touchscreen = new Touchscreen(fleet, cloud);

fleet.on("machineEvent", (event) => cloud.publish(event));
cloud.start();
persister.schedule(fleet.snapshot);
// On boot a machine re-announces what is on its shelves, so the cloud can resync.
fleet.announce();

// Machine clock: expire holds every second, cooling drift every 5 s, heartbeat every minute.
let seconds = 0;
const clock = setInterval(() => {
  seconds += 1;
  fleet.expireHolds();
  if (seconds % 5 === 0) fleet.tick({ heartbeat: seconds % 60 === 0 });
}, 1000);

const app = createApp({ fleet, cloud, touchscreen, config });
const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`🧊 Fridge simulator ready → http://localhost:${info.port}  (API docs: /docs)`);
  console.log(`   Sending webhooks to ${config.CLOUD_URL}`);
});

function shutdown() {
  clearInterval(clock);
  cloud.stop();
  persister.flush();
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
