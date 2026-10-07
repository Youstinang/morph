import type { EventBus } from "@/events/bus";
import type { InputValue } from "@/state/input-controls";
import type { WorkspaceStore } from "@/state/store";
import type { World } from "./types";
import { createWorld, reactToEvent, stepWorld, type WorldReport } from "./world";

/** What the world needs from the run it shows: its events, its cycle, and a hook into its clock. */
export interface WorldHost {
  readonly bus: EventBus;
  readonly cycle: number;
  attach(stage: { onCycle?(cycle: number): void; beforeStep?(time: number): void; afterStep?(dt: number): void }): () => void;
}

export interface WorldView {
  readonly world: World;
  detach(): void;
}

/**
 * Puts the 3D world on a run: the world reacts to the run's events, animates on the run's clock, reports
 * arrivals and landed handoffs back, and is rebuilt empty whenever the run clears the deck.
 */
export function attachWorld(host: WorldHost): WorldView {
  let world = createWorld(host.cycle);
  const report: WorldReport = (draft) => host.bus.publish(draft, "world");
  const offEvents = host.bus.subscribe((event) => {
    if (event.cycle === world.cycle) reactToEvent(world, event, report);
  });
  const offClock = host.attach({
    onCycle: (cycle) => (world = createWorld(cycle)),
    beforeStep: (time) => (world.time = time),
    afterStep: (dt) => stepWorld(world, dt, report),
  });
  return {
    get world() {
      return world;
    },
    detach() {
      offEvents();
      offClock();
    },
  };
}

/** What the lab screen drives: a run with the world attached. */
export interface LabSession {
  readonly bus: EventBus;
  readonly store: WorkspaceStore;
  readonly world: World;
  readonly mode: "demo" | "real";
  /** Counts real time at `speed` and returns the world to render. */
  advance(realSeconds: number, speed: number): World;
  restart(): void;
  startLive(objective: string): void;
  /** The user's answer to a pending question, as a value its control accepts. */
  answerInput(requestId: string, value: InputValue): boolean;
  skipInput(requestId: string): boolean;
  /** The user has started answering; the demo stops answering for them. */
  holdInput(): void;
}
