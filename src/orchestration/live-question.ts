import type { EventBus } from "@/events/bus";
import type { EventDraft } from "@/events/schema";
import type { Provenance } from "@/state/domain";
import type { OperationGate } from "@/state/gate";
import {
  AI_KNOWLEDGE_LABEL,
  LIVE_LIMITS,
  StepResponseSchema,
  type AgentStep,
  doubtedTask,
  type CombineResult,
  type CritiqueResult,
  type PathsResult,
  type RecheckResult,
  type ResearchResult,
  type StepResponse,
  type SynthesisResult,
} from "@/state/live-work";
import { PLANNER_AGENT, PlanResponseSchema, planToOperations, type Plan, type PlanResponse } from "@/state/plan";
import { TEAM_AGENTS } from "@/state/team";
import type { InputControl, InputValue } from "@/state/input-controls";
import { createQuestionDesk, type AnswerRequester } from "./live-inputs";
import { createScheduler, type Scheduler, type SchedulerEvent, type TaskOutcome } from "./scheduler";

export type { AnswerRequester } from "./live-inputs";

/**
 * Live runtime for a question typed by the user. The user's question is recorded; Nova walks to the Core
 * and plans while the real planner call is in flight; the accepted plan opens its stations and sends the
 * agents to them. Then the team works (user choices 2026-10-07): each agent with a task researches from the
 * model's general knowledge, hands the finding to Sage at the Core, who combines them and briefs Vex; Vex
 * challenges the weakest point and may send one finding back for a re-check; a "Possible paths" station opens
 * where Lume weighs 2–3 paths; Lume and Nova agree on a tentative answer. Every result is unverified model evidence. Without a server run id, the team waits at
 * its stations instead.
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
const WORK_DEADLINE = 240;
export const WAITING_SUMMARY = "The plan is ready. Live research isn't connected yet, so the team waits at its stations.";
const ANALYST = "sage";
const CRITIC = "vex";
const SYNTHESIZER = "lume";

export type LivePhase = "starting" | "reading" | "planning" | "assigning" | "working" | "answered" | "waiting" | "failed";

export interface LiveQuestion {
  step(dt: number): void;
  /** The user's answer to one of Nova's questions; false if it isn't open or the value doesn't fit. */
  answer(requestId: string, value: InputValue): boolean;
  skip(requestId: string): boolean;
  readonly phase: LivePhase;
  readonly endedAt: null;
  dispose(): void;
}

