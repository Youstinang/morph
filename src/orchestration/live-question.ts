import type { EventBus } from "@/events/bus";
import type { EventDraft } from "@/events/schema";
import type { Provenance } from "@/state/domain";
import type { OperationGate } from "@/state/gate";
import {
  AI_KNOWLEDGE_LABEL,
  LIVE_LIMITS,
  StepResponseSchema,
  type AgentStep,
  type CritiqueResult,
  type ResearchResult,
  type StepResponse,
  type SynthesisResult,
} from "@/state/live-work";
import { PLANNER_AGENT, PlanResponseSchema, planToOperations, type Plan, type PlanResponse } from "@/state/plan";
import { TEAM_AGENTS } from "@/state/team";
import { createScheduler, type Scheduler, type SchedulerEvent, type TaskOutcome } from "./scheduler";

/**
 * Live runtime for a question typed by the user. The user's question is recorded; Nova walks to the Core
 * and plans while the real planner call is in flight; the accepted plan opens its stations and sends the
 * agents to them. Then the team works (user choice 2026-10-07): each agent with a task researches from the
 * model's general knowledge (at most two at a time), Vex challenges the weakest point, and Lume and Nova
 * agree on a tentative answer. Every result is unverified model evidence. Without a server run id, the
 * team waits at its stations instead.
 *
 * Replies arrive asynchronously but are acted on inside `step`, so everything happens on the run clock.
 * Like the demo runtime, it only publishes events and proposes operations through the gate.
 */

export type PlanRequester = (objective: string, signal: AbortSignal) => Promise<PlanResponse>;
export type StepRequester = (runId: string, step: AgentStep, signal: AbortSignal) => Promise<StepResponse>;

export const LIVE_OBJECTIVE_AT = 0.6;
/** Lets new stations rise before the first agent sets off. */
const ASSIGN_DELAY = 1;
const ASSIGN_GAP = 0.35;
/** How long a finished agent shows "done" before waiting for the team, and the team pauses before going home. */
const SHOW_DONE = 1.2;
const HOME_DELAY = 2.5;
/** Longest the team may work after the plan before the run stops, so nothing can wait forever. */
const WORK_DEADLINE = 150;
export const WAITING_SUMMARY = "The plan is ready. Live research isn't connected yet, so the team waits at its stations.";
const CRITIC = "vex";
const SYNTHESIZER = "lume";

export type LivePhase = "starting" | "reading" | "planning" | "assigning" | "working" | "answered" | "waiting" | "failed";

export interface LiveQuestion {
  step(dt: number): void;
  readonly phase: LivePhase;
  readonly endedAt: null;
  dispose(): void;
}

type StepValue = ResearchResult | CritiqueResult | SynthesisResult;

const isSettled = (status: string | undefined) => status === "succeeded" || status === "failed" || status === "skipped";
const planner: Provenance = { kind: "model", label: "Planner", agentId: PLANNER_AGENT };
const asModel = (agentId: string, label: string): Provenance => ({ kind: "model", label, agentId });
const notConnected: StepRequester = async () => ({ ok: false, reason: "live AI isn't connected here", stop: true });
const nameOf = (agentId: string) => TEAM_AGENTS.find((agent) => agent.id === agentId)?.name ?? agentId;

