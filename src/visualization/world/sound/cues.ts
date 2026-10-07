import type { WorkspaceEvent } from "@/events/schema";

/**
 * The few moments that get a sound, each tied to a real event. Sound only accompanies what the screen
 * already shows; nothing is said by sound alone.
 */
export type Cue = "core" | "dispatch" | "transfer" | "materialize" | "challenge" | "shift" | "converge";

const CUE_FOR: Partial<Record<WorkspaceEvent["type"], Cue>> = {
  objective_received: "core",
  task_assigned: "dispatch",
  artifact_handoff_completed: "transfer",
  module_created: "materialize",
  assumption_challenged: "challenge",
  scenario_updated: "shift",
  recommendation_updated: "converge",
};

/** A burst of the same event (several stations opening at once) sounds once. */
export const SAME_CUE_GAP_MS = 700;
/** Different cues never pile on top of each other. */
export const ANY_CUE_GAP_MS = 150;

/** Turns events into cues, dropping repeats that would turn into noise. */
export function createCuePlanner() {
  const lastPlayed = new Map<Cue, number>();
  let lastAny = Number.NEGATIVE_INFINITY;
  return {
    plan(event: WorkspaceEvent, nowMs: number): Cue | null {
      const cue = CUE_FOR[event.type];
      if (!cue) return null;
      if (nowMs - (lastPlayed.get(cue) ?? Number.NEGATIVE_INFINITY) < SAME_CUE_GAP_MS) return null;
      if (nowMs - lastAny < ANY_CUE_GAP_MS) return null;
      lastPlayed.set(cue, nowMs);
      lastAny = nowMs;
      return cue;
    },
  };
}
