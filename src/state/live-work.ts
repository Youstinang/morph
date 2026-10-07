import { z } from "zod";
import { InputValueSchema } from "./input-controls";
import { PlanUsageSchema } from "./plan";

/**
 * The contract for the team's work on a live question after planning, shared by the server (which makes
 * the model calls) and the browser (which schedules the work and shows it). Researchers search the web
 * first when the server has search; a finding that cites the search's sources is recorded as a tool result
 * summarized by the AI, and everything else as the model's general knowledge. Neither is ever verified.
 */

/**
 * Limits for one live question (user choices 2026-10-07: raised with a hard stop kept; 10 cents once web
 * search was added). The plan counts too; a research step with a search is two model calls.
 */
export const LIVE_LIMITS = {
  concurrency: 4,
  taskSeconds: 60,
  retries: 2,
  modelCalls: 30,
  usd: 0.1,
} as const;

export const AI_KNOWLEDGE_LABEL = "AI general knowledge, not checked against sources";
export const AI_SUMMARY_LABEL = "AI summary of the team's findings, not checked against sources";
export const WEB_SEARCH_TOOL = "web_search";

const Text = (max: number) => z.string().trim().min(1).max(max);
const Key = z.string().regex(/^(none|[af]\d)$/);

/** A page the web search returned. Only http(s) links are kept, so a link can never run script. */
export const WebSourceSchema = z.object({ url: z.url({ protocol: /^https?$/ }).max(500), title: Text(160) }).strict();
export type WebSource = z.infer<typeof WebSourceSchema>;
/** A page's site as people say it: the host name without "www.". */
export const siteOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
/** What the web search tool returns: short notes written from the pages, and the pages themselves. */
export const WebNotesSchema = z.object({ notes: Text(1500), sources: z.array(WebSourceSchema).min(1).max(5) }).strict();
export type WebNotes = z.infer<typeof WebNotesSchema>;

/**
 * `sources` are the search's pages the finding rests on (empty when it rests on general knowledge);
 * `searchNote` says why there was no search to work from, when one was expected.
 */
export const ResearchResultSchema = z
  .object({
    finding: Text(160),
    headline: Text(40),
    detail: Text(80),
    kind: z.enum(["fact", "risk", "constraint"]),
    sources: z.array(WebSourceSchema).max(3).optional(),
    searchNote: Text(120).optional(),
  })
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

/**
 * Lume's weighing of 2–3 different paths. `assessment` is a rough relative rating of fit, a judgment and
 * never a probability; `basis` names the findings each path rests on.
 */
export const PathResultSchema = z
  .object({ label: Text(32), assessment: z.number().min(0).max(1), why: Text(140), risk: Text(120), basis: z.array(Key).max(4) })
  .strict();
export const PathsResultSchema = z.object({ paths: z.array(PathResultSchema).min(2).max(3) }).strict();
export type PathsResult = z.infer<typeof PathsResultSchema>;

export const RunIdSchema = z.string().regex(/^[\w-]{8,64}$/);

/**
 * The steps the browser may ask for. A re-check names no finding: the server re-checks the one Vex doubted.
 */
export const AgentStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), task: z.number().int().min(0).max(4) }).strict(),
  z.object({ kind: z.literal("combine") }).strict(),
  z.object({ kind: z.literal("critique") }).strict(),
  z.object({ kind: z.literal("recheck") }).strict(),
  z.object({ kind: z.literal("paths") }).strict(),
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
  z.object({ ok: z.literal(true), kind: z.literal("paths"), result: PathsResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(true), kind: z.literal("synthesis"), result: SynthesisResultSchema, usage: PlanUsageSchema }),
  z.object({ ok: z.literal(false), reason: Text(200), stop: z.boolean().optional(), usage: PlanUsageSchema.optional() }),
]);
export type StepResponse = z.infer<typeof StepResponseSchema>;

/**
 * The user's reply to one of Nova's questions, sent so the server's record (and so Vex's and Lume's
 * prompts) include it. `question` is the question's place in the plan; the server checks the value against
 * that question's control. No model call is made.
 */
export const AnswerRequestSchema = z
  .object({
    runId: RunIdSchema,
    question: z.number().int().min(0).max(9),
    reply: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("answer"), value: InputValueSchema }).strict(),
      z.object({ kind: z.literal("skip") }).strict(),
    ]),
  })
  .strict();
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;
export const AnswerResponseSchema = z.union([z.object({ ok: z.literal(true) }).strict(), z.object({ ok: z.literal(false), reason: Text(200) }).strict()]);
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;
/** What the server keeps of a reply: how the answer reads, or that the user skipped the question. */
export type QuestionReply = { kind: "answer"; display: string } | { kind: "skip" };

export const findingKey = (task: number) => `f${task + 1}`;
export const assumptionKey = (index: number) => `a${index + 1}`;
/** The plan task whose finding a critique doubts, if it doubts one. */
export const doubtedTask = (critique: CritiqueResult | null) => (critique && /^f\d$/.test(critique.target) ? Number(critique.target.slice(1)) - 1 : null);
