import { agentChange } from "@/events/agents";
import type { EventBus } from "@/events/bus";
import type { WorkspaceEvent } from "@/events/schema";
import type { AgentState, Workspace } from "./domain";
import type { WorkspaceStore } from "./store";

/** States in which an agent is carrying out a task, as opposed to travelling, waiting or resting. */
const TASK_STATES = new Set<AgentState>(["working", "evaluating", "collaborating", "retrying", "handoff", "failed"]);

/**
 * Records agent activity from events: state, current task and task history. Everything else in the record
 * changes only through the operation gate, so this ignores record events (the gate already applied them).
 * Returns false when the event changes nothing here.
 */
export function applyActivityEvent(store: WorkspaceStore, event: WorkspaceEvent, seed: () => Workspace): boolean {
  if (event.type === "run_started") return store.getState().reset(seed());
  if (event.type === "model_call_completed") {
    store.getState().recordModelUsage(event);
    return true;
  }
  const change = agentChange(event);
  if (!change) return false;
  store.getState().setTime(event.at);
  return applyAgentChange(store, change.agentId, change.state, change.task, change.moduleId);
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

/** Keeps a store's activity in step with a bus; returns the unsubscribe function. */
export function connectWorkspace(bus: EventBus, store: WorkspaceStore, seed: () => Workspace): () => void {
  return bus.subscribe((event) => {
    applyActivityEvent(store, event, seed);
  });
}
