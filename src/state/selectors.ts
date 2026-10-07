import type { Agent, Assumption, Evidence, HumanInputRequest, Recommendation, Workspace, WorkspaceModule } from "./domain";

/**
 * Selectors return records held by the store (never freshly built objects), so React subscriptions with
 * shallow comparison only re-render when a fact actually changes.
 */
export const selectObjective = (ws: Workspace) => ws.objective;
export const selectAgents = (ws: Workspace): Agent[] => ws.agentOrder.map((id) => ws.agents[id]!);
export const selectAgent = (id: string | null) => (ws: Workspace) => (id ? (ws.agents[id] ?? null) : null);
export const selectOpenModules = (ws: Workspace): WorkspaceModule[] =>
  ws.moduleOrder.map((id) => ws.modules[id]!).filter((mod) => mod.status === "open");
export const selectEvidence = (ws: Workspace) => ws.evidence;
export const selectAssumptions = (ws: Workspace) => ws.assumptions;
export const selectScenarios = (ws: Workspace) => ws.scenarios;
export const selectRecommendation = (ws: Workspace) => ws.recommendation;
export const selectPendingInput = (ws: Workspace): HumanInputRequest | null =>
  ws.humanInputs.find((request) => request.status === "pending") ?? null;
export const selectLatestAnswer = (ws: Workspace): HumanInputRequest | null =>
  ws.humanInputs.findLast((request) => request.status === "answered") ?? null;
export const selectActiveTask = (agentId: string) => (ws: Workspace) =>
  ws.tasks.findLast((task) => task.agentId === agentId && task.status === "active") ?? null;

export interface FindingLine {
  key: string;
  kind: "fact" | "doubt" | "conclusion";
  text: string;
  at: number;
}

/**
 * What the team knows so far, oldest first: accepted evidence, assumptions still in play (with any
 * challenge as a doubt), and the forming answer. Superseded evidence and resolved assumptions drop out.
 */
export function findingLines(
  evidence: readonly Evidence[],
  assumptions: readonly Assumption[],
  recommendation: Recommendation | null,
): FindingLine[] {
  const lines: FindingLine[] = [];
  for (const item of evidence) {
    if (item.status !== "accepted") continue;
    lines.push({ key: item.id, kind: item.kind === "risk" ? "doubt" : "fact", text: item.statement, at: item.foundAt });
  }
  for (const item of assumptions) {
    if (item.status !== "open" && item.status !== "challenged") continue;
    lines.push({ key: item.id, kind: "fact", text: item.statement, at: item.raisedAt });
    if (item.challenge) lines.push({ key: `${item.id}:challenge`, kind: "doubt", text: item.challenge.note, at: item.challenge.at });
  }
  if (recommendation) lines.push({ key: "leaning", kind: "conclusion", text: recommendation.leaning, at: recommendation.updatedAt });
  return lines.sort((a, b) => a.at - b.at);
}
