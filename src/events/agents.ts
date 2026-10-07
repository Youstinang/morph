import type { AgentState } from "@/state/domain";
import type { WorkspaceEvent } from "./schema";

export interface AgentChange {
  agentId: string;
  state: AgentState;
  task?: string;
  /** Present when the event says where the agent is working; null means "not at a module". */
  moduleId?: string | null;
}

/** The deterministic agent-state transition each event implies; shared by the canonical store and the world. */
export function agentChange(event: WorkspaceEvent): AgentChange | null {
  switch (event.type) {
    case "agent_assigned":
      return { agentId: event.agentId, state: event.travel === "returning" ? "returning" : "assigned", task: event.task, moduleId: null };
    case "agent_move_started":
      return { agentId: event.agentId, state: event.travel };
    case "agent_work_started":
      return { agentId: event.agentId, state: event.activity, task: event.task, moduleId: event.moduleId };
    case "task_completed":
      return { agentId: event.agentId, state: "completed", task: event.task, moduleId: event.moduleId };
    case "task_failed":
      return { agentId: event.agentId, state: "failed", task: event.task, moduleId: event.moduleId };
    case "retry_started":
      return { agentId: event.agentId, state: "retrying", task: event.task, moduleId: event.moduleId };
    case "artifact_handoff_started":
      return { agentId: event.from, state: "handoff", task: event.task };
    case "agent_waiting":
      return { agentId: event.agentId, state: "waiting", task: event.task };
    case "agent_idle":
      return { agentId: event.agentId, state: "idle", task: event.task };
    default:
      return null;
  }
}
