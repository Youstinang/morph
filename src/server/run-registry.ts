import type { StepContext } from "@/orchestration/agent-steps";
import { LIVE_LIMITS, doubtedTask, type AgentStep, type CombineResult, type CritiqueResult, type PathsResult, type QuestionReply, type RecheckResult, type ResearchResult, type SynthesisResult } from "@/state/live-work";
import type { Plan, PlanUsage } from "@/state/plan";

/**
 * The server's record of each live question: its plan, the team's results and what it has spent. The
 * browser only names a step; the server builds every prompt from this record and refuses steps once the
 * question reaches its call or spending limit. In memory, like the rate limiter: one instance, lost on
 * restart, and records expire after a while.
 */

export interface RunRecord extends StepContext {
  id: string;
  createdAt: number;
  calls: number;
  usd: number;
  attempts: Map<string, number>;
  findings: Map<number, ResearchResult>;
  combined: CombineResult | null;
  critique: CritiqueResult | null;
  recheck: RecheckResult | null;
  paths: PathsResult | null;
  answer: SynthesisResult | null;
  replies: Map<number, QuestionReply>;
}

export interface RunRegistry {
  open(objective: string, plan: Plan, usage: PlanUsage): string;
  get(id: string): RunRecord | null;
  /** Why this step can't be run now, or null if it can. */
  refuse(run: RunRecord, step: AgentStep): { reason: string; stop: boolean } | null;
  /** Counts an attempt before the call is made, so concurrent requests can't overrun the limits. */
  begin(run: RunRecord, step: AgentStep): void;
  charge(run: RunRecord, usage: { inputTokens: number; outputTokens: number; estimatedUsd: number } | null): void;
}

interface Options {
  ttlMs?: number;
  maxRuns?: number;
  now?: () => number;
  newId?: () => string;
}

export const stepKey = (step: AgentStep) => (step.kind === "research" ? `research-${step.task}` : step.kind);

export function createRunRegistry(options: Options = {}): RunRegistry {
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  const maxRuns = options.maxRuns ?? 500;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const runs = new Map<string, RunRecord>();
  /** Calls already started but not yet charged, so concurrent steps count against the call limit. */
  const inFlight = new Map<string, number>();

  function sweep() {
    const t = now();
    for (const [id, run] of runs) if (t - run.createdAt > ttlMs) runs.delete(id);
    while (runs.size > maxRuns) runs.delete(runs.keys().next().value!);
  }

  return {
    open(objective, plan, usage) {
      sweep();
      const id = newId();
      runs.set(id, {
        id,
        objective,
        plan,
        createdAt: now(),
        calls: usage.calls,
        usd: usage.estimatedUsd,
        attempts: new Map(),
        findings: new Map(),
        combined: null,
        critique: null,
        recheck: null,
        paths: null,
        answer: null,
        replies: new Map(),
      });
      return id;
    },
    get(id) {
      sweep();
      return runs.get(id) ?? null;
    },
    refuse(run, step) {
      const pending = inFlight.get(run.id) ?? 0;
      if (run.calls + pending >= LIVE_LIMITS.modelCalls) return { reason: "this question reached its limit of AI calls", stop: true };
      if (run.usd >= LIVE_LIMITS.usd) return { reason: "this question reached its spending limit", stop: true };
      const key = stepKey(step);
      if ((run.attempts.get(key) ?? 0) > LIVE_LIMITS.retries) return { reason: "this task already used its retries", stop: false };
      if (step.kind === "research") {
        if (!run.plan.tasks[step.task]) return { reason: "that task isn't in the plan", stop: false };
        if (run.findings.has(step.task)) return { reason: "that task is already done", stop: false };
        return null;
      }
      if (run.findings.size === 0) return { reason: "there are no findings to work from yet", stop: false };
      const done = { combine: run.combined, critique: run.critique, recheck: run.recheck, paths: run.paths, synthesis: run.answer }[step.kind];
      if (done) return { reason: "that step is already done", stop: false };
      if (step.kind === "paths" && !run.critique) return { reason: "Vex hasn't reviewed the work yet", stop: false };
      if (step.kind === "recheck") {
        const task = doubtedTask(run.critique);
        if (task === null || !run.findings.has(task)) return { reason: "Vex hasn't doubted a finding", stop: false };
      }
      return null;
    },
    begin(run, step) {
      const key = stepKey(step);
      run.attempts.set(key, (run.attempts.get(key) ?? 0) + 1);
      inFlight.set(run.id, (inFlight.get(run.id) ?? 0) + 1);
    },
    charge(run, usage) {
      const pending = (inFlight.get(run.id) ?? 1) - 1;
      if (pending > 0) inFlight.set(run.id, pending);
      else inFlight.delete(run.id);
      run.calls += 1;
      if (usage) run.usd += usage.estimatedUsd;
    },
  };
}