export function createLiveQuestion(
  bus: EventBus,
  gate: OperationGate,
  now: () => number,
  cycle: number,
  objective: string,
  requestPlan: PlanRequester,
  requestStep: StepRequester = notConnected,
): LiveQuestion {
  const controller = new AbortController();
  const prefix = `live${cycle}`;
  const id = (name: string) => `${prefix}-${name}`;
  let phase: LivePhase = "starting";
  let response: PlanResponse | null = null;
  let plan: Plan | null = null;
  let runId: string | null = null;
  let queue: { agentId: string; moduleId: string; task: string; operation: Record<string, unknown> }[] = [];
  let nextAssignAt = 0;
  const travelling = new Map<string, string>();
  /** Where each agent is: a module id, "core", "home", or absent while walking. */
  const at = new Map<string, string>();
  let moduleIds: string[] = [];
  let assumptionIds: string[] = [];
  const evidenceFor = new Map<number, string>();
  let scheduler: Scheduler<StepValue> | null = null;
  const timers: { at: number; run: () => void }[] = [];
  let stopReason: string | null = null;
  let deadline = Infinity;
  const publish = (draft: EventDraft, source: "orchestrator" | "user" = "orchestrator") => bus.publish(draft, source);
  const propose = (operation: Record<string, unknown>, name: string, as: Provenance, summary?: string) =>
    gate.submit({ ...operation, id: id(name) }, summary ? { as, summary } : { as }).ok;
  const later = (seconds: number, run: () => void) => timers.push({ at: now() + seconds, run });
  const send = (agentId: string, target: { kind: "core" } | { kind: "home" } | { kind: "module"; moduleId: string }, task: string) => {
    at.delete(agentId);
    publish({ type: "agent_assigned", agentId, target, task, travel: target.kind === "home" ? "returning" : "moving" });
  };

  function fail(reason: string) {
    phase = "failed";
    queue = [];
    scheduler?.cancel();
    publish({ type: "run_failed", reason: reason.slice(0, 200), summary: `Live AI couldn't make a plan: ${reason}.`.slice(0, 240) });
    send(PLANNER_AGENT, { kind: "home" }, "heading back");
  }

  function recordUsage(agentId: string, purpose: string, usage: { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number } | undefined) {
    if (usage && usage.calls > 0) publish({ type: "model_call_completed", agentId, purpose, ...usage });
  }

  function actOnPlan(answer: PlanResponse) {
    if (answer.usage && answer.usage.calls > 0) publish({ type: "model_call_completed", agentId: PLANNER_AGENT, purpose: "plan", ...answer.usage });
    const checked = PlanResponseSchema.safeParse(answer);
    if (!checked.success) return fail("the plan didn't pass MORPH's checks");
    if (!checked.data.ok) return fail(checked.data.reason.replace(/\.$/, ""));
    plan = checked.data.plan;
    runId = checked.data.runId ?? null;
    const ops = planToOperations(plan, prefix);
    moduleIds = ops.moduleIds;
    assumptionIds = ops.assumptions.map((operation) => String(operation.assumptionId));

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
    if (runId) {
      scheduleWork(ops.assignments);
      deadline = now() + WORK_DEADLINE;
    }
  }

  function assignNext() {
    const next = queue.shift();
    if (!next) return;
    nextAssignAt = now() + ASSIGN_GAP;
    if (!propose(next.operation, `assign-${next.agentId}`, planner)) return;
    travelling.set(next.agentId, next.task);
    send(next.agentId, { kind: "module", moduleId: next.moduleId }, next.task);
  }

  const ask = (step: AgentStep) => async (signal: AbortSignal): Promise<TaskOutcome<StepValue>> => {
    const both = AbortSignal.any([signal, controller.signal]);
    const reply = await requestStep(runId!, step, both).catch((): StepResponse => ({ ok: false, reason: "couldn't reach the server" }));
    const checked = StepResponseSchema.safeParse(reply);
    if (!checked.success) return { ok: false, reason: "the reply didn't pass MORPH's checks" };
    const data = checked.data;
    usageInbox.push({ step, usage: data.usage });
    if (!data.ok) {
      if (data.stop) stopReason = data.reason;
      return { ok: false, reason: data.reason, final: data.stop === true };
    }
    if (data.kind !== step.kind) return { ok: false, reason: "the reply was for a different step" };
    return { ok: true, value: data.result };
  };
  const usageInbox: { step: AgentStep; usage: StepResponse["usage"] }[] = [];

  /** The team's work after planning, as scheduled tasks: research, then the critic, then the answer. */
  function scheduleWork(assignments: typeof queue) {
    const work = createScheduler<StepValue>({
      concurrency: LIVE_LIMITS.concurrency,
      timeoutSeconds: LIVE_LIMITS.taskSeconds,
      retries: LIVE_LIMITS.retries,
      retryDelaySeconds: 1.5,
      maxAttempts: LIVE_LIMITS.modelCalls,
    });
    const research = assignments.map((assignment, task) => {
      const taskId = `research-${task}`;
      work.add({ id: taskId, ready: () => at.get(assignment.agentId) === assignment.moduleId, run: ask({ kind: "research", task }) });
      return taskId;
    });
    work.add({ id: "critique", dependsOn: research, needs: "any", ready: () => at.get(CRITIC) === "core", run: ask({ kind: "critique" }) });
    work.add({
      id: "synthesis",
      dependsOn: research,
      needs: "any",
      ready: () => at.get(SYNTHESIZER) === "core" && isSettled(work.status("critique")),
      run: ask({ kind: "synthesis" }),
    });
    scheduler = work;
  }

  function onWork(event: SchedulerEvent<StepValue>) {
    if (!plan) return;
    const [kind, index] = event.id.split("-") as [string, string | undefined];
    const task = index === undefined ? -1 : Number(index);
    const assignment = task >= 0 ? plan.tasks[task] : undefined;
    const agentId = kind === "critique" ? CRITIC : kind === "synthesis" ? SYNTHESIZER : (assignment?.agent ?? PLANNER_AGENT);
    const moduleId = task >= 0 ? (moduleIds[plan.modules.findIndex((mod) => mod.key === assignment?.module)] ?? null) : null;

    if (event.type === "started") {
      if (kind === "research") {
        const base = { agentId, task: assignment!.task, moduleId };
        publish(event.attempt > 1 ? { type: "retry_started", ...base } : { type: "agent_work_started", activity: "working", ...base });
      } else if (kind === "critique") {
        publish({ type: "agent_work_started", agentId, activity: "evaluating", task: "looking for the weakest point", moduleId: null });
      } else {
        publish({ type: "agent_collaboration_started", agentIds: [SYNTHESIZER, PLANNER_AGENT], moduleId: null });
        publish({ type: "synthesis_started", agentIds: [SYNTHESIZER, PLANNER_AGENT], summary: "Lume and Nova are putting a tentative answer together." });
        publish({ type: "agent_work_started", agentId: SYNTHESIZER, activity: "collaborating", task: "agreeing on an answer with Nova", moduleId: null });
        publish({ type: "agent_work_started", agentId: PLANNER_AGENT, activity: "collaborating", task: "agreeing on an answer with Lume", moduleId: null });
      }
      return;
    }

    if (event.type === "failed") {
      const what = kind === "research" ? assignment!.task : kind === "critique" ? "reviewing the findings" : "writing the answer";
      const task = event.willRetry ? `stuck (${event.reason}); trying again shortly` : `stuck: ${event.reason}`;
      publish({ type: "task_failed", agentId, task: task.slice(0, 200), moduleId, ...(event.willRetry ? {} : { summary: `${nameOf(agentId)} couldn't finish ${what}: ${event.reason}.`.slice(0, 240) }) });
      return;
    }

    if (event.type === "skipped") {
      if (kind === "research") publish({ type: "agent_waiting", agentId, task: `skipped: ${event.reason}`.slice(0, 200) });
      return;
    }

    if (kind === "research") {
      const result = event.value as ResearchResult;
      const evidenceId = id(`ev${task + 1}`);
      const as = asModel(agentId, "Researcher");
      const added = propose(
        { operation: "add_evidence", evidence: { id: evidenceId, statement: result.finding, kind: result.kind, moduleId, foundBy: agentId, source: { kind: "model", label: AI_KNOWLEDGE_LABEL, verified: false } } },
        `finding-${task}`,
        as,
        `${nameOf(agentId)}: ${result.finding}`.slice(0, 240),
      );
      if (added) evidenceFor.set(task, evidenceId);
      if (moduleId) propose({ operation: "update_module", moduleId, changes: { summary: { headline: result.headline, detail: result.detail } } }, `summary-${task}`, as);
      publish({ type: "task_completed", agentId, task: assignment!.task, moduleId });
      const station = at.get(agentId);
      later(SHOW_DONE, () => {
        // A waiting state stops the agent, so skip it if they've been sent somewhere since.
        if (at.get(agentId) === station) publish({ type: "agent_waiting", agentId, task: "done; waiting for the team" });
      });
    } else if (kind === "critique") {
      const result = event.value as CritiqueResult;
      const as = asModel(CRITIC, "Critic");
      const summary = `Vex pushes back: ${result.note}`.slice(0, 240);
      const assumption = /^a\d$/.test(result.target) ? assumptionIds[Number(result.target.slice(1)) - 1] : undefined;
      const finding = /^f\d$/.test(result.target) ? Number(result.target.slice(1)) - 1 : -1;
      if (assumption) propose({ operation: "challenge_assumption", assumptionId: assumption, by: CRITIC, note: result.note }, "challenge", as, summary);
      else if (finding >= 0) {
        const findingModule = moduleIds[plan.modules.findIndex((mod) => mod.key === plan!.tasks[finding]?.module)] ?? null;
        propose(
          { operation: "add_evidence", evidence: { id: id("doubt"), statement: result.note, kind: "risk", moduleId: findingModule, foundBy: CRITIC, source: { kind: "model", label: AI_KNOWLEDGE_LABEL, verified: false } } },
          "doubt",
          as,
          summary,
        );
      }
      publish({ type: "task_completed", agentId: CRITIC, task: result.target === "none" ? "found no serious weak spot" : "noting the doubt", moduleId: null, ...(result.target === "none" ? { summary: "Vex found no serious weak spot." } : {}) });
    } else {
      const result = event.value as SynthesisResult;
      const evidenceIds = result.basis.flatMap((key) => evidenceFor.get(Number(key.slice(1)) - 1) ?? []);
      const ok = propose(
        {
          operation: "update_recommendation",
          recommendation: { status: "final", leaning: result.statement, statement: result.statement, reason: result.reason, confidence: result.confidence, evidenceIds },
          why: { reason: "Lume and Nova's tentative answer from the team's findings.", evidenceIds, agentId: SYNTHESIZER },
        },
        "answer",
        asModel(SYNTHESIZER, "Synthesizer"),
        `Tentative answer: ${result.statement}`.slice(0, 240),
      );
      if (ok) {
        propose({ operation: "update_objective", status: "answered" }, "answered", { kind: "orchestrator" });
        publish({ type: "synthesis_completed", agentIds: [SYNTHESIZER, PLANNER_AGENT] });
        publish({ type: "task_completed", agentId: SYNTHESIZER, task: "sharing the answer", moduleId: null });
        publish({ type: "task_completed", agentId: PLANNER_AGENT, task: "signing off the answer", moduleId: null });
      }
    }
  }

  /** Moves the critic and the synthesizer to the Core once their inputs are settled. */
  let criticSent = false;
  let synthesizerSent = false;
  function direct() {
    const work = scheduler!;
    const researchDone = plan!.tasks.every((_, task) => isSettled(work.status(`research-${task}`)));
    if (researchDone && !criticSent && work.status("critique") === "pending") {
      criticSent = true;
      send(CRITIC, { kind: "core" }, "going to review the team's findings");
    }
    if (isSettled(work.status("critique")) && !synthesizerSent && work.status("synthesis") === "pending") {
      synthesizerSent = true;
      send(SYNTHESIZER, { kind: "core" }, "heading to the center to agree on an answer");
    }
  }

  function wrapUp() {
    const answered = scheduler!.status("synthesis") === "succeeded";
    phase = answered ? "answered" : "waiting";
    if (!answered) {
      const reason = stopReason ?? "the team couldn't finish an answer";
      publish({ type: "run_waiting", reason: reason.slice(0, 240), summary: `The team stopped: ${reason}.`.slice(0, 240) });
    }
    later(HOME_DELAY, () => {
      for (const agentId of new Set([PLANNER_AGENT, ...plan!.tasks.map((task) => task.agent), CRITIC, SYNTHESIZER])) {
        if (at.get(agentId) !== "home") send(agentId, { kind: "home" }, "heading back");
      }
    });
  }

  function settleIfWaiting() {
    if (phase !== "assigning" || queue.length > 0 || travelling.size > 0) return;
    if (scheduler) {
      phase = "working";
      publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "keeping an eye on the team" });
      return;
    }
    phase = "waiting";
    publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "waiting for research tools" });
    publish({ type: "run_waiting", reason: "research tools aren't connected yet", summary: WAITING_SUMMARY });
  }

  const unsubscribe = bus.on("agent_arrived", (event) => {
    if (event.cycle !== cycle) return;
    const where = event.target.kind === "module" ? event.target.moduleId : event.target.kind;
    at.set(event.agentId, where);
    if (event.target.kind === "home") {
      publish({ type: "agent_idle", agentId: event.agentId, task: phase === "answered" ? "done for now" : "ready" });
      return;
    }
    if (event.agentId === CRITIC && event.target.kind === "core" && phase === "working") {
      publish({ type: "agent_waiting", agentId: CRITIC, task: "waiting for a turn to review" });
    }
    if (event.agentId === SYNTHESIZER && event.target.kind === "core" && phase === "working") {
      publish({ type: "agent_waiting", agentId: SYNTHESIZER, task: "waiting for a turn to answer" });
    }
    const task = travelling.get(event.agentId);
    if (task === undefined || event.target.kind !== "module") return;
    travelling.delete(event.agentId);
    publish({ type: "agent_waiting", agentId: event.agentId, task: scheduler ? "waiting for a turn" : task });
  });

  return {
    step() {
      const time = now();
      if (phase === "starting" && time >= LIVE_OBJECTIVE_AT) {
        phase = "reading";
        if (!propose({ operation: "set_objective", objectiveId: id("objective"), text: objective }, "objective", { kind: "user" }, "You asked the team a question.")) {
          return fail("the question couldn't be recorded");
        }
        send(PLANNER_AGENT, { kind: "core" }, "reading your question");
        requestPlan(objective, controller.signal).then(
          (answer) => (response = answer),
          () => (response = { ok: false, reason: "couldn't reach the AI service" }),
        );
      }
      if (phase === "reading" && at.get(PLANNER_AGENT) === "core") {
        phase = "planning";
        publish({ type: "planning_started", agentId: PLANNER_AGENT });
        publish({ type: "agent_work_started", agentId: PLANNER_AGENT, activity: "working", task: "planning the work", moduleId: null });
      }
      if (phase === "planning" && response) actOnPlan(response);
      while (phase === "assigning" && queue.length > 0 && now() >= nextAssignAt) assignNext();
      settleIfWaiting();
      if (scheduler && (phase === "assigning" || phase === "working")) {
        const events = scheduler.step(time);
        for (const { step, usage } of usageInbox.splice(0)) {
          const agentId = step.kind === "critique" ? CRITIC : step.kind === "synthesis" ? SYNTHESIZER : (plan!.tasks[step.task]?.agent ?? PLANNER_AGENT);
          recordUsage(agentId, step.kind, usage);
        }
        events.forEach(onWork);
        direct();
        if (!scheduler.settled && time >= deadline) {
          scheduler.cancel();
          stopReason = "the work took too long";
          phase = "working";
          wrapUp();
        } else if (phase === "working" && scheduler.settled) wrapUp();
      }
      for (const timer of timers.filter((t) => t.at <= time)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
    get phase() {
      return phase;
    },
    endedAt: null,
    dispose() {
      controller.abort();
      scheduler?.cancel();
      unsubscribe();
    },
  };
}
