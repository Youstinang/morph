import { agentChange } from "@/events/agents";
import type { EventBus } from "@/events/bus";
import type { WorkspaceEvent } from "@/events/schema";
import type { AgentState, Workspace } from "./domain";
import type { WorkspaceStore } from "./store";

/** States in which an agent is carrying out a task, as opposed to travelling, waiting or resting. */
const TASK_STATES = new Set<AgentState>(["working", "evaluating", "collaborating", "retrying", "handoff", "failed"]);

/**
 * Applies one event to the canonical workspace. Returns false when the event changes nothing or the store
 * refuses it (unknown ids, out-of-order transitions), so malformed sequences can't corrupt state.
 * Phase 11 routes the state-changing part through validated MorphOperations.
 */
export function applyWorkspaceEvent(store: WorkspaceStore, event: WorkspaceEvent, seed: () => Workspace): boolean {
  if (event.type === "run_started") return store.getState().reset(seed());
  const s = store.getState();
  s.setTime(event.at);

  const change = agentChange(event);
  if (change) return applyAgentChange(store, change.agentId, change.state, change.task, change.moduleId);

  switch (event.type) {
    case "objective_received":
      return s.receiveObjective(event.objectiveId, event.text);
    case "plan_created":
      return s.setObjectiveStatus("in_progress");
    case "module_reserved":
    case "module_created": {
      const { id, title, kind, group } = event.module;
      return s.openModule({ id, title, kind, group, emphasis: "normal", collapsed: false, size: 1, reserved: event.type === "module_reserved" });
    }
    case "module_emphasized":
      return s.updateModule(event.moduleId, { emphasis: event.emphasis });
    case "module_removed":
      return s.removeModule(event.moduleId);
    case "evidence_discovered":
      return s.addEvidence(event.evidence);
    case "assumption_created":
      return s.raiseAssumption(event.assumptionId, event.statement, event.raisedBy);
    case "assumption_challenged":
      return s.challengeAssumption(event.assumptionId, event.by, event.note);
    case "assumption_resolved":
      return s.resolveAssumption(event.assumptionId, event.status, event.evidenceId);
    case "human_input_requested":
      return s.requestHumanInput(event.requestId, event.question, event.askedBy);
    case "human_input_received":
      return s.answerHumanInput(event.requestId, event.answer);
    case "scenario_created":
    case "scenario_updated":
      return s.setScenarios(event.scenarios);
    case "recommendation_updated":
      return s.setRecommendation(event.recommendation);
    case "synthesis_completed":
      return s.setObjectiveStatus("answered");
    default:
      return false;
  }
}

function applyAgentChange(store: WorkspaceStore, id: string, state: AgentState, task?: string, moduleId?: string | null) {
  const s = store.getState();
  const before = s.workspace.agents[id];
  if (!before) return false;
  const nextTask = task ?? before.task;
  const nextModule = moduleId === undefined ? before.moduleId : moduleId && s.workspace.modules[moduleId] ? moduleId : null;
  const changed = s.updateAgent(id, {
    state,
    task: nextTask,
    moduleId: nextModule,
    progress: state === "completed" ? 1 : 0,
  });
  const doing = TASK_STATES.has(state);
  const wasDoing = TASK_STATES.has(before.state);
  if (state === "failed") s.finishTask(id, "failed");
  else if (doing && (!wasDoing || before.task !== nextTask || before.state === "failed")) s.startTask(id, nextTask, nextModule);
  else if (!doing && wasDoing) s.finishTask(id, "done");
  return changed;
}

/** Keeps a store in step with a bus; returns the unsubscribe function. */
export function connectWorkspace(bus: EventBus, store: WorkspaceStore, seed: () => Workspace): () => void {
  return bus.subscribe((event) => {
    applyWorkspaceEvent(store, event, seed);
  });
}
