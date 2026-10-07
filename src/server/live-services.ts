import { parseEnvironment } from "@/config/environment";
import { LIVE_LIMITS } from "@/state/live-work";
import { createOpenAiProvider } from "./providers/openai";
import type { AiProvider } from "./providers/types";
import { createWebSearchTool } from "./tools/web-search";
import type { WebSearch } from "@/orchestration/agent-steps";
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
  /** Running behind Vercel's proxy, whose client-address headers can be believed. */
  trustProxy: boolean;
}

const shared = globalThis as typeof globalThis & { __morphLive?: LiveServices };

export function liveServices(): LiveServices {
  shared.__morphLive ??= {
    runs: createRunRegistry(),
    planLimiter: createRateLimiter({ perClient: { limit: 5, windowMs: 60_000 }, global: { limit: 60, windowMs: 60 * 60_000 } }),
    stepLimiter: createRateLimiter({ perClient: { limit: 60, windowMs: 60_000 }, global: { limit: 600, windowMs: 60 * 60_000 } }),
    trustProxy: parseEnvironment(process.env).VERCEL === "1",
  };
  return shared.__morphLive;
}

export function liveProvider(): AiProvider | null {
  const env = parseEnvironment(process.env);
  if (!env.OPENAI_API_KEY) return null;
  // Ends a call just before the browser gives up on the task, so the server's answer can still arrive.
  return createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.MORPH_PLANNER_MODEL, timeoutMs: LIVE_LIMITS.taskSeconds * 1000 - 2000 });
}

/** The web search for research steps, unless it is switched off with MORPH_WEB_SEARCH=off. */
export function liveSearch(): WebSearch | null {
  const env = parseEnvironment(process.env);
  if (!env.OPENAI_API_KEY || env.MORPH_WEB_SEARCH === "off") return null;
  return createWebSearchTool({ apiKey: env.OPENAI_API_KEY, model: env.MORPH_PLANNER_MODEL, timeoutMs: 25_000 });
}
