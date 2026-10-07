import { z } from "zod";
import { FocusSchema, ModuleGroupSchema, NewEvidenceSchema, ProvenanceSchema, RecommendationSchema, WhySchema } from "@/state/domain";

/**
 * Typed `WorkspaceEvent`s: everything that happens in a MORPH run, in order. Events reference state by id,
 * carry outcome-level summaries only (never private reasoning or secrets), and leave visual timing — walk
 * speed, easing, flight duration — to the world layer.
 */

const Id = z.string().min(1).max(80);
const Task = z.string().max(200);

export const EVENT_SOURCES = ["user", "demo", "orchestrator", "world"] as const;
export const EventSourceSchema = z.enum(EVENT_SOURCES);
/** `user` is trusted human input, `demo` the scripted timeline, `orchestrator` the real runtime, `world` physical reports from the 3D world. */
export type EventSource = z.infer<typeof EventSourceSchema>;

export const AgentTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("module"), moduleId: Id }),
  z.object({ kind: z.literal("core") }),
  z.object({ kind: z.literal("home") }),
]);
export type AgentTarget = z.infer<typeof AgentTargetSchema>;

export const TravelSchema = z.enum(["moving", "returning", "retrying"]);
export type Travel = z.infer<typeof TravelSchema>;

export const EventModuleSchema = z.object({
  id: Id,
  title: z.string().min(1).max(60),
  /** Open-ended kind; the world maps kinds to registered workstations. */
  kind: Id,
  group: ModuleGroupSchema,
});
export type EventModule = z.infer<typeof EventModuleSchema>;

const ScenarioInputSchema = z.object({ id: Id, label: z.string().min(1).max(60), assessment: z.number().min(0).max(1) });
const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

export const EventDraftSchema = z.discriminatedUnion("type", [
  event("run_started", { workspaceId: Id, mode: z.enum(["demo", "real"]) }),
  /** The run can't go further on its own for now (for example, a capability isn't connected yet). */
  event("run_waiting", { reason: z.string().min(1).max(240) }),
  event("run_failed", { reason: z.string().min(1).max(240) }),
  /** Usage of one finished AI call; never the prompt, the reply or the provider's name. */
  event("model_call_completed", {
    agentId: Id,
    purpose: z.string().min(1).max(40),
    calls: z.number().int().min(1).max(10),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedUsd: z.number().nonnegative(),
  }),

  event("objective_received", { objectiveId: Id, text: z.string().min(1).max(600) }),
  event("objective_updated", { status: z.enum(["planning", "in_progress", "answered"]) }),
  event("planning_started", { agentId: Id }),
  event("plan_created", { agentId: Id, moduleIds: z.array(Id) }),

  event("workspace_morph_started", { reason: z.string().min(1).max(240) }),
  event("workspace_morph_completed", {}),
  event("module_reserved", { module: EventModuleSchema }),
  event("module_created", { module: EventModuleSchema, replaces: Id.optional() }),
  event("module_updated", {
    moduleId: Id,
    changes: z.object({
      title: z.string().min(1).max(60).optional(),
      collapsed: z.boolean().optional(),
      summary: z.object({ headline: z.string().min(1).max(60), detail: z.string().max(120) }).nullable().optional(),
    }),
  }),
  event("module_moved", { moduleId: Id, group: ModuleGroupSchema }),
  event("module_resized", { moduleId: Id, size: z.number().min(0.7).max(1.15) }),
  event("module_emphasized", { moduleId: Id, emphasis: z.enum(["normal", "emphasized", "muted"]) }),
  event("module_removed", { moduleId: Id }),

  event("agent_assigned", { agentId: Id, target: AgentTargetSchema, task: Task, travel: TravelSchema }),
  event("agent_move_started", { agentId: Id, target: AgentTargetSchema, travel: TravelSchema }),
  event("agent_arrived", { agentId: Id, target: AgentTargetSchema }),
  event("agent_work_started", {
    agentId: Id,
    activity: z.enum(["working", "evaluating", "collaborating"]),
    task: Task,
    moduleId: Id.nullable(),
  }),
  event("sources_checked", { agentId: Id, moduleId: Id, total: z.number().int().nonnegative() }),
  event("task_completed", { agentId: Id, task: Task, moduleId: Id.nullable() }),
  event("task_failed", { agentId: Id, task: Task, moduleId: Id.nullable() }),
  event("retry_requested", { by: Id, agentId: Id, assumptionId: Id.nullable() }),
  event("retry_started", { agentId: Id, task: Task, moduleId: Id.nullable() }),
  event("agent_waiting", { agentId: Id, task: Task }),
  event("agent_idle", { agentId: Id, task: Task }),
  event("agent_collaboration_started", { agentIds: z.array(Id).min(2), moduleId: Id.nullable() }),

  event("artifact_handoff_started", {
    artifactId: Id,
    kind: z.enum(["evidence", "insight", "flag"]),
    from: Id,
    to: Id,
    task: Task,
  }),
  event("artifact_handoff_completed", { artifactId: Id, kind: z.enum(["evidence", "insight", "flag"]), from: Id, to: Id }),

  event("tool_started", { toolCallId: Id, agentId: Id, tool: Id }),
  event("tool_completed", { toolCallId: Id }),
  event("tool_failed", { toolCallId: Id, reason: z.string().min(1).max(240) }),

  event("evidence_discovered", { evidence: NewEvidenceSchema }),
  event("evidence_removed", { evidenceId: Id, supersededBy: Id.nullable() }),
  event("assumption_created", { assumptionId: Id, statement: z.string().min(1).max(600), raisedBy: Id }),
  event("assumption_challenged", { assumptionId: Id, by: Id, note: z.string().min(1).max(600) }),
  event("assumption_resolved", { assumptionId: Id, status: z.enum(["confirmed", "rejected"]), evidenceId: Id.nullable() }),

  event("human_input_requested", { requestId: Id, question: z.string().min(1).max(600), askedBy: Id }),
  event("human_input_received", { requestId: Id, answer: z.string().min(1).max(200), answeredBy: z.enum(["user", "autoplay"]) }),
  event("human_input_skipped", { requestId: Id, skippedBy: z.enum(["user", "autoplay"]) }),

  event("scenario_created", { scenario: ScenarioInputSchema }),
  event("scenario_updated", { scenario: ScenarioInputSchema }),
  event("recommendation_updated", { recommendation: RecommendationSchema.omit({ updatedAt: true }) }),
  event("synthesis_started", { agentIds: z.array(Id).min(1) }),
  event("synthesis_completed", { agentIds: z.array(Id).min(1) }),

  event("task_assigned", { agentId: Id, task: Task, moduleId: Id.nullable() }),
  event("camera_focus_requested", { target: FocusSchema }),
  event("operation_rejected", { operationId: Id.nullable(), operationType: z.string().max(40).nullable(), reason: z.string().min(1).max(240) }),
]);

