import { createEventBus, type EventBus } from "@/events/bus";
import { connectWorkspace } from "@/state/apply-event";
import { createUaeWorkspace } from "@/state/fixtures/uae-market";
import { createOperationGate, type OperationGate } from "@/state/gate";
import { createLiveWorkspace } from "@/state/plan";
import { createWorkspaceStore, type WorkspaceStore } from "@/state/store";
import { createLiveRunner, type LiveRunner, type PlanRequester } from "./live-runner";
import { createStoryRunner, type StoryRunner } from "./runner";
import type { World } from "./types";
import { createWorld, reactToEvent, stepWorld, type WorldReport } from "./world";

export const LOOP_RESTART_DELAY = 7;
export const WORKSPACE_ID = "uae-market-entry";
export const LIVE_WORKSPACE_ID = "live-question";

export interface DemoSession {
  readonly bus: EventBus;
  readonly store: WorkspaceStore;
  readonly gate: OperationGate;
  readonly world: World;
  /** The demo story runner; while a live question runs, the last demo runner (already stopped). */
  readonly runner: StoryRunner;
  /** The live runner while a typed question is being worked on, otherwise null. */
  readonly live: LiveRunner | null;
  readonly mode: "demo" | "real";
  step(dt: number): void;
  /** Starts (or restarts) the recorded demo. */
  restart(): void;
  /** Clears the deck and works on the user's own question with the real planner. */
  startLive(objective: string, requestPlan: PlanRequester): void;
  /** Trusted user input from the HUD. */
  answerBudget(): boolean;
}

/**
 * One run at a time on one clock. A runner — the scripted demo story or a live question — publishes
 * activity events and proposes operations through the gate; the gate applies accepted operations to the
 * canonical store and announces them; the world reacts to events and reports arrivals and landed handoffs
 * back; the HUD reads the store and the history. Starting a run clears the deck (a new cycle).
 */
export function createDemoSession(): DemoSession {
  let time = 0;
  let cycle = 0;
  let mode: "demo" | "real" = "demo";
  const bus = createEventBus({ clock: () => ({ at: time, cycle }) });
  const store = createWorkspaceStore(createUaeWorkspace());
  connectWorkspace(bus, store, () => (mode === "demo" ? createUaeWorkspace() : createLiveWorkspace(LIVE_WORKSPACE_ID)));
  const gate = createOperationGate(store, bus, () => time);
  let world = createWorld(cycle);
  const report: WorldReport = (draft) => bus.publish(draft, "world");
  bus.subscribe((event) => {
    if (event.cycle === world.cycle) reactToEvent(world, event, report);
  });
  let runner = createStoryRunner(bus, gate, () => time, cycle, LOOP_RESTART_DELAY);
  let live: LiveRunner | null = null;

  const begin = () =>
    bus.publish({ type: "run_started", workspaceId: mode === "demo" ? WORKSPACE_ID : LIVE_WORKSPACE_ID, mode }, mode === "demo" ? "demo" : "user");
  begin();

  function clear() {
    runner.dispose();
    live?.dispose();
    live = null;
    cycle += 1;
    time = 0;
    world = createWorld(cycle);
  }

  function restart() {
    clear();
    mode = "demo";
    runner = createStoryRunner(bus, gate, () => time, cycle, LOOP_RESTART_DELAY);
    begin();
  }

  return {
    bus,
    store,
    gate,
    get world() {
      return world;
    },
    get runner() {
      return runner;
    },
    get live() {
      return live;
    },
    get mode() {
      return mode;
    },
    step(dt) {
      time += dt;
      world.time = time;
      if (live) live.step(dt);
      else runner.step(dt);
      stepWorld(world, dt, report);
      if (!live && runner.endedAt !== null && time - runner.endedAt >= LOOP_RESTART_DELAY) restart();
    },
    restart,
    startLive(objective, requestPlan) {
      clear();
      mode = "real";
      begin();
      live = createLiveRunner(bus, gate, () => time, cycle, objective, requestPlan);
    },
    answerBudget: () => (live ? false : runner.answer("budget", "user")),
  };
}
