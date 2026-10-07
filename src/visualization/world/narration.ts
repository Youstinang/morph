import type { WorkspaceEvent } from "@/events/schema";
import { AGENTS } from "./sim/roster";
import type { AgentId, LogEntry } from "./sim/types";

const name = (id: string) => AGENTS[id as AgentId]?.name ?? id;
const speaker = (id: string): LogEntry["agent"] => (id in AGENTS ? (id as AgentId) : "system");

/** The plain-language line an event adds to the steps list, if any. Story moments are narrated beats. */
export function narrate(event: WorkspaceEvent): LogEntry | null {
  const entry = (agent: LogEntry["agent"], text: string, beat: boolean): LogEntry => ({ id: event.seq, time: event.at, agent, text, beat });
  if (event.summary) {
    const user = event.source === "user" || event.type === "human_input_received";
    return entry(user ? "user" : "system", event.summary, true);
  }
  switch (event.type) {
    case "agent_assigned":
      return event.travel === "returning" ? null : entry(speaker(event.agentId), `${name(event.agentId)} is ${event.task}.`, false);
    case "agent_work_started":
      return entry(speaker(event.agentId), `${name(event.agentId)} is ${event.task}.`, false);
    case "task_failed":
    case "retry_started":
      return entry(speaker(event.agentId), `${name(event.agentId)} is ${event.task}.`, true);
    case "artifact_handoff_started":
      return entry(speaker(event.from), `${name(event.from)} is ${event.task}.`, true);
    case "artifact_handoff_completed": {
      const what = event.kind === "flag" ? "the request to double-check" : "the findings";
      return entry(speaker(event.to), `${name(event.to)} got ${what} from ${name(event.from)}.`, false);
    }
    default:
      return null;
  }
}
