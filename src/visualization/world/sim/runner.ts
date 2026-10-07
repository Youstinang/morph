import type { EventBus } from "@/events/bus";
import type { AgentTarget, EventDraft } from "@/events/schema";
import { HUMAN_INPUTS, UAE_TIMELINE } from "@/state/fixtures/uae-market";
import { AGENT_ORDER } from "./roster";
import { BUDGET_AUTO_CONFIRM_SECONDS, SCRIPT } from "./script";
import type { Action, AgentId, AgentState, Target } from "./types";

/**
 * Prototype demo runtime: plays each agent's script by publishing events, and waits for the world to report
 * arrivals and landed handoffs before moving on. It never touches the world directly. Phase 13 replaces it
 * with the deterministic demo runtime in the orchestration layer.
 */

const toTarget = (target: Target): AgentTarget =>
  "zone" in target ? { kind: "module", moduleId: target.zone } : "core" in target ? { kind: "core" } : { kind: "home" };

interface Cursor {
  index: number;
  elapsed: number;
  started: boolean;
  announced: boolean;
  hasWorked: boolean;
  /** What the agent was last shown doing, so repeated states aren't re-published. */
  shown: { state: AgentState; task: string };
  awaiting: { kind: "arrival" } | { kind: "artifact"; artifactId: string; signal: string } | null;
  sources: number;
  done: boolean;
}

export interface StoryRunner {
  step(dt: number): void;
  /** Answers a pending human-input request; returns false if nothing is waiting for it. */
  answer(requestId: keyof typeof HUMAN_INPUTS, by: "user" | "autoplay"): boolean;
  readonly endedAt: number | null;
  readonly signals: ReadonlyMap<string, number>;
  dispose(): void;
}

export const OBJECTIVE_AT = 0.6;
const DISSOLVE_LEAD = 1.7;

