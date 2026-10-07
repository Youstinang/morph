import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Server-side only. Without it, live questions are turned off and the demo still works. */
  OPENAI_API_KEY: z.string().trim().min(20).optional().or(z.literal("").transform(() => undefined)),
  MORPH_PLANNER_MODEL: z.string().trim().min(1).max(60).default("gpt-5.6-luna"),
  /** Researchers search the web first (OpenAI's built-in search, about 1 cent a search); "off" saves that cost. */
  MORPH_WEB_SEARCH: z.enum(["on", "off"]).default("on"),
  /** Set to "1" by Vercel; its proxy overwrites the client-address headers, so they can be believed. */
  VERCEL: z.string().optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

/** Parse explicitly supported settings; ignore unrelated process variables. */
export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    // Report field names only; configuration values may contain secrets.
    throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
  }

  return result.data;
}
