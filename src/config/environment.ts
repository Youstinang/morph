import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
