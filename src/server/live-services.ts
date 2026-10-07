import { parseEnvironment } from "@/config/environment";
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
  return env.OPENAI_API_KEY ? createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.MORPH_PLANNER_MODEL }) : null;
}
