import { runAgentStep } from "@/orchestration/agent-steps";
import { StepRequestSchema, doubtedTask, type StepResponse } from "@/state/live-work";
import { clientId, json, readJson } from "./http";
import type { AiProvider } from "./providers/types";
import type { RateLimiter } from "./rate-limit";
import type { RunRegistry } from "./run-registry";

const MAX_BODY_BYTES = 1000;

export interface StepHandlerDeps {
  provider: () => AiProvider | null;
  limiter: RateLimiter;
  runs: RunRegistry;
}

const reply = (body: StepResponse, status: number, headers: Record<string, string> = {}) => json(body, status, headers);

/**
 * POST { runId, step } → one agent's result for a live question, or a short reason. The browser only names
 * the step; the prompt is built from the server's record of the question, and the question's call and
 * spending limits are enforced here, so a modified browser can't overspend.
 */
export function createStepHandler(deps: StepHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    const provider = deps.provider();
    if (!provider) return reply({ ok: false, reason: "Live AI isn't set up on this server.", stop: true }, 503);

    const read = await readJson(request, MAX_BODY_BYTES);
    if (!read.ok) return reply({ ok: false, reason: "The request wasn't readable." }, read.error === "too_large" ? 413 : 400);
    const parsed = StepRequestSchema.safeParse(read.body);
    if (!parsed.success) return reply({ ok: false, reason: "The request wasn't readable." }, 400);
    const { runId, step } = parsed.data;

    const allowed = deps.limiter.take(clientId(request));
    if (!allowed.ok) {
      return reply({ ok: false, reason: `Too many requests just now. Try again in ${allowed.retryAfterSeconds} seconds.` }, 429, {
        "Retry-After": String(allowed.retryAfterSeconds),
      });
    }

    const run = deps.runs.get(runId);
    if (!run) return reply({ ok: false, reason: "this question has expired; ask it again", stop: true }, 404);
    const refused = deps.runs.refuse(run, step);
    if (refused) return reply({ ok: false, reason: refused.reason, stop: refused.stop }, 409);

    deps.runs.begin(run, step);
    const outcome = await runAgentStep(provider, run, step, request.signal);
    deps.runs.charge(run, outcome.usage);
    const usage = { calls: 1, ...(outcome.usage ?? { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }) };
    if (!outcome.ok) {
      console.warn(`[step] ${step.kind} failed: ${outcome.reason}`);
      return reply({ ok: false, reason: outcome.reason, usage }, 502);
    }
    if (outcome.kind === "research" && step.kind === "research") run.findings.set(step.task, outcome.result);
    if (outcome.kind === "combine") run.combined = outcome.result;
    if (outcome.kind === "critique") run.critique = outcome.result;
    if (outcome.kind === "synthesis") run.answer = outcome.result;
    if (outcome.kind === "recheck") {
      run.recheck = outcome.result;
      const task = doubtedTask(run.critique);
      if (task !== null && outcome.result.verdict === "revised") {
        const { finding, headline, detail, kind } = outcome.result;
        run.findings.set(task, { finding, headline, detail, kind });
      }
    }
    return reply({ ...outcome, usage }, 200);
  };
}
