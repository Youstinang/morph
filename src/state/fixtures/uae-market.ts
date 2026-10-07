import type { Agent, AgentRole, ModuleGroup, Source, Workspace } from "../domain";
import type { StoryFact } from "../story";

/** Deterministic demo fixture for the flagship question. Demo data only — not live research. */

export const OBJECTIVE = "Should a European AI software company enter the UAE market?";
export const BUDGET_QUESTION = "What's the most you can spend on the launch?";
export const BUDGET_ANSWER = "USD 500,000";
export const RECOMMENDATION = "Start with a local partner";
export const RECOMMENDATION_REASON =
  "Big UAE companies take 9–12 months to buy. On a USD 500,000 budget, going in alone runs out of money before deals close. A local partner already has customers and can keep data inside the UAE.";

export const SCENARIO_LABELS = {
  direct: "Go in alone",
  partnership: "Partner locally",
  delay: "Wait for now",
} as const;
export type ScenarioKey = keyof typeof SCENARIO_LABELS;

export const DEMO_AGENTS: readonly { id: string; name: string; role: AgentRole }[] = [
  { id: "nova", name: "Nova", role: "planner" },
  { id: "orion", name: "Orion", role: "researcher" },
  { id: "sage", name: "Sage", role: "analyst" },
  { id: "brix", name: "Brix", role: "builder" },
  { id: "vex", name: "Vex", role: "critic" },
  { id: "lume", name: "Lume", role: "synthesizer" },
];

export const DEMO_MODULES = {
  market: { title: "Market demand", group: "research" },
  competition: { title: "Competitors", group: "research" },
  regulation: { title: "Rules", group: "research" },
  economics: { title: "Costs", group: "analysis" },
  risk: { title: "Risks", group: "analysis" },
  possibility: { title: "Options", group: "decision" },
} as const satisfies Record<string, { title: string; group: ModuleGroup }>;
export type DemoModuleId = keyof typeof DEMO_MODULES;

const FIXTURE: Source = { kind: "fixture", label: "Demo fixture (not live research)", verified: false };
const USER: Source = { kind: "user", label: "Your answer", verified: true };

export function createUaeWorkspace(): Workspace {
  const agents: Record<string, Agent> = {};
  for (const agent of DEMO_AGENTS) {
    agents[agent.id] = { ...agent, state: "idle", task: "ready", moduleId: null, progress: 0 };
  }
  return {
    id: "uae-market-entry",
    mode: "demo",
    time: 0,
    objective: null,
    agentOrder: DEMO_AGENTS.map((agent) => agent.id),
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
  };
}

const LEANING = "A local partner fits the budget and the slow buying cycle best.";
const BASIS = ["ev-sales-cycle", "ev-budget", "ev-data-residency"];

/** Facts learned at each story moment, keyed by the moment's signal. */
export const UAE_STORY: Record<string, readonly StoryFact[]> = {
  objective: [{ type: "objective", id: "uae-entry", text: OBJECTIVE }],
  plan: [{ type: "objective-status", status: "in_progress" }],
  "pkg-market": [
    {
      type: "evidence",
      evidence: { id: "ev-demand", statement: "UAE companies are actively buying AI software.", kind: "fact", moduleId: "market", foundBy: "orion", source: FIXTURE },
    },
  ],
  competition: [
    {
      type: "evidence",
      evidence: { id: "ev-rivals", statement: "Two local rivals already sell to banks and government.", kind: "fact", moduleId: "competition", foundBy: "sage", source: FIXTURE },
    },
  ],
  rules: [
    {
      type: "evidence",
      evidence: { id: "ev-data-residency", statement: "Customer data must stay inside the UAE.", kind: "constraint", moduleId: "regulation", foundBy: "orion", source: FIXTURE },
    },
  ],
  "budget-request": [{ type: "input-request", id: "budget", question: BUDGET_QUESTION, askedBy: "nova" }],
  budget: [
    { type: "input-answer", id: "budget", answer: BUDGET_ANSWER },
    {
      type: "evidence",
      evidence: { id: "ev-budget", statement: `Your launch budget is capped at ${BUDGET_ANSWER}.`, kind: "constraint", moduleId: null, foundBy: "user", source: USER },
    },
  ],
  analysis: [
    { type: "assumption", id: "as-fast-deals", statement: "Going in alone just fits the budget, if deals close within 6 months.", raisedBy: "sage" },
  ],
  challenge: [{ type: "challenge", id: "as-fast-deals", by: "vex", note: "No proof yet that big companies buy within 6 months." }],
  "retry-done": [
    {
      type: "evidence",
      evidence: {
        id: "ev-sales-cycle",
        statement: "Big companies take 9–12 months to buy, so going in alone runs over budget.",
        kind: "fact",
        moduleId: "market",
        foundBy: "orion",
        source: FIXTURE,
      },
    },
    { type: "resolve", id: "as-fast-deals", status: "rejected", evidenceId: "ev-sales-cycle" },
  ],
  "risk-check": [
    {
      type: "evidence",
      evidence: { id: "ev-cash-risk", statement: "Biggest risk: money runs out before deals close.", kind: "risk", moduleId: "risk", foundBy: "vex", source: FIXTURE },
    },
  ],
  shift: [
    {
      type: "recommendation",
      recommendation: { status: "forming", leaning: LEANING, statement: null, reason: null, confidence: "moderate", evidenceIds: BASIS },
    },
  ],
  recommendation: [
    {
      type: "recommendation",
      recommendation: {
        status: "final",
        leaning: LEANING,
        statement: RECOMMENDATION,
        reason: RECOMMENDATION_REASON,
        confidence: "moderate",
        evidenceIds: BASIS,
      },
    },
    { type: "objective-status", status: "answered" },
  ],
};
