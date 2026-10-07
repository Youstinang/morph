import { PlanResponseSchema, type PlanResponse } from "@/state/plan";
import type { PlanRequester } from "./live-question";

/** Asks the app's own `/api/plan` route; the reply is validated again here before anything uses it. */
export const requestPlan: PlanRequester = async (objective, signal) => {
  let response: Response;
  try {
    response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective }),
      signal,
    });
  } catch {
    return { ok: false, reason: "couldn't reach the server" };
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = PlanResponseSchema.safeParse(body);
  if (parsed.success) return parsed.data satisfies PlanResponse;
  return { ok: false, reason: `the server answered ${response.status}` };
};
