import { z } from "zod";
import { ModuleGroupSchema, NewEvidenceSchema, RecommendationSchema } from "@/state/domain";

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

  event("objective_received", { objectiveId: Id, text: z.string().min(1).max(600) }),
  event("planning_started", { agentId: Id }),
  event("plan_created", { agentId: Id, moduleIds: z.array(Id) }),

  event("workspace_morph_started", { reason: z.string().min(1).max(240) }),
  event("workspace_morph_completed", {}),
  event("module_reserved", { module: EventModuleSchema }),
  event("module_created", { module: EventModuleSchema }),
  event("module_updated", { moduleId: Id, headline: z.string().min(1).max(60), detail: z.string().max(120) }),
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
  event("assumption_created", { assumptionId: Id, statement: z.string().min(1).max(600), raisedBy: Id }),
  event("assumption_challenged", { assumptionId: Id, by: Id, note: z.string().min(1).max(600) }),
  event("assumption_resolved", { assumptionId: Id, status: z.enum(["confirmed", "rejected"]), evidenceId: Id.nullable() }),

  event("human_input_requested", { requestId: Id, question: z.string().min(1).max(600), askedBy: Id }),
  event("human_input_received", { requestId: Id, answer: z.string().min(1).max(200), answeredBy: z.enum(["user", "autoplay"]) }),

  event("scenario_created", { scenarios: z.array(ScenarioInputSchema).min(1) }),
  event("scenario_updated", { scenarios: z.array(ScenarioInputSchema).min(1) }),
  event("recommendation_updated", { recommendation: RecommendationSchema.omit({ updatedAt: true }) }),
  event("synthesis_started", { agentIds: z.array(Id).min(1) }),
  event("synthesis_completed", { agentIds: z.array(Id).min(1) }),
]);

/** The optional one-line, outcome-level summary narrated for story moments. */
const SummarySchema = z.string().min(1).max(240).optional();

export type EventDraft = z.infer<typeof EventDraftSchema> & { summary?: string };
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
});

/** Validates an untrusted draft; returns null instead of throwing. */
export function parseDraft(input: unknown): EventDraft | null {
  if (typeof input !== "object" || input === null) return null;
  const { summary, ...rest } = input as { summary?: unknown };
  const body = EventDraftSchema.safeParse(rest);
  const note = SummarySchema.safeParse(summary);
  if (!body.success || !note.success) return null;
  return note.data === undefined ? body.data : { ...body.data, summary: note.data };
}

export function parseEvent(input: unknown): WorkspaceEvent | null {
  const envelope = EnvelopeSchema.safeParse(input);
  const draft = parseDraft(input);
  if (!envelope.success || !draft) return null;
  const { seq, at, cycle, source } = envelope.data;
  return { ...draft, seq, at, cycle, source };
}
