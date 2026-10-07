import { z } from "zod";
import { InputControlSchema, InputValueSchema } from "./input-controls";

/**
 * Canonical workspace model. It holds facts only; motion (positions, routes, facing) belongs to the world
 * layer, which derives it from these facts. Times are seconds on the workspace clock.
 */

const Id = z.string().min(1).max(80);
const Text = z.string().min(1).max(600);
const Time = z.number().finite().nonnegative();

export const AGENT_STATES = [
  "idle",
  "assigned",
  "moving",
  "working",
  "waiting",
  "handoff",
  "collaborating",
  "evaluating",
  "blocked",
  "failed",
  "retrying",
  "completed",
  "returning",
] as const;
export const AgentStateSchema = z.enum(AGENT_STATES);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentRoleSchema = z.enum(["planner", "researcher", "analyst", "builder", "critic", "synthesizer"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentSchema = z.object({
  id: Id,
  name: z.string().min(1).max(40),
  role: AgentRoleSchema,
  state: AgentStateSchema,
  task: z.string().max(200),
  moduleId: Id.nullable(),
  progress: z.number().min(0).max(1),
});
export type Agent = z.infer<typeof AgentSchema>;
export const AgentPatchSchema = AgentSchema.omit({ id: true, name: true, role: true }).partial();
export type AgentPatch = z.infer<typeof AgentPatchSchema>;

export const AgentTaskSchema = z.object({
  id: Id,
  agentId: Id,
  title: z.string().min(1).max(200),
  moduleId: Id.nullable(),
  status: z.enum(["active", "done", "failed"]),
  startedAt: Time,
  endedAt: Time.nullable(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const ObjectiveSchema = z.object({
  id: Id,
  text: Text,
  status: z.enum(["received", "planning", "in_progress", "answered"]),
  receivedAt: Time,
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const ModuleGroupSchema = z.enum(["research", "analysis", "decision"]);
export type ModuleGroup = z.infer<typeof ModuleGroupSchema>;

export const WorkspaceModuleSchema = z.object({
  id: Id,
  title: z.string().min(1).max(60),
  /** Open-ended kind, e.g. "market" or "valuation"; the world maps kinds to registered workstations. */
  kind: Id,
  group: ModuleGroupSchema,
  status: z.enum(["reserved", "open", "closing"]),
  emphasis: z.enum(["normal", "emphasized", "muted"]),
  collapsed: z.boolean(),
  size: z.number().min(0.7).max(1.15),
  openedAt: Time.nullable(),
  /** The module's current one-line takeaway, shown on its panel. */
  summary: z.object({ headline: z.string().min(1).max(60), detail: z.string().max(120) }).nullable(),
});
export type WorkspaceModule = z.infer<typeof WorkspaceModuleSchema>;
export const ModulePatchSchema = WorkspaceModuleSchema.omit({ id: true, kind: true }).partial();
export type ModulePatch = z.infer<typeof ModulePatchSchema>;

/** Where a fact came from. Unsourced model statements are never marked verified. */
export const SourceSchema = z.object({
  kind: z.enum(["fixture", "user", "tool", "model"]),
  label: z.string().min(1).max(200),
  url: z.url({ protocol: /^https?$/ }).max(500).optional(),
  verified: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const EvidenceSchema = z.object({
  id: Id,
  statement: Text,
  kind: z.enum(["fact", "risk", "constraint"]),
  status: z.enum(["accepted", "superseded"]),
  moduleId: Id.nullable(),
  foundBy: Id,
  foundAt: Time,
  source: SourceSchema,
  supersededBy: Id.nullable(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
export const NewEvidenceSchema = EvidenceSchema.omit({ status: true, foundAt: true, supersededBy: true });
export type NewEvidence = z.infer<typeof NewEvidenceSchema>;

export const AssumptionSchema = z.object({
  id: Id,
  statement: Text,
  status: z.enum(["open", "challenged", "confirmed", "rejected"]),
  raisedBy: Id,
  raisedAt: Time,
  challenge: z.object({ by: Id, note: Text, at: Time }).nullable(),
  resolvedBy: Id.nullable(),
  resolvedAt: Time.nullable(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

/** `assessment` is a model-generated relative score, never a probability or an objective prediction. */
export const ScenarioSchema = z.object({
  id: Id,
  label: z.string().min(1).max(60),
  assessment: z.number().min(0).max(1),
  /** Why the path could work, its main risk, and the findings it rests on. */
  why: z.string().min(1).max(200).nullable().default(null),
  risk: z.string().min(1).max(160).nullable().default(null),
  evidenceIds: z.array(Id).max(6).default([]),
  updatedAt: Time,
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const RecommendationSchema = z.object({
  status: z.enum(["forming", "final"]),
  /** The team's current leaning, shown while the answer is still forming. */
  leaning: Text,
  statement: Text.nullable(),
  reason: Text.nullable(),
  confidence: z.enum(["low", "moderate", "high"]),
  evidenceIds: z.array(Id),
  updatedAt: Time,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const HumanInputRequestSchema = z.object({
  id: Id,
  question: Text,
  askedBy: Id,
  askedAt: Time,
  /** The trusted control the user answers with. */
  control: InputControlSchema,
  status: z.enum(["pending", "answered", "skipped"]),
  /** How the answer reads, and its raw value. */
  answer: z.string().min(1).max(200).nullable(),
  value: InputValueSchema.nullable(),
  answeredAt: Time.nullable(),
});
export type HumanInputRequest = z.infer<typeof HumanInputRequestSchema>;

export const ToolCallSchema = z.object({
  id: Id,
  agentId: Id,
  tool: Id,
  status: z.enum(["running", "succeeded", "failed", "cancelled"]),
  startedAt: Time,
  endedAt: Time.nullable(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const CostUsageSchema = z.object({
  modelCalls: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nonnegative(),
});
export type CostUsage = z.infer<typeof CostUsageSchema>;

/** What the camera is asked to pay attention to; a suggestion the camera director may honor. */
export const FocusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("module"), moduleId: Id }),
  z.object({ kind: z.literal("agent"), agentId: Id }),
  z.object({ kind: z.literal("overview") }),
]);
export type Focus = z.infer<typeof FocusSchema>;

/** Who proposed a change. `model` proposals are never trusted as verified evidence or as the human's answer. */
export const ProvenanceSchema = z.object({
  kind: z.enum(["user", "demo", "orchestrator", "model"]),
  agentId: Id.optional(),
  label: z.string().min(1).max(120).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** "Why did MORPH change?" metadata: an outcome-level reason, never private reasoning. */
export const WhySchema = z.object({
  reason: z.string().min(1).max(240),
  evidenceIds: z.array(Id).max(12).optional(),
  assumptionId: Id.optional(),
  agentId: Id.optional(),
});
export type Why = z.infer<typeof WhySchema>;

/** One entry of "Why did MORPH change?": what changed, in plain words, the reason given, and who proposed it. */
export const ChangeSchema = z.object({
  operationId: Id,
  operation: z.string().min(1).max(40),
  change: z.string().min(1).max(200),
  why: WhySchema,
  by: ProvenanceSchema,
  at: Time,
});
export type Change = z.infer<typeof ChangeSchema>;

export const WorkspaceSchema = z.object({
  id: Id,
  mode: z.enum(["demo", "real"]),
  time: Time,
  objective: ObjectiveSchema.nullable(),
  agentOrder: z.array(Id),
  agents: z.record(Id, AgentSchema),
  tasks: z.array(AgentTaskSchema),
  moduleOrder: z.array(Id),
  modules: z.record(Id, WorkspaceModuleSchema),
  evidence: z.array(EvidenceSchema),
  assumptions: z.array(AssumptionSchema),
  scenarios: z.array(ScenarioSchema),
  recommendation: RecommendationSchema.nullable(),
  humanInputs: z.array(HumanInputRequestSchema),
  toolCalls: z.array(ToolCallSchema),
  cost: CostUsageSchema,
  focus: FocusSchema.nullable(),
  /** The workspace's explained changes, oldest first (the most recent `MAX_CHANGES`). */
  changes: z.array(ChangeSchema),
  /** Ids of operations already applied in this run, so a repeated operation is refused. */
  appliedOperationIds: z.array(Id),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
