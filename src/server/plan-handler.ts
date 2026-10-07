import { z } from "zod";
import { planObjective } from "@/orchestration/planner";
import { OBJECTIVE_LIMITS, type PlanResponse } from "@/state/plan";
import { clientId, json, readJson } from "./http";
import type { AiProvider } from "./providers/types";
import type { RateLimiter } from "./rate-limit";
import type { RunRegistry } from "./run-registry";

const MAX_BODY_BYTES = 4000;
const RequestSchema = z.object({ objective: z.string().trim().min(OBJECTIVE_LIMITS.min).max(OBJECTIVE_LIMITS.max) }).strict();

export interface PlanHandlerDeps {
  /** Null when live AI isn't configured (no key on the server). */
  provider: () => AiProvider | null;
  limiter: RateLimiter;
  /** Where the question is kept for the team's later steps; without it, plans come back without a run id. */
  runs?: RunRegistry;
}

const reply = (body: PlanResponse, status: number, headers: Record<string, string> = {}) => json(body, status, headers);

/**
 * POST { objective } → a validated plan, or a short reason. Checks run cheapest first, so malformed or
 * rate-limited requests never reach the model. The question text is never logged.
 */
export function createPlanHandler(deps: PlanHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    const provider = deps.provider();
    if (!provider) return reply({ ok: false, reason: "Live AI isn't set up on this server." }, 503);

    const read = await readJson(request, MAX_BODY_BYTES);
    if (!read.ok) {
      return read.error === "too_large"
        ? reply({ ok: false, reason: "The question is too long." }, 413)
        : reply({ ok: false, reason: "The request wasn't readable." }, 400);
    }
    const parsed = RequestSchema.safeParse(read.body);
    if (!parsed.success) {
      return reply({ ok: false, reason: `Questions need ${OBJECTIVE_LIMITS.min} to ${OBJECTIVE_LIMITS.max} characters.` }, 400);
    }

    const allowed = deps.limiter.take(clientId(request));
    if (!allowed.ok) {
      return reply({ ok: false, reason: `Too many questions just now. Try again in ${allowed.retryAfterSeconds} seconds.` }, 429, {
        "Retry-After": String(allowed.retryAfterSeconds),
      });
    }

    const result = await planObjective(provider, parsed.data.objective, { signal: request.signal });
    if (result.ok) {
      const runId = deps.runs?.open(parsed.data.objective, result.plan, result.usage);
      return reply({ ok: true, plan: result.plan, usage: result.usage, ...(runId ? { runId } : {}) }, 200);
    }
    console.warn(`[plan] failed after ${result.usage.calls} call(s): ${result.reason}`);
    return reply({ ok: false, reason: result.reason, usage: result.usage }, 502);
  };
}
