import { z } from "zod";
import { PlanUsageSchema } from "./plan";

/**
 * The contract for the team's work on a live question after planning, shared by the server (which makes
 * the model calls) and the browser (which schedules the work and shows it). With no research tools yet,
 * every result is the model's general knowledge: recorded as unverified model evidence, never as a fact.
 */

/** Limits for one live question (user choice 2026-10-07: raised, with a hard stop kept). The plan counts too. */
export const LIVE_LIMITS = {
  concurrency: 4,
  taskSeconds: 60,
  retries: 2,
  modelCalls: 30,
  usd: 0.05,
} as const;

export const AI_KNOWLEDGE_LABEL = "AI general knowledge, not checked against sources";

const Text = (max: number) => z.string().trim().min(1).max(max);
const Key = z.string().regex(/^(none|[af]\d)$/);

export const ResearchResultSchema = z
  .object({ finding: Text(160), headline: Text(40), detail: Text(80), kind: z.enum(["fact", "risk", "constraint"]) })
  .strict();
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

/** `target` is a plan assumption (`a1`), a finding (`f2`) or `none`. */
export const CritiqueResultSchema = z.object({ target: Key, headline: Text(40), note: Text(160) }).strict();
export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

/** `basis` lists the findings (`f1`…) the answer rests on. Confidence is never "high" without research. */
export const SynthesisResultSchema = z
  .object({ statement: Text(90), reason: Text(320), confidence: z.enum(["low", "moderate"]), basis: z.array(Key).max(6) })
  .strict();
export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;

/** Sage's combined view of the findings handed to her. */
export const CombineResultSchema = z.object({ insight: Text(160), headline: Text(40) }).strict();
export type CombineResult = z.infer<typeof CombineResultSchema>;

/** A researcher's second look at the finding Vex doubted: it stands, or a revised finding replaces it. */
export const RecheckResultSchema = ResearchResultSchema.extend({ verdict: z.enum(["kept", "revised"]) }).strict();
export type RecheckResult = z.infer<typeof RecheckResultSchema>;

export const RunIdSchema = z.string().regex(/^[\w-]{8,64}$/);

/**
 * The steps the browser may ask for. A re-check names no finding: the server re-checks the one Vex doubted.
 */
export const AgentStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), task: z.number().int().min(0).max(4) }).strict(),
  z.object({ kind: z.literal("combine") }).strict(),
  z.object({ kind: z.literal("critique") }).strict(),
  z.object({ kind: z.literal("recheck") }).strict(),
  z.object({ kind: z.literal("synthesis") }).strict(),
]);
export type AgentStep = z.infer<typeof AgentStepSchema>;

export const StepRequestSchema = z.object({ runId: RunIdSchema, step: AgentStepSchema }).strict();
export type StepRequest = z.infer<typeof StepRequestSchema>;

/** What `/api/agent-step` returns. `stop` means the question can't make further calls (limit reached, expired). */
export const StepResponseSchema = z.union([
  z.object({ ok: z.literal(true), kind: z.literal("research"), result: ResearchResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(true), kind: z.literal("combine"), result: CombineResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(true), kind: z.literal("critique"), result: CritiqueResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(true), kind: z.literal("recheck"), result: RecheckResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(true), kind: z.literal("synthesis"), result: SynthesisResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(false), reason: Text(200), stop: z.boolean().optional(), usage: PlanUsageSchema.optional() }),
]);
export type StepResponse = z.infer<typeof StepResponseSchema>;

export const findingKey = (task: number) => `f${task + 1}`;
export const assumptionKey = (index: number) => `a${index + 1}`;
/** The plan task whose finding a critique doubts, if it doubts one. */
export const doubtedTask = (critique: CritiqueResult | null) => (critique && /^f\d$/.test(critique.target) ? Number(critique.target.slice(1)) - 1 : null);
