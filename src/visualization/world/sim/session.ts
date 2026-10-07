import { createEventBus, type EventBus } from "@/events/bus";
import { createStoryRunner, type StoryRunner } from "./runner";
import type { World } from "./types";
import { createWorld, reactToEvent, stepWorld, type WorldReport } from "./world";

export const LOOP_RESTART_DELAY = 7;
export const WORKSPACE_ID = "uae-market-entry";

export interface DemoSession {
  readonly bus: EventBus;
  readonly world: World;
  readonly runner: StoryRunner;
  step(dt: number): void;
  restart(): void;
  /** Trusted user input from the HUD. */
  answerBudget(): boolean;
}

/**
 * One demo run on one clock: the story runner publishes events, the world reacts to them and reports
 * arrivals and landed handoffs back, and every other listener (the workspace store, the HUD history)
 * subscribes to the same bus.
 */
export function createDemoSession(): DemoSession {
  let time = 0;
  let cycle = 0;
  const bus = createEventBus({ clock: () => ({ at: time, cycle }) });
  let world = createWorld(cycle);
  const report: WorldReport = (draft) => bus.publish(draft, "world");
  bus.subscribe((event) => {
    if (event.cycle === world.cycle) reactToEvent(world, event, report);
  });
  let runner = createStoryRunner(bus, () => time, cycle, LOOP_RESTART_DELAY);

  const begin = () => bus.publish({ type: "run_started", workspaceId: WORKSPACE_ID, mode: "demo" }, "demo");
  begin();

  function restart() {
    runner.dispose();
    cycle += 1;
    time = 0;
    world = createWorld(cycle);
    runner = createStoryRunner(bus, () => time, cycle, LOOP_RESTART_DELAY);
    begin();
  }

  return {
    bus,
    get world() {
      return world;
    },
    get runner() {
      return runner;
    },
    step(dt) {
      time += dt;
      world.time = time;
      runner.step(dt);
      stepWorld(world, dt, report);
      if (runner.endedAt !== null && time - runner.endedAt >= LOOP_RESTART_DELAY) restart();
    },
    restart,
    answerBudget: () => runner.answer("budget", "user"),
  };
}
