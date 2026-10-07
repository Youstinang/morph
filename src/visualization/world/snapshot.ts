import type { CoreState, LogEntry, World } from "./sim/types";
import { coreState } from "./sim/world";

/** World-side HUD data: the clock, the Core's look and the narration. Facts come from the workspace store. */
export interface LabSnapshot {
  time: number;
  cycle: number;
  core: CoreState;
  log: LogEntry[];
  caption: LogEntry | null;
}

export function takeSnapshot(world: World): LabSnapshot {
  return {
    time: world.time,
    cycle: world.cycle,
    core: coreState(world),
    log: world.log.slice(-8).reverse(),
    caption: world.log.findLast((entry) => entry.beat) ?? null,
  };
}
