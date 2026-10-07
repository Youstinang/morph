import type { EventBus } from "@/events/bus";
import type { EventDraft } from "@/events/schema";
import type { Provenance } from "@/state/domain";
import type { OperationGate } from "@/state/gate";
import { PLANNER_AGENT, PlanResponseSchema, planToOperations, type PlanResponse } from "@/state/plan";
import type { AgentId } from "./types";

/**
 * Prototype live runtime for a question typed by the user: the user's question is recorded, Nova walks to
 * the Core and plans while the real planner call is in flight, the accepted plan opens its stations and
 * sends the agents to them, and then the run honestly waits — research tools come in a later phase.
 * The plan arrives asynchronously but is acted on inside `step`, so everything happens on the run clock.
 * Like the demo runner, it only publishes events and proposes operations through the gate.
 */

export type PlanRequester = (objective: string, signal: AbortSignal) => Promise<PlanResponse>;

export const LIVE_OBJECTIVE_AT = 0.6;
/** Lets new stations rise before the first agent sets off. */
const ASSIGN_DELAY = 1;
const ASSIGN_GAP = 0.35;
export const WAITING_SUMMARY = "The plan is ready. Live research isn't connected yet, so the team waits at its stations.";

export type LivePhase = "starting" | "reading" | "planning" | "assigning" | "waiting" | "failed";

export interface LiveRunner {
  step(dt: number): void;
  readonly phase: LivePhase;
  readonly endedAt: null;
  dispose(): void;
}

const planner: Provenance = { kind: "model", label: "Planner", agentId: PLANNER_AGENT };

export function createLiveRunner(
  bus: EventBus,
  gate: OperationGate,
  now: () => number,
  cycle: number,
  objective: string,
  requestPlan: PlanRequester,
): LiveRunner {
  const controller = new AbortController();
  const id = (name: string) => `live${cycle}-${name}`;
  let phase: LivePhase = "starting";
  let response: PlanResponse | null = null;
  let novaArrived = false;
  let queue: { agentId: string; moduleId: string; task: string; operation: Record<string, unknown> }[] = [];
  let nextAssignAt = 0;
  const travelling = new Map<string, string>();

  const publish = (draft: EventDraft, source: "orchestrator" | "user" = "orchestrator") => bus.publish(draft, source);
  const propose = (operation: Record<string, unknown>, name: string, as: Provenance, summary?: string) =>
    gate.submit({ ...operation, id: id(name) }, summary ? { as, summary } : { as }).ok;

  function fail(reason: string) {
    phase = "failed";
    queue = [];
    publish({ type: "run_failed", reason: reason.slice(0, 200), summary: `Live AI couldn't make a plan: ${reason}.`.slice(0, 240) });
    publish({ type: "agent_assigned", agentId: PLANNER_AGENT, target: { kind: "home" }, task: "heading back", travel: "returning" });
  }

  function actOnPlan(answer: PlanResponse) {
    if (answer.usage && answer.usage.calls > 0) publish({ type: "model_call_completed", agentId: PLANNER_AGENT, purpose: "plan", ...answer.usage });
    const checked = PlanResponseSchema.safeParse(answer);
    if (!checked.success) return fail("the plan didn't pass MORPH's checks");
    if (!checked.data.ok) return fail(checked.data.reason.replace(/\.$/, ""));
    const { plan } = checked.data;
    const ops = planToOperations(plan, `live${cycle}`);

    publish({ type: "workspace_morph_started", reason: "Building the plan for your question" });
    publish({ type: "plan_created", agentId: PLANNER_AGENT, moduleIds: ops.moduleIds, summary: `The plan: ${plan.interpretation}`.slice(0, 240) });
    const opened = ops.modules.filter((operation, i) => propose(operation, `module-${i}`, planner));
    if (opened.length === 0) return fail("none of the planned stations could be opened");
    ops.assumptions.forEach((operation, i) => propose(operation, `assumption-${i}`, planner));
    ops.questions.forEach((operation, i) => propose(operation, `question-${i}`, planner));
    publish({ type: "workspace_morph_completed" });
    publish({ type: "task_completed", agentId: PLANNER_AGENT, task: "handing out the work", moduleId: null });

    queue = ops.assignments;
    nextAssignAt = now() + ASSIGN_DELAY;
    phase = "assigning";
  }

  function assignNext() {
    const next = queue.shift();
    if (!next) return;
    nextAssignAt = now() + ASSIGN_GAP;
    if (!propose(next.operation, `assign-${next.agentId}`, planner)) return;
    travelling.set(next.agentId, next.task);
    publish({ type: "agent_assigned", agentId: next.agentId, target: { kind: "module", moduleId: next.moduleId }, task: next.task, travel: "moving" });
  }

  function settleIfDone() {
    if (phase !== "assigning" || queue.length > 0 || travelling.size > 0) return;
    phase = "waiting";
    publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "waiting for research tools" });
    publish({ type: "run_waiting", reason: "research tools aren't connected yet", summary: WAITING_SUMMARY });
  }

  const unsubscribe = bus.on("agent_arrived", (event) => {
    if (event.cycle !== cycle) return;
    if (event.agentId === PLANNER_AGENT && event.target.kind === "core") novaArrived = true;
    if (event.agentId === PLANNER_AGENT && event.target.kind === "home") publish({ type: "agent_idle", agentId: PLANNER_AGENT, task: "ready" });
    const task = travelling.get(event.agentId);
    if (task === undefined || event.target.kind !== "module") return;
    travelling.delete(event.agentId);
    publish({ type: "agent_waiting", agentId: event.agentId as AgentId, task });
  });

  return {
    step() {
      const time = now();
      if (phase === "starting" && time >= LIVE_OBJECTIVE_AT) {
        phase = "reading";
        if (!propose({ operation: "set_objective", objectiveId: id("objective"), text: objective }, "objective", { kind: "user" }, "You asked the team a question.")) {
          return fail("the question couldn't be recorded");
        }
        publish({ type: "agent_assigned", agentId: PLANNER_AGENT, target: { kind: "core" }, task: "reading your question", travel: "moving" });
        requestPlan(objective, controller.signal).then(
          (answer) => (response = answer),
          () => (response = { ok: false, reason: "couldn't reach the AI service" }),
        );
      }
      if (phase === "reading" && novaArrived) {
        phase = "planning";
        publish({ type: "planning_started", agentId: PLANNER_AGENT });
        publish({ type: "agent_work_started", agentId: PLANNER_AGENT, activity: "working", task: "planning the work", moduleId: null });
      }
      if (phase === "planning" && response) actOnPlan(response);
      while (phase === "assigning" && queue.length > 0 && now() >= nextAssignAt) assignNext();
      settleIfDone();
    },
    get phase() {
      return phase;
    },
    endedAt: null,
    dispose() {
      controller.abort();
      unsubscribe();
    },
  };
}
