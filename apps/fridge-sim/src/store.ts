import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FleetState } from "./domain/types";

/** Machine state lives in a JSON file, like a controller's local storage. */

export function loadState(file: string): FleetState | null {
  const path = resolve(file);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as FleetState;
    return parsed.version === 1 ? parsed : null;
  } catch (error) {
    console.warn(`[store] Ignoring unreadable state file ${path}:`, error);
    return null;
  }
}

export function saveStateNow(file: string, state: FleetState): void {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path); // atomic replace so a crash never leaves half a file
}

/** Coalesces bursts of writes into one write every `delayMs`. */
export function createPersister(file: string, delayMs = 250) {
  let timer: NodeJS.Timeout | null = null;
  let latest: FleetState | null = null;

  const flush = () => {
    timer = null;
    if (latest) saveStateNow(file, latest);
  };

  return {
    schedule(state: FleetState) {
      latest = state;
      timer ??= setTimeout(flush, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
