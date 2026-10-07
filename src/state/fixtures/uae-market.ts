import type { Agent, AgentRole, ModuleGroup, Source, Workspace } from "../domain";
import type { EventDraft, EventModule, EventSource } from "@/events/schema";

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
const ASSUMPTION = "as-fast-deals";

export const HUMAN_INPUTS = {
  budget: { question: BUDGET_QUESTION, answer: BUDGET_ANSWER, answeredSummary: `You set the launch budget: ${BUDGET_ANSWER}.` },
} as const;

/** A story moment: the events it publishes, in order. The summary is narrated with the first one. */
export interface StoryBeat {
  summary?: string;
  source?: EventSource;
  events: readonly EventDraft[];
}

const mod = (id: DemoModuleId): EventModule => ({ id, kind: id, ...DEMO_MODULES[id] });
const headline = (moduleId: DemoModuleId, headline: string, detail: string): EventDraft => ({ type: "module_updated", moduleId, headline, detail });
const scenarios = (direct: number, partnership: number, delay: number) =>
  (Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map((id) => ({ id, label: SCENARIO_LABELS[id], assessment: { direct, partnership, delay }[id] }));

/** The flagship timeline's facts, keyed by the story moment that publishes them. Demo data only. */
export const UAE_TIMELINE: Record<string, StoryBeat> = {
  objective: {
    summary: "You asked the team a question.",
    source: "user",
    events: [{ type: "objective_received", objectiveId: "uae-entry", text: OBJECTIVE }],
  },
  planning: { events: [{ type: "planning_started", agentId: "nova" }] },
  plan: {
    summary: "Nova's plan: check customer demand, competitors and the rules.",
    events: [
      { type: "plan_created", agentId: "nova", moduleIds: ["market", "competition", "regulation"] },
      { type: "module_created", module: mod("market") },
      { type: "module_created", module: mod("competition") },
      { type: "module_created", module: mod("regulation") },
    ],
  },
  "pkg-market": {
    events: [
      {
        type: "evidence_discovered",
        evidence: { id: "ev-demand", statement: "UAE companies are actively buying AI software.", kind: "fact", moduleId: "market", foundBy: "orion", source: FIXTURE },
      },
      headline("market", "Demand is growing", "UAE companies are buying AI software"),
    ],
  },
  rules: {
    summary: "Orion found the rule: customer data must stay inside the UAE.",
    events: [
      {
        type: "evidence_discovered",
        evidence: { id: "ev-data-residency", statement: "Customer data must stay inside the UAE.", kind: "constraint", moduleId: "regulation", foundBy: "orion", source: FIXTURE },
      },
      headline("regulation", "Data must stay in the UAE", "Needs local hosting or a local partner"),
    ],
  },
  discovery: {
    summary: "Two things will decide this: your budget, and how long big companies take to buy.",
    events: [
      { type: "workspace_morph_started", reason: "The budget and the buying cycle need their own analysis." },
      { type: "module_reserved", module: mod("economics") },
      { type: "module_reserved", module: mod("risk") },
      { type: "module_reserved", module: mod("possibility") },
      { type: "workspace_morph_completed" },
    ],
  },
  competition: {
    summary: "Sage: two local rivals already sell to banks and government.",
    events: [
      {
        type: "evidence_discovered",
        evidence: { id: "ev-rivals", statement: "Two local rivals already sell to banks and government.", kind: "fact", moduleId: "competition", foundBy: "sage", source: FIXTURE },
      },
      headline("competition", "2 strong local rivals", "Already selling to banks and government"),
    ],
  },
  "zone:economics": { summary: "Brix set up a station to work out the costs.", events: [{ type: "module_created", module: mod("economics") }] },
  "zone:risk": { summary: "Brix set up a station to test the risks.", events: [{ type: "module_created", module: mod("risk") }] },
  "zone:possibility": { summary: "Brix set up a station to compare the options.", events: [{ type: "module_created", module: mod("possibility") }] },
  "budget-request": {
    summary: "Nova needs one answer from you: the launch budget.",
    events: [{ type: "human_input_requested", requestId: "budget", question: BUDGET_QUESTION, askedBy: "nova" }],
  },
  budget: {
    events: [
      {
        type: "evidence_discovered",
        evidence: { id: "ev-budget", statement: `Your launch budget is capped at ${BUDGET_ANSWER}.`, kind: "constraint", moduleId: null, foundBy: "user", source: USER },
      },
    ],
  },
  analysis: {
    summary: "Sage's first estimate: going in alone just fits the budget, if deals close within 6 months.",
    events: [
      { type: "assumption_created", assumptionId: ASSUMPTION, statement: "Going in alone just fits the budget, if deals close within 6 months.", raisedBy: "sage" },
      headline("economics", "Going alone just fits", "Only if deals close in 6 months"),
    ],
  },
  challenge: {
    summary: "Vex pushes back: there's no proof big UAE companies buy within 6 months.",
    events: [
      { type: "assumption_challenged", assumptionId: ASSUMPTION, by: "vex", note: "No proof yet that big companies buy within 6 months." },
      headline("economics", "6-month deal time in doubt", "Vex found no proof for it"),
    ],
  },
  retry: { events: [{ type: "retry_requested", by: "vex", agentId: "orion", assumptionId: ASSUMPTION }] },
  "retry-done": {
    summary: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, not 6.",
    events: [
      {
        type: "evidence_discovered",
        evidence: {
          id: "ev-sales-cycle",
          statement: "Big companies take 9–12 months to buy, so going in alone runs over budget.",
          kind: "fact",
          moduleId: "market",
          foundBy: "orion",
          source: FIXTURE,
        },
      },
      { type: "assumption_resolved", assumptionId: ASSUMPTION, status: "rejected", evidenceId: "ev-sales-cycle" },
      headline("market", "Buying takes 9–12 months", "Confirmed with 2 more sources"),
      headline("economics", "Going alone runs over", "Deals take 9–12 months, not 6"),
    ],
  },
  "risk-check": {
    summary: "Vex: the biggest risk is money running out before deals close.",
    events: [
      {
        type: "evidence_discovered",
        evidence: { id: "ev-cash-risk", statement: "Biggest risk: money runs out before deals close.", kind: "risk", moduleId: "risk", foundBy: "vex", source: FIXTURE },
      },
      headline("risk", "Biggest risk: slow sales", "Money runs out before deals close"),
    ],
  },
  scenarios: {
    summary: "Lume lays out 3 options: go in alone, partner locally, or wait.",
    events: [{ type: "scenario_created", scenarios: scenarios(0.38, 0.36, 0.26) }, headline("possibility", "3 options on the table", "Go alone · Partner · Wait")],
  },
  shift: {
    summary: "With slower sales, partnering locally now looks best; going in alone looks weaker.",
    events: [
      { type: "scenario_updated", scenarios: scenarios(0.18, 0.62, 0.2) },
      {
        type: "recommendation_updated",
        recommendation: { status: "forming", leaning: LEANING, statement: null, reason: null, confidence: "moderate", evidenceIds: BASIS },
      },
      headline("possibility", "Best fit: local partner", "Fits the budget and slow sales"),
    ],
  },
  "lume-at-core": { events: [{ type: "agent_collaboration_started", agentIds: ["lume", "nova"], moduleId: null }] },
  synthesis: { summary: "Nova and Lume are putting the answer together.", events: [{ type: "synthesis_started", agentIds: ["nova", "lume"] }] },
  recommendation: {
    summary: `The answer: ${RECOMMENDATION.toLowerCase()}.`,
    events: [
      {
        type: "recommendation_updated",
        recommendation: { status: "final", leaning: LEANING, statement: RECOMMENDATION, reason: RECOMMENDATION_REASON, confidence: "moderate", evidenceIds: BASIS },
      },
      { type: "synthesis_completed", agentIds: ["nova", "lume"] },
    ],
  },
};