/** The optional one-line, outcome-level summary narrated for story moments. */
const SummarySchema = z.string().min(1).max(240).optional();

/** The accepted operation behind a record event: its id, type, who proposed it and why. */
export const OperationRefSchema = z.object({
  id: Id,
  type: z.string().min(1).max(40),
  source: ProvenanceSchema,
  why: WhySchema.optional(),
});
export type OperationRef = z.infer<typeof OperationRefSchema>;

/** Events that report a change to the canonical record. Only the operation gate may publish them. */
export const RECORD_EVENTS = new Set<string>([
  "objective_received",
  "objective_updated",
  "module_reserved",
  "module_created",
  "module_updated",
  "module_moved",
  "module_resized",
  "module_emphasized",
  "module_removed",
  "evidence_discovered",
  "evidence_removed",
  "assumption_created",
  "assumption_challenged",
  "assumption_resolved",
  "scenario_created",
  "scenario_updated",
  "recommendation_updated",
  "human_input_requested",
  "human_input_received",
  "human_input_skipped",
  "task_assigned",
  "camera_focus_requested",
]);

export type EventDraft = z.infer<typeof EventDraftSchema> & { summary?: string; operation?: OperationRef };
export type EventType = EventDraft["type"];
export const EVENT_TYPES = EventDraftSchema.options.map((option) => option.shape.type.value) as readonly EventType[];

export interface EventEnvelope {
  /** Strictly increasing within a bus. */
  seq: number;
  /** Seconds on the run clock. */
  at: number;
  cycle: number;
  source: EventSource;
}
export type WorkspaceEvent = EventDraft & EventEnvelope;
export type EventOf<T extends EventType> = Extract<WorkspaceEvent, { type: T }>;

export const EnvelopeSchema = z.object({
  seq: z.number().int().positive(),
  at: z.number().finite().nonnegative(),
  cycle: z.number().int().nonnegative(),
  source: EventSourceSchema,
  summary: SummarySchema,
  operation: OperationRefSchema.optional(),
});

/**
 * Validates an untrusted draft; returns null instead of throwing. A record event without the operation that
 * caused it is refused, so nothing but the operation gate can report a change to the record.
 */
export function parseDraft(input: unknown): EventDraft | null {
  if (typeof input !== "object" || input === null) return null;
  const { summary, operation, ...rest } = input as { summary?: unknown; operation?: unknown };
  const body = EventDraftSchema.safeParse(rest);
  const note = SummarySchema.safeParse(summary);
  const ref = OperationRefSchema.optional().safeParse(operation);
  if (!body.success || !note.success || !ref.success) return null;
  if (RECORD_EVENTS.has(body.data.type) !== (ref.data !== undefined)) return null;
  return {
    ...body.data,
    ...(note.data === undefined ? {} : { summary: note.data }),
    ...(ref.data === undefined ? {} : { operation: ref.data }),
  };
}

export function parseEvent(input: unknown): WorkspaceEvent | null {
  const envelope = EnvelopeSchema.safeParse(input);
  const draft = parseDraft(input);
  if (!envelope.success || !draft) return null;
  const { seq, at, cycle, source } = envelope.data;
  return { ...draft, seq, at, cycle, source };
}
