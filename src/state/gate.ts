import type { EventBus } from "@/events/bus";
import type { EventDraft, EventSource } from "@/events/schema";
import type { Provenance, Workspace } from "./domain";
import type { MorphOperation, OperationResult } from "./operations";
import type { WorkspaceStore } from "./store";

export interface OperationGate {
  /**
   * Validates and applies a proposed operation, then announces the change (or the refusal) on the bus.
   * `as` is the trusted channel the proposal arrived through; it replaces any source the proposal claims,
   * so an AI proposal can never pose as the user.
   */
  submit(input: unknown, options: { as: Provenance; summary?: string }): OperationResult;
}

const eventSource = (kind: Provenance["kind"] | undefined): EventSource =>
  kind === "user" ? "user" : kind === "demo" ? "demo" : "orchestrator";

/** The record events an applied operation announces, read from the workspace after the change. */
export function operationEvents(o: MorphOperation, after: Workspace): EventDraft[] {
  switch (o.operation) {
    case "set_objective":
      return [{ type: "objective_received", objectiveId: o.objectiveId, text: o.text }];
    case "update_objective":
      return [{ type: "objective_updated", status: o.status }];
    case "add_module": {
      const { id, title, kind, group } = o.module;
      return [{ type: o.reserve ? "module_reserved" : "module_created", module: { id, title, kind, group } }];
    }
    case "update_module":
      return [{ type: "module_updated", moduleId: o.moduleId, changes: o.changes }];
    case "move_module":
      return [{ type: "module_moved", moduleId: o.moduleId, group: o.group }];
    case "resize_module":
      return [{ type: "module_resized", moduleId: o.moduleId, size: o.size }];
    case "emphasize_module":
    case "deemphasize_module":
      return [{ type: "module_emphasized", moduleId: o.moduleId, emphasis: after.modules[o.moduleId]!.emphasis }];
    case "remove_module":
      return [{ type: "module_removed", moduleId: o.moduleId }];
    case "add_evidence":
      return [{ type: "evidence_discovered", evidence: o.evidence }];
    case "remove_evidence":
      return [{ type: "evidence_removed", evidenceId: o.evidenceId, supersededBy: o.supersededBy ?? null }];
    case "add_assumption":
      return [{ type: "assumption_created", assumptionId: o.assumptionId, statement: o.statement, raisedBy: o.raisedBy }];
    case "challenge_assumption":
      return [{ type: "assumption_challenged", assumptionId: o.assumptionId, by: o.by, note: o.note }];
    case "update_assumption":
      return [{ type: "assumption_resolved", assumptionId: o.assumptionId, status: o.status, evidenceId: o.evidenceId }];
    case "add_scenario":
    case "update_scenario": {
      const id = o.operation === "add_scenario" ? o.scenario.id : o.scenarioId;
      const { label, assessment } = after.scenarios.find((scenario) => scenario.id === id)!;
      return [{ type: o.operation === "add_scenario" ? "scenario_created" : "scenario_updated", scenario: { id, label, assessment } }];
    }
    case "update_recommendation":
      return [{ type: "recommendation_updated", recommendation: o.recommendation }];
    case "request_human_input":
      return [{ type: "human_input_requested", requestId: o.requestId, question: o.question, askedBy: o.askedBy }];
    case "answer_human_input":
      return [{ type: "human_input_received", requestId: o.requestId, answer: o.answer, answeredBy: o.source.kind === "user" ? "user" : "autoplay" }];
    case "assign_agent":
      return [{ type: "task_assigned", agentId: o.agentId, task: o.task, moduleId: o.moduleId }];
    case "focus_camera":
      return [{ type: "camera_focus_requested", target: o.target }];
  }
}

export function createOperationGate(store: WorkspaceStore, bus: EventBus, now: () => number): OperationGate {
  return {
    submit(input, options) {
      store.getState().setTime(now());
      const proposal = typeof input === "object" && input !== null && !Array.isArray(input) ? { ...input, source: options.as } : input;
      const result = store.getState().apply(proposal);
      if (!result.ok) {
        bus.publish(
          { type: "operation_rejected", operationId: result.operationId, operationType: result.operationType, reason: result.reason.slice(0, 240) },
          eventSource(options.as.kind),
        );
        return result;
      }
      const { operation } = result;
      const ref = { id: operation.id, type: operation.operation, source: operation.source, ...(operation.why ? { why: operation.why } : {}) };
      operationEvents(operation, result.workspace).forEach((draft, i) =>
        bus.publish({ ...draft, operation: ref, ...(i === 0 && options.summary ? { summary: options.summary } : {}) }, eventSource(operation.source.kind)),
      );
      return result;
    },
  };
}
