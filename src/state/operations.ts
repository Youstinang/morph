import { z } from "zod";
import {
  FocusSchema,
  ModuleGroupSchema,
  NewEvidenceSchema,
  ProvenanceSchema,
  RecommendationSchema,
  WhySchema,
  type Workspace,
  type WorkspaceModule,
} from "./domain";
import { InputControlSchema, InputValueSchema } from "./input-controls";
import * as t from "./transitions";

/**
 * MorphOperations: the only way the canonical record of a run changes (agent activity aside). An AI, the
 * orchestrator, the demo timeline or the user proposes one; `applyMorphOperation` validates it against the
 * schema and the current workspace and either applies it deterministically or refuses it with a reason.
 * Operations are data only: they can never carry code or markup that gets executed or rendered as HTML.
 */

const Id = z.string().min(1).max(80).regex(/^[\w.:#-]+$/, "ids may only use letters, digits and . : # - _");
const Line = (max: number) => z.string().trim().min(1).max(max);

const base = {
  id: Id,
  source: ProvenanceSchema,
  why: WhySchema.optional(),
};
const op = <T extends string, S extends z.ZodRawShape>(operation: T, shape: S) =>
  z.object({ operation: z.literal(operation), ...base, ...shape }).strict();

const ModuleInputSchema = z
  .object({ id: Id, title: Line(60), kind: Id, group: ModuleGroupSchema, size: z.number().min(0.7).max(1.15).optional() })
  .strict();
const SummarySchema = z.object({ headline: Line(60), detail: z.string().trim().max(120) }).strict();
const ScenarioInputSchema = z.object({ id: Id, label: Line(60), assessment: z.number().min(0).max(1) }).strict();

export const MorphOperationSchema = z.discriminatedUnion("operation", [
  op("set_objective", { objectiveId: Id, text: Line(600) }),
  op("update_objective", { status: z.enum(["planning", "in_progress", "answered"]) }),

  op("add_module", { module: ModuleInputSchema, reserve: z.boolean().optional(), replaces: Id.optional() }),
  op("update_module", {
    moduleId: Id,
    changes: z.object({ title: Line(60).optional(), collapsed: z.boolean().optional(), summary: SummarySchema.nullable().optional() }).strict(),
  }),
  op("move_module", { moduleId: Id, group: ModuleGroupSchema }),
  op("resize_module", { moduleId: Id, size: z.number().min(0.7).max(1.15) }),
  op("emphasize_module", { moduleId: Id }),
  op("deemphasize_module", { moduleId: Id }),
  op("remove_module", { moduleId: Id }),

  op("add_evidence", { evidence: NewEvidenceSchema }),
  op("remove_evidence", { evidenceId: Id, supersededBy: Id.optional() }),
  op("add_assumption", { assumptionId: Id, statement: Line(600), raisedBy: Id }),
  op("challenge_assumption", { assumptionId: Id, by: Id, note: Line(600) }),
  op("update_assumption", { assumptionId: Id, status: z.enum(["confirmed", "rejected"]), evidenceId: Id.nullable() }),

  op("add_scenario", { scenario: ScenarioInputSchema }),
  op("update_scenario", { scenarioId: Id, assessment: z.number().min(0).max(1), label: Line(60).optional() }),
  op("update_recommendation", { recommendation: RecommendationSchema.omit({ updatedAt: true }).strict() }),

  op("request_human_input", { requestId: Id, question: Line(600), askedBy: Id, control: InputControlSchema.optional() }),
  op("answer_human_input", { requestId: Id, value: InputValueSchema }),
  op("skip_human_input", { requestId: Id }),

  op("assign_agent", { agentId: Id, task: Line(200), moduleId: Id.nullable() }),
  op("focus_camera", { target: FocusSchema }),
]);

export type MorphOperation = z.infer<typeof MorphOperationSchema>;
export type OperationType = MorphOperation["operation"];
export const OPERATION_TYPES = MorphOperationSchema.options.map((option) => option.shape.operation.value) as readonly OperationType[];

/** Changes that reshape the workspace or its answer; they must say why. */
export const SIGNIFICANT: ReadonlySet<OperationType> = new Set([
  "add_module",
  "move_module",
  "emphasize_module",
  "deemphasize_module",
  "remove_module",
  "remove_evidence",
  "update_recommendation",
]);

/** Emphasis after an (de)emphasize operation: one step toward emphasized or muted. */
export function nextEmphasis(current: WorkspaceModule["emphasis"], operation: "emphasize_module" | "deemphasize_module"): WorkspaceModule["emphasis"] {
  if (operation === "emphasize_module") return current === "muted" ? "normal" : "emphasized";
  return current === "emphasized" ? "normal" : "muted";
}

export type OperationResult =
  | { ok: true; workspace: Workspace; operation: MorphOperation }
  | { ok: false; reason: string; operationId: string | null; operationType: string | null };

const MAX_INPUT_BYTES = 16_000;

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "malformed operation";
  const path = issue.path.join(".");
  return `malformed operation${path ? ` at ${path}` : ""}: ${issue.message}`;
}

/**
 * Validates and applies one proposed operation. Pure and deterministic: the same workspace and operation
 * always give the same result, and a refused operation leaves the workspace untouched.
 */
export function applyMorphOperation(workspace: Workspace, input: unknown): OperationResult {
  const loose = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const operationId = typeof loose.id === "string" && loose.id ? loose.id.slice(0, 80) : null;
  const operationType = typeof loose.operation === "string" && loose.operation ? loose.operation.slice(0, 40) : null;
  const refuse = (reason: string): OperationResult => ({ ok: false, reason, operationId, operationType });

  let size = 0;
  try {
    size = JSON.stringify(input)?.length ?? 0;
  } catch {
    return refuse("the operation is not plain data");
  }
  if (size > MAX_INPUT_BYTES) return refuse("the operation is too large");
  if (operationType && !OPERATION_TYPES.includes(operationType as OperationType)) return refuse(`unknown operation "${operationType}"`);

  const parsed = MorphOperationSchema.safeParse(input);
  if (!parsed.success) return refuse(describeIssue(parsed.error));
  const operation = parsed.data;

  if (workspace.appliedOperationIds.includes(operation.id)) return refuse(`operation ${operation.id} was already applied`);
  if (SIGNIFICANT.has(operation.operation) && !operation.why) return refuse(`${operation.operation} must say why`);

  const next = transition(workspace, operation);
  if (t.refused(next)) return refuse(next);
  return { ok: true, operation, workspace: { ...next, appliedOperationIds: [...next.appliedOperationIds, operation.id] } };
}

function transition(ws: Workspace, o: MorphOperation): t.Transition {
  const untrusted = o.source.kind === "model" || o.source.kind === "orchestrator";
  switch (o.operation) {
    case "set_objective":
      return o.source.kind === "model" ? "only the user or the demo can set the objective" : t.receiveObjective(ws, o.objectiveId, o.text);
    case "update_objective":
      return t.setObjectiveStatus(ws, o.status);
    case "add_module": {
      const { size = 1, ...mod } = o.module;
      const spec = { ...mod, size, emphasis: "normal", collapsed: false } as const;
      if (o.replaces === undefined) return t.openModule(ws, spec, o.reserve ?? false);
      return o.reserve ? "a reserved module can't replace another" : t.replaceModule(ws, spec, o.replaces);
    }
    case "update_module":
      return t.updateModule(ws, o.moduleId, o.changes);
    case "move_module":
      return t.updateModule(ws, o.moduleId, { group: o.group });
    case "resize_module":
      return t.updateModule(ws, o.moduleId, { size: o.size });
    case "emphasize_module":
    case "deemphasize_module": {
      const mod = ws.modules[o.moduleId];
      return mod ? t.updateModule(ws, o.moduleId, { emphasis: nextEmphasis(mod.emphasis, o.operation) }) : `module ${o.moduleId} does not exist`;
    }
    case "remove_module":
      return t.removeModule(ws, o.moduleId);
    case "add_evidence": {
      const { source } = o.evidence;
      if (source.verified && source.kind !== "user" && source.kind !== "tool") return "only user answers and tool results can be marked verified";
      if (untrusted && source.kind === "user") return "only the user can supply user evidence";
      return t.addEvidence(ws, o.evidence);
    }
    case "remove_evidence":
      return o.supersededBy ? t.supersedeEvidence(ws, o.evidenceId, o.supersededBy) : t.removeEvidence(ws, o.evidenceId);
    case "add_assumption":
      return t.raiseAssumption(ws, o.assumptionId, o.statement, o.raisedBy);
    case "challenge_assumption":
      return t.challengeAssumption(ws, o.assumptionId, o.by, o.note);
    case "update_assumption":
      return t.resolveAssumption(ws, o.assumptionId, o.status, o.evidenceId);
    case "add_scenario":
      return t.addScenario(ws, o.scenario);
    case "update_scenario":
      return t.updateScenario(ws, o.scenarioId, o.label === undefined ? { assessment: o.assessment } : { assessment: o.assessment, label: o.label });
    case "update_recommendation":
      return t.setRecommendation(ws, o.recommendation);
    case "request_human_input":
      return t.requestHumanInput(ws, o.requestId, o.question, o.askedBy, o.control);
    case "answer_human_input":
      return untrusted ? "only the user (or the demo's autoplay) can answer a question for the user" : t.answerHumanInput(ws, o.requestId, o.value);
    case "skip_human_input":
      return untrusted ? "only the user can skip a question for the user" : t.skipHumanInput(ws, o.requestId);
    case "assign_agent": {
      if (!ws.agents[o.agentId]) return `agent ${o.agentId} does not exist`;
      const started = t.startTask(ws, o.agentId, o.task, o.moduleId);
      return t.refused(started) ? started : t.updateAgent(started, o.agentId, { state: "assigned", task: o.task, moduleId: o.moduleId });
    }
    case "focus_camera":
      return t.setFocus(ws, o.target);
  }
}
