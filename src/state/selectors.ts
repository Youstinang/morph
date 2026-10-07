import type { Agent, Assumption, Change, Evidence, HumanInputRequest, Recommendation, Workspace, WorkspaceModule } from "./domain";
import { mergeStationChanges } from "./changes";
import { siteOf } from "./live-work";
import { TEAM_AGENTS } from "./team";

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
  /** The web page a tool-sourced finding came from. */
  source?: { url: string; site: string };
}

/** The web page behind a tool-sourced piece of evidence, if any. */
export function webSourceOf(item: Evidence): { url: string; site: string } | null {
  if (item.source.kind !== "tool" || !item.source.url) return null;
  return { url: item.source.url, site: siteOf(item.source.url) };
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
    const source = webSourceOf(item);
    lines.push({ key: item.id, kind: item.kind === "risk" ? "doubt" : "fact", text: item.statement, at: item.foundAt, ...(source ? { source } : {}) });
  }
  for (const item of assumptions) {
    if (item.status !== "open" && item.status !== "challenged") continue;
    lines.push({ key: item.id, kind: "fact", text: item.statement, at: item.raisedAt });
    if (item.challenge) lines.push({ key: `${item.id}:challenge`, kind: "doubt", text: item.challenge.note, at: item.challenge.at });
  }
  if (recommendation) lines.push({ key: "leaning", kind: "conclusion", text: recommendation.leaning, at: recommendation.updatedAt });
  return lines.sort((a, b) => a.at - b.at);
}

export const selectChanges = (ws: Workspace) => ws.changes;

export interface ChangeLine {
  key: string;
  change: string;
  reason: string;
  /** Who gave the reason: an agent's name, "You", or "MORPH" for the orchestrator. */
  by: string;
  /** The evidence the reason cites, as recorded (a superseded finding still shows what it said then). */
  basis: { text: string; site: string | null }[];
  assumption: string | null;
}

function changeAuthor(change: Change): string {
  const agentId = change.why.agentId ?? change.by.agentId;
  const agent = agentId ? TEAM_AGENTS.find((member) => member.id === agentId) : undefined;
  if (agent) return agent.name;
  if (change.by.kind === "user") return "You";
  return "MORPH";
}

/** "Why did MORPH change?", newest first: each change with its reason and the evidence and assumption it cites. */
export function changeLines(changes: readonly Change[], evidence: readonly Evidence[], assumptions: readonly Assumption[]): ChangeLine[] {
  return mergeStationChanges(changes, changeAuthor)
    .map((change) => ({
      key: change.operationId,
      change: change.change,
      reason: change.why.reason,
      by: changeAuthor(change),
      basis: (change.why.evidenceIds ?? []).flatMap((id) => {
        const item = evidence.find((entry) => entry.id === id);
        return item ? [{ text: item.statement, site: webSourceOf(item)?.site ?? null }] : [];
      }),
      assumption: change.why.assumptionId ? (assumptions.find((item) => item.id === change.why.assumptionId)?.statement ?? null) : null,
    }))
    .reverse();
}
