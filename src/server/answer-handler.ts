import { checkAnswer } from "@/state/input-controls";
import { AnswerRequestSchema, type AnswerResponse } from "@/state/live-work";
import { planControl } from "@/state/plan";
import { clientId, foreignRequest, json, readJson } from "./http";
import type { RateLimiter } from "./rate-limit";
import type { RunRegistry } from "./run-registry";

const MAX_BODY_BYTES = 1000;

export interface AnswerHandlerDeps {
  /** Believe the hosting proxy\'s client-address headers (only behind one that overwrites them). */
  trustProxy?: boolean;
  limiter: RateLimiter;
  runs: RunRegistry;
}

const reply = (body: AnswerResponse, status: number, headers: Record<string, string> = {}) => json(body, status, headers);

/**
 * POST { runId, question, reply } → records the user's answer to one of Nova's questions (or that they
 * skipped it) in the server's record, so the review and the answer take it into account. The value is
 * checked against the control the plan gave that question; no model call is made, and the answer is never
 * logged.
 */
export function createAnswerHandler(deps: AnswerHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    const foreign = foreignRequest(request);
    if (foreign) return reply({ ok: false, reason: foreign.reason }, foreign.status);
    const read = await readJson(request, MAX_BODY_BYTES);
    if (!read.ok) return reply({ ok: false, reason: "The request wasn't readable." }, read.error === "too_large" ? 413 : 400);
    const parsed = AnswerRequestSchema.safeParse(read.body);
    if (!parsed.success) return reply({ ok: false, reason: "The request wasn't readable." }, 400);
    const { runId, question, reply: answer } = parsed.data;

    const allowed = deps.limiter.take(clientId(request, deps.trustProxy ?? false));
    if (!allowed.ok) {
      return reply({ ok: false, reason: `Too many requests just now. Try again in ${allowed.retryAfterSeconds} seconds.` }, 429, {
        "Retry-After": String(allowed.retryAfterSeconds),
      });
    }

    const run = deps.runs.get(runId);
    if (!run) return reply({ ok: false, reason: "this question has expired; ask it again" }, 404);
    const asked = run.plan.questions[question];
    if (!asked) return reply({ ok: false, reason: "that question isn't in the plan" }, 409);
    if (run.replies.has(question)) return reply({ ok: false, reason: "that question is already answered" }, 409);
    if (answer.kind === "skip") {
      run.replies.set(question, { kind: "skip" });
      return reply({ ok: true }, 200);
    }
    const checked = checkAnswer(planControl(asked.control), answer.value);
    if (!checked.ok) return reply({ ok: false, reason: checked.reason }, 422);
    run.replies.set(question, { kind: "answer", display: checked.display });
    return reply({ ok: true }, 200);
  };
}
