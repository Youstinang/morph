import { parseEnvironment } from "@/config/environment";
import { LIVE_LIMITS } from "@/state/live-work";
import { createOpenAiProvider } from "./providers/openai";
import type { AiProvider } from "./providers/types";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { createRunRegistry, type RunRegistry } from "./run-registry";

/**
 * One shared set of live-AI services per server process. Route modules can be bundled separately, so the
 * shared in-memory records live on `globalThis` rather than in module scope.
 */
interface LiveServices {
  runs: RunRegistry;
  planLimiter: RateLimiter;
  stepLimiter: RateLimiter;
}

const shared = globalThis as typeof globalThis & { __morphLive?: LiveServices };

export function liveServices(): LiveServices {
  shared.__morphLive ??= {
    runs: createRunRegistry(),
    planLimiter: createRateLimiter({ perClient: { limit: 5, windowMs: 60_000 }, global: { limit: 60, windowMs: 60 * 60_000 } }),
    stepLimiter: createRateLimiter({ perClient: { limit: 60, windowMs: 60_000 }, global: { limit: 600, windowMs: 60 * 60_000 } }),
  };
  return shared.__morphLive;
}

export function liveProvider(): AiProvider | null {
  const env = parseEnvironment(process.env);
  if (!env.OPENAI_API_KEY) return null;
  // Ends a call just before the browser gives up on the task, so the server's answer can still arrive.
  return createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.MORPH_PLANNER_MODEL, timeoutMs: LIVE_LIMITS.taskSeconds * 1000 - 2000 });
}
