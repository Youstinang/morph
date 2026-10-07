import { AnswerResponseSchema, StepResponseSchema, type AnswerResponse, type StepResponse } from "@/state/live-work";
import { PlanResponseSchema, type PlanResponse } from "@/state/plan";
import type { AnswerRequester, PlanRequester, StepRequester } from "./live-question";

async function post(path: string, body: unknown, signal: AbortSignal): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

/** Asks the app's own `/api/plan` route; the reply is validated again here before anything uses it. */
export const requestPlan: PlanRequester = async (objective, signal) => {
  const reply = await post("/api/plan", { objective }, signal);
  if (!reply) return { ok: false, reason: "couldn't reach the server" };
  const parsed = PlanResponseSchema.safeParse(reply.body);
  if (parsed.success) return parsed.data satisfies PlanResponse;
  return { ok: false, reason: `the server answered ${reply.status}` };
};

/** Asks `/api/agent-step` for one agent's result; validated again here, like the plan. */
export const requestStep: StepRequester = async (runId, step, signal) => {
  const reply = await post("/api/agent-step", { runId, step }, signal);
  if (!reply) return { ok: false, reason: "couldn't reach the server" };
  const parsed = StepResponseSchema.safeParse(reply.body);
  if (parsed.success) return parsed.data satisfies StepResponse;
  return { ok: false, reason: `the server answered ${reply.status}` };
};

/** Sends the user's answer (or skip) to `/api/answer`, so the team's later steps take it into account. */
export const requestAnswer: AnswerRequester = async (request, signal) => {
  const reply = await post("/api/answer", request, signal);
  if (!reply) return { ok: false, reason: "couldn't reach the server" };
  const parsed = AnswerResponseSchema.safeParse(reply.body);
  if (parsed.success) return parsed.data satisfies AnswerResponse;
  return { ok: false, reason: `the server answered ${reply.status}` };
};
