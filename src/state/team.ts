import type { Agent, AgentRole, Workspace } from "./domain";

/** The standing team. Every run — the recorded demo and a live question — works with these six agents. */
export const TEAM_AGENTS = [
  { id: "nova", name: "Nova", role: "planner" },
  { id: "orion", name: "Orion", role: "researcher" },
  { id: "sage", name: "Sage", role: "analyst" },
  { id: "brix", name: "Brix", role: "builder" },
  { id: "vex", name: "Vex", role: "critic" },
  { id: "lume", name: "Lume", role: "synthesizer" },
] as const satisfies readonly { id: string; name: string; role: AgentRole }[];

export type TeamAgentId = (typeof TEAM_AGENTS)[number]["id"];
export const TEAM_ORDER: readonly TeamAgentId[] = TEAM_AGENTS.map((agent) => agent.id);

/** An empty workspace with the whole team resting at home. */
export function createTeamWorkspace(id: string, mode: Workspace["mode"]): Workspace {
  const agents: Record<string, Agent> = {};
  for (const agent of TEAM_AGENTS) agents[agent.id] = { ...agent, state: "idle", task: "ready", moduleId: null, progress: 0 };
  return {
    id,
    mode,
    time: 0,
    objective: null,
    agentOrder: [...TEAM_ORDER],
    agents,
    tasks: [],
    moduleOrder: [],
    modules: {},
    evidence: [],
    assumptions: [],
    scenarios: [],
    recommendation: null,
    humanInputs: [],
    toolCalls: [],
    cost: { modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 },
    focus: null,
    changes: [],
    appliedOperationIds: [],
  };
}
