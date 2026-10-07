import type { WorkspaceEvent } from "@/events/schema";
import { narrate } from "./narration";
import type { CoreState, LogEntry, World } from "./sim/types";
import { coreState } from "./sim/world";

/** Seconds between the snapshots the HUD reads. */
export const SNAPSHOT_INTERVAL = 0.14;

/** World-side HUD data: the clock, the Core's look and the narration. Facts come from the workspace store. */
export interface LabSnapshot {
  time: number;
  cycle: number;
  core: CoreState;
  log: LogEntry[];
  caption: LogEntry | null;
}

export function takeSnapshot(world: World, history: readonly WorkspaceEvent[]): LabSnapshot {
  const lines: LogEntry[] = [];
  for (const event of history) {
    if (event.cycle !== world.cycle) continue;
    const line = narrate(event);
    if (line) lines.push(line);
  }
  return {
    time: world.time,
    cycle: world.cycle,
    core: coreState(world),
    log: lines.slice(-8).reverse(),
    caption: lines.findLast((entry) => entry.beat) ?? null,
  };
}
