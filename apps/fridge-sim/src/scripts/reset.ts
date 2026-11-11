import { config } from "../config";
import { Fleet } from "../domain/fleet";
import { saveStateNow } from "../store";

// Writes day-one shelves for every machine. Run while the simulator is stopped
// (when it is running, use the "Reset all machines" button or POST /sim/reset).
saveStateNow(config.DATA_FILE, Fleet.fresh());
console.log(`Fridge simulator state reset → ${config.DATA_FILE}`);
