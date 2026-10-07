import type { EventBus } from "@/events/bus";
import type { AgentTarget, EventDraft } from "@/events/schema";
import type { AgentState, Provenance } from "@/state/domain";
import { END_OF_RUN_WHY, ENDING_FOR, HUMAN_INPUTS, UAE_TIMELINE, isOperation, timelineFor, type StoryBeat } from "@/state/fixtures/uae-market";
import type { OperationGate } from "@/state/gate";
import { checkAnswer } from "@/state/input-controls";
import { TEAM_ORDER, type TeamAgentId } from "@/state/team";
import { BUDGET_AUTO_CONFIRM_SECONDS, DEMO_SCRIPT, type DemoAction, type DemoTarget } from "./script";

/**
 * Deterministic demo runtime: plays each agent's part of the recorded story by publishing activity events
 * and proposing the fixture's operations through the gate, and waits for the world to report arrivals and
 * landed handoffs before moving on. It never touches the world or the store directly, and uses no network,
 * model or randomness, so the same clock always produces the same events.
 */

type AgentId = TeamAgentId;

const toTarget = (target: DemoTarget): AgentTarget =>
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

export interface DemoRuntime {
  step(dt: number): void;
  /**
   * Answers a pending human-input request with a value its control accepts; returns false if nothing is
   * waiting for it or the value doesn't fit. The budget picks the story's ending.
   */
  answer(requestId: string, value: unknown, by: "user" | "autoplay"): boolean;
  /** The user has started on the question, so autoplay leaves it to them. */
  hold(): void;
  readonly endedAt: number | null;
  readonly signals: ReadonlyMap<string, number>;
  dispose(): void;
}

export const OBJECTIVE_AT = 0.6;
const DISSOLVE_LEAD = 1.7;

export function createDemoRuntime(bus: EventBus, gate: OperationGate, now: () => number, cycle: number, restartDelay: number): DemoRuntime {
  const signals = new Map<string, number>();
  const openModules = new Set<string>();
  const cursors = {} as Record<AgentId, Cursor>;
  for (const id of TEAM_ORDER) {
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
  let held = false;
  let timeline: Record<string, StoryBeat> = UAE_TIMELINE;

  const publish = (draft: EventDraft, source: "demo" | "user" = "demo") => bus.publish(draft, source);

  function propose(operation: Record<string, unknown> & { operation: string }, as: Provenance, summary?: string) {
    const result = gate.submit(operation, summary ? { as, summary } : { as });
    if (result.ok && result.operation.operation === "add_module") openModules.add(result.operation.module.id);
    if (result.ok && result.operation.operation === "remove_module") openModules.delete(result.operation.moduleId);
    return result.ok;
  }

  function emit(signal: string) {
    if (signals.has(signal)) return;
    signals.set(signal, now());
    const beat = timeline[signal];
    if (!beat) return;
    const as: Provenance = beat.user ? { kind: "user" } : beat.by ? { kind: "demo", agentId: beat.by } : { kind: "demo" };
    beat.items.forEach((item, i) => {
      const summary = i === 0 ? beat.summary : undefined;
      if (isOperation(item)) propose({ ...item, id: `c${cycle}-${signal}-${i}` }, as, summary);
      else publish(summary ? { ...item, summary } : item, beat.user ? "user" : "demo");
    });
  }

  function show(id: AgentId, draft: EventDraft & { task: string }, state: AgentState) {
    const cursor = cursors[id];
    if (cursor.shown.state === state && cursor.shown.task === draft.task) return;
    cursor.shown = { state, task: draft.task };
    publish(draft);
  }

  function enter(id: AgentId, action: DemoAction) {
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
    const script = DEMO_SCRIPT[id];
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

  function answer(requestId: string, value: unknown, by: "user" | "autoplay") {
    if (!(requestId in HUMAN_INPUTS) || !signals.has(`${requestId}-request`) || signals.has(requestId)) return false;
    const input = HUMAN_INPUTS[requestId as keyof typeof HUMAN_INPUTS];
    const as: Provenance = by === "user" ? { kind: "user" } : { kind: "demo", label: "autoplay" };
    const checked = checkAnswer(input.control, value);
    if (!checked.ok) return false;
    const summary = input.answeredSummary(checked.display);
    if (!propose({ operation: "answer_human_input", id: `c${cycle}-${requestId}-answer`, requestId, value: checked.value }, as, summary)) return false;
    timeline = timelineFor(ENDING_FOR[checked.value as number] ?? "mid");
    emit(requestId);
    return true;
  }

  return {
    step(dt) {
      const time = now();
      if (time >= OBJECTIVE_AT) emit("objective");
      const requestedAt = signals.get("budget-request");
      if (requestedAt !== undefined && !held && time - requestedAt >= BUDGET_AUTO_CONFIRM_SECONDS) answer("budget", HUMAN_INPUTS.budget.autoplay, "autoplay");
      for (const id of TEAM_ORDER) run(id, dt);
      if (endedAt === null && TEAM_ORDER.every((id) => cursors[id].done)) endedAt = time;
      if (!dissolved && endedAt !== null && time - endedAt >= restartDelay - DISSOLVE_LEAD) {
        dissolved = true;
        [...openModules].forEach((moduleId, i) =>
          propose({ operation: "remove_module", id: `c${cycle}-end-${i}`, moduleId, why: END_OF_RUN_WHY }, { kind: "demo" }),
        );
      }
    },
    answer,
    hold: () => {
      held = true;
    },
    get endedAt() {
      return endedAt;
    },
    signals,
    dispose: () => unsubscribe.forEach((off) => off()),
  };
}