type StepValue = ResearchResult | CombineResult | CritiqueResult | RecheckResult | PathsResult | SynthesisResult;

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
  requestAnswer?: AnswerRequester,
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
  const desk = createQuestionDesk({
    propose,
    note: (summary) => publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "going on without your answer", summary }),
    runId: () => runId,
    requestAnswer,
    signal: controller.signal,
  });
  const send = (agentId: string, target: { kind: "core" } | { kind: "home" } | { kind: "module"; moduleId: string }, task: string, travel?: "retrying") => {
    at.delete(agentId);
    publish({ type: "agent_assigned", agentId, target, task, travel: travel ?? (target.kind === "home" ? "returning" : "moving") });
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
    ops.questions.forEach((operation, i) => {
      const name = `question-${i}`;
      if (propose(operation, name, planner)) desk.add(String(operation.requestId), i, plan!.questions[i]!.question, operation.control as InputControl);
    });
    publish({ type: "workspace_morph_completed" });
    if (desk.open) publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "waiting for your answer" });
    else publish({ type: "task_completed", agentId: PLANNER_AGENT, task: "handing out the work", moduleId: null });

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

  /** Data cards in flight between agents, by artifact id, with what happens when each lands. */
  const handoffs = new Map<string, { from: string; to: string; landed: () => void }>();
  let handoffCount = 0;
  const handingTo = (agentId: string) => [...handoffs.values()].some((handoff) => handoff.to === agentId);
  const handingFrom = (agentId: string) => [...handoffs.values()].some((handoff) => handoff.from === agentId);
  function handOver(from: string, to: string, kind: "evidence" | "insight" | "flag", task: string, landed: () => void) {
    const artifactId = id(`card${(handoffCount += 1)}`);
    handoffs.set(artifactId, { from, to, landed });
    publish({ type: "artifact_handoff_started", artifactId, kind, from, to, task: task.slice(0, 200) });
  }

  const moduleOf = (task: number) => (plan ? (moduleIds[plan.modules.findIndex((mod) => mod.key === plan!.tasks[task]?.module)] ?? null) : null);
  const agentFor = (step: AgentStep) =>
    step.kind === "research"
      ? (plan!.tasks[step.task]?.agent ?? PLANNER_AGENT)
      : step.kind === "combine"
        ? ANALYST
        : step.kind === "critique"
          ? CRITIC
          : step.kind === "recheck"
            ? (plan!.tasks[recheckTask ?? -1]?.agent ?? CRITIC)
            : SYNTHESIZER;
  /** The finding Vex sent back for a re-check, once he has. */
  let recheckTask: number | null = null;
  /** The Possible paths station: not opened yet, opened for Lume, or skipped because there's no review to weigh. */
  let paths: "pending" | "open" | "skipped" = "pending";
  const pathsModule = id("paths");
  const pathsDone = () => paths === "skipped" || (paths === "open" && isSettled(scheduler!.status("paths")));

  /**
   * The team's work after planning, as scheduled tasks: research; Sage combines what was handed to her;
   * Vex reviews; a re-check if he sends a finding back; then the answer.
   */
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
    work.add({ id: "combine", dependsOn: research, needs: "any", ready: () => at.get(ANALYST) === "core" && gathered && !handingTo(ANALYST), run: ask({ kind: "combine" }) });
    work.add({
      id: "critique",
      dependsOn: research,
      needs: "any",
      ready: () => at.get(CRITIC) === "core" && isSettled(work.status("combine")) && desk.settled && !handingTo(CRITIC),
      run: ask({ kind: "critique" }),
    });
    work.add({
      id: "synthesis",
      dependsOn: research,
      needs: "any",
      ready: () => at.get(SYNTHESIZER) === "core" && isSettled(work.status("critique")) && (recheckTask === null || isSettled(work.status("recheck"))) && pathsDone(),
      run: ask({ kind: "synthesis" }),
    });
    scheduler = work;
  }

  function sendBackForRecheck(task: number) {
    const researcher = plan!.tasks[task]!.agent;
    const moduleId = moduleOf(task);
    recheckTask = task;
    scheduler!.add({ id: "recheck", ready: () => moduleId !== null && at.get(researcher) === moduleId, run: ask({ kind: "recheck" }) });
    publish({ type: "retry_requested", by: CRITIC, agentId: researcher, assumptionId: null });
    const goBack = () => moduleId && send(researcher, { kind: "module", moduleId }, "going back to double-check", "retrying");
    if (researcher === CRITIC) return goBack();
    handOver(CRITIC, researcher, "flag", `asking ${nameOf(researcher)} to double-check`, () => {
      goBack();
      send(CRITIC, { kind: "home" }, "heading back");
    });
  }

  /** Vex has reviewed and any re-check is in: a station rises for the paths, and Lume walks there to weigh them. */
  function openPaths() {
    const work = scheduler!;
    if (work.status("critique") !== "succeeded") {
      paths = "skipped";
      return;
    }
    publish({ type: "workspace_morph_started", reason: "The team's work is reviewed, so the possible paths can be weighed." });
    const opened = propose(
      {
        operation: "add_module",
        module: { id: pathsModule, title: "Possible paths", kind: "possibility", group: "decision" },
        why: { reason: "Vex has reviewed the findings, so Lume can weigh the possible paths.", agentId: SYNTHESIZER },
      },
      "paths-station",
      { kind: "orchestrator" },
      "A station rises for the possible paths.",
    );
    publish({ type: "workspace_morph_completed" });
    if (!opened) {
      paths = "skipped";
      return;
    }
    paths = "open";
    work.add({ id: "paths", ready: () => at.get(SYNTHESIZER) === pathsModule, run: ask({ kind: "paths" }) });
    send(SYNTHESIZER, { kind: "module", moduleId: pathsModule }, "going to weigh the possible paths");
  }

  function onWork(event: SchedulerEvent<StepValue>) {
    if (!plan) return;
    const [kind, index] = event.id.split("-") as [AgentStep["kind"], string | undefined];
    const task = kind === "research" ? Number(index) : kind === "recheck" ? (recheckTask ?? -1) : -1;
    const assignment = task >= 0 ? plan.tasks[task] : undefined;
    const agentId = kind === "research" ? (assignment?.agent ?? PLANNER_AGENT) : agentFor({ kind } as AgentStep);
    const moduleId = task >= 0 ? moduleOf(task) : kind === "paths" ? pathsModule : null;
    const WHAT: Record<AgentStep["kind"], string> = {
      research: assignment?.task ?? "the task",
      combine: "putting the findings together",
      critique: "reviewing the findings",
      recheck: "double-checking the finding",
      paths: "weighing the possible paths",
      synthesis: "writing the answer",
    };

    if (event.type === "started") {
      if (kind === "research") {
        const base = { agentId, task: assignment!.task, moduleId };
        publish(event.attempt > 1 ? { type: "retry_started", ...base } : { type: "agent_work_started", activity: "working", ...base });
      } else if (kind === "combine") {
        publish({ type: "agent_work_started", agentId, activity: "working", task: "putting the findings together", moduleId: null });
      } else if (kind === "critique") {
        publish({ type: "agent_work_started", agentId, activity: "evaluating", task: "looking for the weakest point", moduleId: null });
      } else if (kind === "recheck") {
        publish({ type: "retry_started", agentId, task: "double-checking the finding Vex doubted", moduleId });
      } else if (kind === "paths") {
        publish(
          event.attempt > 1
            ? { type: "retry_started", agentId: SYNTHESIZER, task: "weighing the possible paths", moduleId: pathsModule }
            : { type: "agent_work_started", agentId: SYNTHESIZER, activity: "evaluating", task: "weighing the possible paths", moduleId: pathsModule },
        );
      } else {
        publish({ type: "agent_collaboration_started", agentIds: [SYNTHESIZER, PLANNER_AGENT], moduleId: null });
        publish({ type: "synthesis_started", agentIds: [SYNTHESIZER, PLANNER_AGENT], summary: "Lume and Nova are putting a tentative answer together." });
        publish({ type: "agent_work_started", agentId: SYNTHESIZER, activity: "collaborating", task: "agreeing on an answer with Nova", moduleId: null });
        publish({ type: "agent_work_started", agentId: PLANNER_AGENT, activity: "collaborating", task: "agreeing on an answer with Lume", moduleId: null });
      }
      return;
    }

    if (event.type === "failed") {
      const what = WHAT[kind];
      const stuck = event.willRetry ? `stuck (${event.reason}); trying again shortly` : `stuck: ${event.reason}`;
      publish({ type: "task_failed", agentId, task: stuck.slice(0, 200), moduleId, ...(event.willRetry ? {} : { summary: `${nameOf(agentId)} couldn't finish ${what}: ${event.reason}.`.slice(0, 240) }) });
      return;
    }

    if (event.type === "skipped") {
      if (kind === "research") publish({ type: "agent_waiting", agentId, task: `skipped: ${event.reason}`.slice(0, 200) });
      return;
    }

    const source = { kind: "model", label: AI_KNOWLEDGE_LABEL, verified: false } as const;
    if (kind === "research") {
      const result = event.value as ResearchResult;
      const evidenceId = id(`ev${task + 1}`);
      const as = asModel(agentId, "Researcher");
      const added = propose(
        { operation: "add_evidence", evidence: { id: evidenceId, statement: result.finding, kind: result.kind, moduleId, foundBy: agentId, source } },
        `finding-${task}`,
        as,
        `${nameOf(agentId)}: ${result.finding}`.slice(0, 240),
      );
      if (added) evidenceFor.set(task, evidenceId);
      if (moduleId) propose({ operation: "update_module", moduleId, changes: { summary: { headline: result.headline, detail: result.detail } } }, `summary-${task}`, as);
      publish({ type: "task_completed", agentId, task: assignment!.task, moduleId });
      const station = at.get(agentId);
      later(SHOW_DONE, () => {
        // A waiting state stops the agent, so skip it if they've been sent somewhere since or are handing over.
        if (at.get(agentId) === station && !handingFrom(agentId)) publish({ type: "agent_waiting", agentId, task: "done; waiting for the team" });
      });
    } else if (kind === "combine") {
      const result = event.value as CombineResult;
      propose(
        { operation: "add_evidence", evidence: { id: id("combined"), statement: result.insight, kind: "fact", moduleId: null, foundBy: ANALYST, source } },
        "combined",
        asModel(ANALYST, "Analyst"),
        `Sage puts it together: ${result.insight}`.slice(0, 240),
      );
      publish({ type: "task_completed", agentId: ANALYST, task: "put the findings together", moduleId: null });
    } else if (kind === "critique") {
      const result = event.value as CritiqueResult;
      const as = asModel(CRITIC, "Critic");
      const summary = `Vex pushes back: ${result.note}`.slice(0, 240);
      const assumption = /^a\d$/.test(result.target) ? assumptionIds[Number(result.target.slice(1)) - 1] : undefined;
      const doubted = doubtedTask(result);
      if (assumption) propose({ operation: "challenge_assumption", assumptionId: assumption, by: CRITIC, note: result.note }, "challenge", as, summary);
      else if (doubted !== null && evidenceFor.has(doubted) && plan.tasks[doubted]) {
        propose(
          { operation: "add_evidence", evidence: { id: id("doubt"), statement: result.note, kind: "risk", moduleId: moduleOf(doubted), foundBy: CRITIC, source } },
          "doubt",
          as,
          summary,
        );
        sendBackForRecheck(doubted);
      }
      const none = result.target === "none";
      publish({ type: "task_completed", agentId: CRITIC, task: none ? "found no serious weak spot" : "noting the doubt", moduleId: null, ...(none ? { summary: "Vex found no serious weak spot." } : {}) });
      if (recheckTask === null) later(SHOW_DONE, () => send(CRITIC, { kind: "home" }, "heading back"));
    } else if (kind === "recheck") {
      const result = event.value as RecheckResult;
      const as = asModel(agentId, "Researcher");
      const previous = evidenceFor.get(task);
      const why = (evidenceId: string) => ({ reason: "Re-checked after Vex's doubt.", evidenceIds: [evidenceId], agentId });
      let current = previous;
      if (result.verdict === "revised" && previous) {
        const revisedId = id(`ev${task + 1}-rechecked`);
        const added = propose(
          { operation: "add_evidence", evidence: { id: revisedId, statement: result.finding, kind: result.kind, moduleId, foundBy: agentId, source } },
          `finding-${task}-rechecked`,
          as,
          `${nameOf(agentId)} re-checked and revised it: ${result.finding}`.slice(0, 240),
        );
        if (added) {
          propose({ operation: "remove_evidence", evidenceId: previous, supersededBy: revisedId, why: why(revisedId) }, `finding-${task}-replaced`, as);
          evidenceFor.set(task, revisedId);
          current = revisedId;
          if (moduleId) propose({ operation: "update_module", moduleId, changes: { summary: { headline: result.headline, detail: result.detail } } }, `summary-${task}-rechecked`, as);
        }
      }
      if (current) propose({ operation: "remove_evidence", evidenceId: id("doubt"), supersededBy: current, why: why(current) }, "doubt-answered", as);
      const stands = result.verdict === "kept";
      publish({ type: "task_completed", agentId, task: stands ? "the finding stands" : "revised the finding", moduleId, ...(stands ? { summary: `${nameOf(agentId)} re-checked: the finding stands.` } : {}) });
    } else if (kind === "paths") {
      const result = event.value as PathsResult;
      const as = asModel(SYNTHESIZER, "Synthesizer");
      const strongest = [...result.paths].sort((a, b) => b.assessment - a.assessment)[0]!;
      result.paths.forEach((path, i) => {
        const evidenceIds = path.basis.flatMap((key) => evidenceFor.get(Number(key.slice(1)) - 1) ?? []);
        propose(
          { operation: "add_scenario", scenario: { id: id(`path${i + 1}`), label: path.label, assessment: path.assessment, why: path.why, risk: path.risk, evidenceIds } },
          `path-${i}`,
          as,
          i === 0 ? `Lume weighed ${result.paths.length} paths; "${strongest.label}" fits best for now.`.slice(0, 240) : undefined,
        );
      });
      propose(
        { operation: "update_module", moduleId: pathsModule, changes: { summary: { headline: `Best fit: ${strongest.label}`.slice(0, 60), detail: "Lume's rough weighing, not a prediction" } } },
        "paths-summary",
        as,
      );
      publish({ type: "task_completed", agentId: SYNTHESIZER, task: "weighed the possible paths", moduleId: pathsModule });
    } else {
      const result = event.value as SynthesisResult;
      const evidenceIds = [...result.basis.flatMap((key) => evidenceFor.get(Number(key.slice(1)) - 1) ?? []), ...desk.evidenceIds];
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

  /** Moves Sage, Vex and Lume to the Core once their inputs are settled. */
  let analystSent = false;
  let gathered = false;
  let criticSent = false;
  let criticWaiting = false;
  let synthesizerSent = false;
  function direct() {
    const work = scheduler!;
    const researchDone = plan!.tasks.every((_, task) => isSettled(work.status(`research-${task}`)));
    if (researchDone && !analystSent && work.status("combine") === "pending") {
      analystSent = true;
      send(ANALYST, { kind: "core" }, "collecting the team's findings");
    }
    if (isSettled(work.status("combine")) && !criticSent && work.status("critique") === "pending") {
      if (desk.settled) {
        criticSent = true;
        send(CRITIC, { kind: "core" }, "going to review the team's work");
      } else if (!criticWaiting && !handingFrom(CRITIC) && at.has(CRITIC)) {
        criticWaiting = true;
        publish({ type: "agent_waiting", agentId: CRITIC, task: "waiting for your answer to Nova", summary: "Vex will review once you've answered Nova's question." });
      }
    }
    const recheckDone = recheckTask === null || isSettled(work.status("recheck"));
    if (isSettled(work.status("critique")) && recheckDone && paths === "pending") openPaths();
    if (isSettled(work.status("critique")) && recheckDone && pathsDone() && !synthesizerSent && work.status("synthesis") === "pending") {
      synthesizerSent = true;
      send(SYNTHESIZER, { kind: "core" }, "heading to the center to agree on an answer");
    }
  }

  /** Sage has reached the Core: everyone else with a finding hands it to her, then heads home. */
  function gather() {
    gathered = true;
    publish({ type: "agent_waiting", agentId: ANALYST, task: "collecting the team's findings" });
    for (const [task, assignment] of plan!.tasks.entries()) {
      if (assignment.agent === ANALYST || !evidenceFor.has(task)) continue;
      handOver(assignment.agent, ANALYST, "evidence", "handing my finding to Sage", () => send(assignment.agent, { kind: "home" }, "handed over; heading back"));
    }
  }

  /** Vex has reached the Core: Sage hands him the combined picture, or simply heads home. */
  function brief() {
    publish({ type: "agent_waiting", agentId: CRITIC, task: "waiting for a turn to review" });
    if (scheduler!.status("combine") === "succeeded" && at.get(ANALYST) === "core") {
      handOver(ANALYST, CRITIC, "insight", "handing the combined picture to Vex", () => send(ANALYST, { kind: "home" }, "heading back"));
    } else if (at.get(ANALYST) === "core") send(ANALYST, { kind: "home" }, "heading back");
  }

  function wrapUp() {
    const answered = scheduler!.status("synthesis") === "succeeded";
    phase = answered ? "answered" : "waiting";
    if (!answered) {
      const reason = stopReason ?? "the team couldn't finish an answer";
      publish({ type: "run_waiting", reason: reason.slice(0, 240), summary: `The team stopped: ${reason}.`.slice(0, 240) });
    }
    later(HOME_DELAY, () => {
      for (const agentId of new Set([PLANNER_AGENT, ...plan!.tasks.map((task) => task.agent), ANALYST, CRITIC, SYNTHESIZER])) {
        if (at.get(agentId) !== "home") send(agentId, { kind: "home" }, "heading back");
      }
    });
  }

  function settleIfWaiting() {
    if (phase !== "assigning" || queue.length > 0 || travelling.size > 0) return;
    if (scheduler) {
      phase = "working";
      publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: desk.open ? "waiting for your answer" : "keeping an eye on the team" });
      return;
    }
    phase = "waiting";
    publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "waiting for research tools" });
    publish({ type: "run_waiting", reason: "research tools aren't connected yet", summary: WAITING_SUMMARY });
  }

  const offArrived = bus.on("agent_arrived", (event) => {
    if (event.cycle !== cycle) return;
    const where = event.target.kind === "module" ? event.target.moduleId : event.target.kind;
    at.set(event.agentId, where);
    if (event.target.kind === "home") {
      publish({ type: "agent_idle", agentId: event.agentId, task: phase === "answered" ? "done for now" : "ready" });
      return;
    }
    const working = phase === "working" || phase === "assigning";
    if (event.target.kind === "core" && working && scheduler) {
      if (event.agentId === ANALYST && analystSent && !gathered) return gather();
      if (event.agentId === CRITIC && criticSent) return brief();
      if (event.agentId === SYNTHESIZER && synthesizerSent) return void publish({ type: "agent_waiting", agentId: SYNTHESIZER, task: "waiting for a turn to answer" });
    }
    if (event.target.kind === "module" && event.target.moduleId === pathsModule && event.agentId === SYNTHESIZER) {
      return void publish({ type: "agent_waiting", agentId: SYNTHESIZER, task: "about to weigh the paths" });
    }
    if (event.target.kind === "module" && recheckTask !== null && plan!.tasks[recheckTask]?.agent === event.agentId) {
      return void publish({ type: "agent_waiting", agentId: event.agentId, task: "about to double-check" });
    }
    const task = travelling.get(event.agentId);
    if (task === undefined || event.target.kind !== "module") return;
    travelling.delete(event.agentId);
    publish({ type: "agent_waiting", agentId: event.agentId, task: scheduler ? "waiting for a turn" : task });
  });
  const offLanded = bus.on("artifact_handoff_completed", (event) => {
    if (event.cycle !== cycle) return;
    const handoff = handoffs.get(event.artifactId);
    if (!handoff) return;
    handoffs.delete(event.artifactId);
    handoff.landed();
  });

  /** Only the user's answer holds the team up, so that wait doesn't count toward the work deadline. */
  const waitingOnYou = () => !desk.settled && scheduler !== null && isSettled(scheduler.status("combine")) && scheduler.status("critique") === "pending";

  return {
    step(dt) {
      const time = now();
      desk.step();
      if (waitingOnYou()) deadline += dt;
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
        for (const { step, usage } of usageInbox.splice(0)) recordUsage(agentFor(step), step.kind, usage);
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
    answer(requestId, value) {
      const ok = desk.answer(requestId, value);
      if (ok && !desk.open && at.get(PLANNER_AGENT) !== undefined && phase === "working") publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "keeping an eye on the team" });
      return ok;
    },
    skip(requestId) {
      const ok = desk.skip(requestId);
      if (ok && !desk.open && at.get(PLANNER_AGENT) !== undefined && phase === "working") publish({ type: "agent_waiting", agentId: PLANNER_AGENT, task: "keeping an eye on the team" });
      return ok;
    },
    get phase() {
      return phase;
    },
    endedAt: null,
    dispose() {
      controller.abort();
      scheduler?.cancel();
      offArrived();
      offLanded();
    },
  };
}