export function createStoryRunner(bus: EventBus, now: () => number, cycle: number, restartDelay: number): StoryRunner {
  const signals = new Map<string, number>();
  const openModules = new Set<string>();
  const cursors = {} as Record<AgentId, Cursor>;
  for (const id of AGENT_ORDER) {
    cursors[id] = {
      index: 0,
      elapsed: 0,
      started: false,
      announced: false,
      hasWorked: false,
      shown: { state: "idle", task: "ready" },
      awaiting: null,
      sources: 0,
      done: false,
    };
  }
  let endedAt: number | null = null;
  let dissolved = false;

  const publish = (draft: EventDraft, source: "demo" | "user" = "demo") => {
    bus.publish(draft, source);
    if (draft.type === "module_reserved" || draft.type === "module_created") openModules.add(draft.module.id);
    if (draft.type === "module_removed") openModules.delete(draft.moduleId);
  };

  function emit(signal: string) {
    if (signals.has(signal)) return;
    signals.set(signal, now());
    const beat = UAE_TIMELINE[signal];
    if (!beat) return;
    beat.events.forEach((draft, i) => publish(i === 0 && beat.summary ? { ...draft, summary: beat.summary } : draft, beat.source === "user" ? "user" : "demo"));
  }

  function show(id: AgentId, draft: EventDraft & { task: string }, state: AgentState) {
    const cursor = cursors[id];
    if (cursor.shown.state === state && cursor.shown.task === draft.task) return;
    cursor.shown = { state, task: draft.task };
    publish(draft);
  }

  function enter(id: AgentId, action: Action) {
    const cursor = cursors[id];
    switch (action.kind) {
      case "moveTo": {
        cursor.hasWorked = true;
        cursor.awaiting = { kind: "arrival" };
        const travel = action.state ?? "moving";
        cursor.shown = { state: travel === "returning" ? "returning" : "assigned", task: action.task };
        publish({ type: "agent_assigned", agentId: id, target: toTarget(action.target), task: action.task, travel });
        return;
      }
      case "hold": {
        cursor.hasWorked = true;
        cursor.sources = 0;
        const moduleId = action.zone ?? null;
        const base = { agentId: id, task: action.task, moduleId };
        cursor.shown = { state: action.state, task: action.task };
        if (action.state === "completed") publish({ type: "task_completed", ...base });
        else if (action.state === "failed") publish({ type: "task_failed", ...base });
        else if (action.state === "retrying") publish({ type: "retry_started", ...base });
        else if (action.state === "working" || action.state === "evaluating" || action.state === "collaborating") {
          publish({ type: "agent_work_started", activity: action.state, ...base });
        }
        return;
      }
      case "handoff": {
        const artifactId = `c${cycle}-${id}-${cursor.index}`;
        cursor.awaiting = { kind: "artifact", artifactId, signal: action.signal };
        cursor.shown = { state: "handoff", task: action.task };
        publish({ type: "artifact_handoff_started", artifactId, kind: action.artifact, from: id, to: action.to, task: action.task });
        return;
      }
      default:
        return;
    }
  }

  function advance(cursor: Cursor) {
    cursor.index += 1;
    cursor.elapsed = 0;
    cursor.started = false;
    cursor.announced = false;
  }

  function run(id: AgentId, dt: number) {
    const cursor = cursors[id];
    const script = SCRIPT[id];
    for (let guard = 0; guard < 12; guard += 1) {
      const action = script[cursor.index];
      if (!action) {
        if (!cursor.done) {
          cursor.done = true;
          show(id, { type: "agent_idle", agentId: id, task: signals.has("recommendation") ? "done for now" : "ready" }, "idle");
        }
        return;
      }
      if (!cursor.started) {
        cursor.started = true;
        enter(id, action);
      }
      switch (action.kind) {
        case "wait":
          if (!cursor.announced) {
            cursor.announced = true;
            show(id, { type: "agent_idle", agentId: id, task: "ready" }, "idle");
          }
          cursor.elapsed += dt;
          if (cursor.elapsed < action.seconds) return;
          advance(cursor);
          continue;
        case "waitFor": {
          if (signals.has(action.signal)) {
            advance(cursor);
            continue;
          }
          if (!cursor.announced) {
            cursor.announced = true;
            const task = action.task ?? cursor.shown.task;
            if (cursor.hasWorked) show(id, { type: "agent_waiting", agentId: id, task }, "waiting");
            else show(id, { type: "agent_idle", agentId: id, task }, "idle");
          }
          return;
        }
        case "emit":
          emit(action.signal);
          advance(cursor);
          continue;
        case "moveTo":
        case "handoff":
          if (cursor.awaiting) return;
          advance(cursor);
          continue;
        case "hold": {
          cursor.elapsed += dt;
          const progress = Math.min(1, cursor.elapsed / action.seconds);
          if (action.zone && action.evidence !== undefined) {
            const total = Math.floor(action.evidence * progress);
            if (total > cursor.sources) {
              cursor.sources = total;
              publish({ type: "sources_checked", agentId: id, moduleId: action.zone, total });
            }
          }
          if (cursor.elapsed < action.seconds) return;
          advance(cursor);
          continue;
        }
      }
    }
  }

  const unsubscribe = [
    bus.on("agent_arrived", (event) => {
      const cursor = cursors[event.agentId as AgentId];
      if (event.cycle !== cycle || cursor?.awaiting?.kind !== "arrival") return;
      cursor.awaiting = null;
      run(event.agentId as AgentId, 0);
    }),
    bus.on("artifact_handoff_completed", (event) => {
      const cursor = cursors[event.from as AgentId];
      const awaiting = cursor?.awaiting;
      if (event.cycle !== cycle || awaiting?.kind !== "artifact" || awaiting.artifactId !== event.artifactId) return;
      cursor.awaiting = null;
      emit(awaiting.signal);
      run(event.from as AgentId, 0);
    }),
  ];

  function answer(requestId: keyof typeof HUMAN_INPUTS, by: "user" | "autoplay") {
    if (!signals.has(`${requestId}-request`) || signals.has(requestId)) return false;
    const input = HUMAN_INPUTS[requestId];
    publish(
      { type: "human_input_received", requestId, answer: input.answer, answeredBy: by, summary: input.answeredSummary },
      by === "user" ? "user" : "demo",
    );
    emit(requestId);
    return true;
  }

  return {
    step(dt) {
      const time = now();
      if (time >= OBJECTIVE_AT) emit("objective");
      const requestedAt = signals.get("budget-request");
      if (requestedAt !== undefined && time - requestedAt >= BUDGET_AUTO_CONFIRM_SECONDS) answer("budget", "autoplay");
      for (const id of AGENT_ORDER) run(id, dt);
      if (endedAt === null && AGENT_ORDER.every((id) => cursors[id].done)) endedAt = time;
      if (!dissolved && endedAt !== null && time - endedAt >= restartDelay - DISSOLVE_LEAD) {
        dissolved = true;
        for (const moduleId of [...openModules]) publish({ type: "module_removed", moduleId });
      }
    },
    answer,
    get endedAt() {
      return endedAt;
    },
    signals,
    dispose: () => unsubscribe.forEach((off) => off()),
  };
}
