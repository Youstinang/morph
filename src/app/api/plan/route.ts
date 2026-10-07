import { parseEnvironment } from "@/config/environment";
import { createPlanHandler } from "@/server/plan-handler";
import { createOpenAiProvider } from "@/server/providers/openai";
import { createRateLimiter } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createPlanHandler({
  provider: () => {
    const env = parseEnvironment(process.env);
    return env.OPENAI_API_KEY ? createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.MORPH_PLANNER_MODEL }) : null;
  },
  limiter: createRateLimiter({
    perClient: { limit: 5, windowMs: 60_000 },
    global: { limit: 60, windowMs: 60 * 60_000 },
  }),
});

export const POST = handler;
