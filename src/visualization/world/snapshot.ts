import { AGENT_ORDER } from "./sim/roster";
import type {
  AgentId,
  AgentState,
  CoreState,
  LogEntry,
  ScenarioWeights,
  World,
} from "./sim/types";
import type { Finding } from "./sim/script";
import { budgetPending, coreState, currentFindings, scenarioWeights } from "./sim/world";

export interface LabSnapshot {
  time: number;
  cycle: number;
  core: CoreState;
  agents: { id: AgentId; state: AgentState; task: string; progress: number }[];
  log: LogEntry[];
  caption: LogEntry | null;
  findings: Finding[];
  budgetPending: boolean;
  budgetConfirmed: boolean;
  budgetConfirmedAgo: number | null;
  weights: ScenarioWeights | null;
  recommendation: boolean;
}

export function takeSnapshot(world: World): LabSnapshot {
  return {
    time: world.time,
    cycle: world.cycle,
    core: coreState(world),
    agents: AGENT_ORDER.map((id) => {
      const agent = world.agents[id];
      return { id, state: agent.state, task: agent.task, progress: agent.progress };
    }),
    log: world.log.slice(-8).reverse(),
    caption: world.log.findLast((entry) => entry.beat) ?? null,
    findings: currentFindings(world),
    budgetPending: budgetPending(world),
    budgetConfirmed: world.signals.has("budget"),
    budgetConfirmedAgo: world.signals.has("budget")
      ? world.time - (world.signals.get("budget") ?? world.time)
      : null,
    weights: scenarioWeights(world),
    recommendation: world.signals.has("recommendation"),
  };
}
