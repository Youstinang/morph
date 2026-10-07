import { createEventBus, type EventBus } from "@/events/bus";
import { connectWorkspace } from "@/state/apply-event";
import { createUaeWorkspace } from "@/state/fixtures/uae-market";
import { createOperationGate, type OperationGate } from "@/state/gate";
import { createLiveWorkspace } from "@/state/plan";
import { createWorkspaceStore, type WorkspaceStore } from "@/state/store";
import { createDemoRuntime, type DemoRuntime } from "./demo/runtime";
import { createLiveQuestion, type LiveQuestion, type PlanRequester } from "./live-question";

/** The run clock's fixed step. Every run advances in these steps, whatever the display's frame rate. */
export const FIXED_STEP = 1 / 60;
/** Longest stretch of real time one `advance` call counts, so a stalled tab doesn't fast-forward the story. */
export const MAX_FRAME = 0.1;
export const LOOP_RESTART_DELAY = 7;
export const DEMO_WORKSPACE_ID = "uae-market-entry";
export const LIVE_WORKSPACE_ID = "live-question";

export type RunMode = "demo" | "real";

/**
 * Something that shows a run, such as the 3D world. `onCycle` fires when the deck is cleared for a new run,
 * before its first event; `beforeStep` and `afterStep` bracket each fixed step of the runtime.
 */
export interface RunStage {
  onCycle?(cycle: number): void;
  beforeStep?(time: number): void;
  afterStep?(dt: number): void;
}

export interface RunController {
  readonly bus: EventBus;
  readonly store: WorkspaceStore;
  readonly gate: OperationGate;
  readonly time: number;
  readonly cycle: number;
  readonly mode: RunMode;
  /** The demo runtime; while a live question runs, the last demo runtime (already stopped). */
  readonly demo: DemoRuntime;
  /** The live question being worked on, otherwise null. */
  readonly live: LiveQuestion | null;
  /** Counts real time (scaled by `speed`) and runs as many fixed steps as it covers; returns how many ran. */
  advance(realSeconds: number, speed?: number): number;
  step(dt: number): void;
  /** Starts (or restarts) the recorded demo. */
  restart(): void;
  /** Clears the deck and works on the user's own question with the real planner. */
  startLive(objective: string): void;
  /** Trusted user input: confirms the demo's budget question. */
  answerBudget(): boolean;
  attach(stage: RunStage): () => void;
}

export interface RunControllerOptions {
  /** How live questions reach the planner; without it, live questions fail with a plain reason. */
  requestPlan?: PlanRequester;
}

const notConnected: PlanRequester = async () => ({ ok: false, reason: "live AI isn't connected here" });

/**
 * One run at a time on one deterministic clock. A runtime — the recorded demo or a live question —
 * publishes activity events and proposes operations through the gate; the gate applies accepted operations
 * to the canonical store and announces them; attached stages (the 3D world) react to the events and report
 * arrivals and landed handoffs back. Starting a run clears the deck: a new cycle, the clock back at zero.
 */
export function createRunController(options: RunControllerOptions = {}): RunController {
  const requestPlan = options.requestPlan ?? notConnected;
  let time = 0;
  let cycle = 0;
  let mode: RunMode = "demo";
  let accumulator = 0;
  const stages = new Set<RunStage>();
  const bus = createEventBus({ clock: () => ({ at: time, cycle }) });
  const store = createWorkspaceStore(createUaeWorkspace());
  connectWorkspace(bus, store, () => (mode === "demo" ? createUaeWorkspace() : createLiveWorkspace(LIVE_WORKSPACE_ID)));
  const gate = createOperationGate(store, bus, () => time);
  let demo = createDemoRuntime(bus, gate, () => time, cycle, LOOP_RESTART_DELAY);
  let live: LiveQuestion | null = null;

  const begin = () =>
    bus.publish({ type: "run_started", workspaceId: mode === "demo" ? DEMO_WORKSPACE_ID : LIVE_WORKSPACE_ID, mode }, mode === "demo" ? "demo" : "user");

  function clear(next: RunMode) {
    demo.dispose();
    live?.dispose();
    live = null;
    cycle += 1;
    time = 0;
    accumulator = 0;
    mode = next;
    stages.forEach((stage) => stage.onCycle?.(cycle));
  }

  function restart() {
    clear("demo");
    demo = createDemoRuntime(bus, gate, () => time, cycle, LOOP_RESTART_DELAY);
    begin();
  }

  function step(dt: number) {
    time += dt;
    stages.forEach((stage) => stage.beforeStep?.(time));
    if (live) live.step(dt);
    else demo.step(dt);
    stages.forEach((stage) => stage.afterStep?.(dt));
    if (!live && demo.endedAt !== null && time - demo.endedAt >= LOOP_RESTART_DELAY) restart();
  }

  begin();

  return {
    bus,
    store,
    gate,
    get time() {
      return time;
    },
    get cycle() {
      return cycle;
    },
    get mode() {
      return mode;
    },
    get demo() {
      return demo;
    },
    get live() {
      return live;
    },
    advance(realSeconds, speed = 1) {
      accumulator += Math.min(Math.max(realSeconds, 0), MAX_FRAME) * speed;
      let steps = 0;
      while (accumulator >= FIXED_STEP) {
        accumulator -= FIXED_STEP;
        step(FIXED_STEP);
        steps += 1;
      }
      return steps;
    },
    step,
    restart,
    startLive(objective) {
      clear("real");
      begin();
      live = createLiveQuestion(bus, gate, () => time, cycle, objective, requestPlan);
    },
    answerBudget: () => (live ? false : demo.answer("budget", "user")),
    attach(stage) {
      stages.add(stage);
      return () => stages.delete(stage);
    },
  };
}
