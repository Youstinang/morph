import type { ModuleGroup, Source, Workspace } from "../domain";
import type { EventDraft } from "@/events/schema";
import type { MorphOperation } from "../operations";
import { createTeamWorkspace } from "../team";

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

export const createUaeWorkspace = (): Workspace => createTeamWorkspace("uae-market-entry", "demo");

const LEANING = "A local partner fits the budget and the slow buying cycle best.";
const BASIS = ["ev-sales-cycle", "ev-budget", "ev-data-residency"];
const ASSUMPTION = "as-fast-deals";

export const HUMAN_INPUTS = {
  budget: { question: BUDGET_QUESTION, answer: BUDGET_ANSWER, answeredSummary: `You set the launch budget: ${BUDGET_ANSWER}.` },
} as const;

/** An operation as the timeline writes it; the runner adds the id and the gate stamps the trusted source. */
export type OperationDraft = MorphOperation extends infer O ? (O extends MorphOperation ? Omit<O, "id" | "source"> : never) : never;
export type BeatItem = EventDraft | OperationDraft;
export const isOperation = (item: BeatItem): item is OperationDraft => "operation" in item;

/**
 * A story moment: activity events and proposed operations, in order. The summary is narrated with the
 * first item. `by` is the agent the moment's operations are attributed to; `user` marks the user's own input.
 */
export interface StoryBeat {
  summary?: string;
  by?: string;
  user?: boolean;
  items: readonly BeatItem[];
}

const mod = (id: DemoModuleId) => ({ id, kind: id, ...DEMO_MODULES[id] });
const summary = (moduleId: DemoModuleId, headline: string, detail: string): OperationDraft => ({
  operation: "update_module",
  moduleId,
  changes: { summary: { headline, detail } },
});
const evidence = (item: NewEvidenceInput): OperationDraft => ({ operation: "add_evidence", evidence: item });
type NewEvidenceInput = Extract<OperationDraft, { operation: "add_evidence" }>["evidence"];
const scenarioIds = Object.keys(SCENARIO_LABELS) as ScenarioKey[];
const weights = (direct: number, partnership: number, delay: number) => ({ direct, partnership, delay });

/** The flagship timeline, keyed by the story moment that plays it. Demo data only. */
export const UAE_TIMELINE: Record<string, StoryBeat> = {
  objective: {
    summary: "You asked the team a question.",
    user: true,
    items: [{ operation: "set_objective", objectiveId: "uae-entry", text: OBJECTIVE }],
  },
  planning: { items: [{ type: "planning_started", agentId: "nova" }] },
  plan: {
    summary: "Nova's plan: check customer demand, competitors and the rules.",
    by: "nova",
    items: [
      { type: "plan_created", agentId: "nova", moduleIds: ["market", "competition", "regulation"] },
      { operation: "update_objective", status: "in_progress" },
      ...(["market", "competition", "regulation"] as const).map(
        (id): OperationDraft => ({
          operation: "add_module",
          module: mod(id),
          why: { reason: "Nova's plan checks customer demand, competitors and the rules first.", agentId: "nova" },
        }),
      ),
    ],
  },
  "pkg-market": {
    by: "orion",
    items: [
      evidence({ id: "ev-demand", statement: "UAE companies are actively buying AI software.", kind: "fact", moduleId: "market", foundBy: "orion", source: FIXTURE }),
      summary("market", "Demand is growing", "UAE companies are buying AI software"),
    ],
  },
  rules: {
    summary: "Orion found the rule: customer data must stay inside the UAE.",
    by: "orion",
    items: [
      evidence({ id: "ev-data-residency", statement: "Customer data must stay inside the UAE.", kind: "constraint", moduleId: "regulation", foundBy: "orion", source: FIXTURE }),
      summary("regulation", "Data must stay in the UAE", "Needs local hosting or a local partner"),
    ],
  },
  discovery: {
    summary: "Two things will decide this: your budget, and how long big companies take to buy.",
    by: "orion",
    items: [
      { type: "workspace_morph_started", reason: "The budget and the buying cycle need their own analysis." },
      ...(["economics", "risk", "possibility"] as const).map(
        (id): OperationDraft => ({
          operation: "add_module",
          module: mod(id),
          reserve: true,
          why: { reason: "The budget and the buying cycle need costs, risks and options worked out.", agentId: "orion" },
        }),
      ),
      { type: "workspace_morph_completed" },
    ],
  },
  competition: {
    summary: "Sage: two local rivals already sell to banks and government.",
    by: "sage",
    items: [
      evidence({ id: "ev-rivals", statement: "Two local rivals already sell to banks and government.", kind: "fact", moduleId: "competition", foundBy: "sage", source: FIXTURE }),
      summary("competition", "2 strong local rivals", "Already selling to banks and government"),
    ],
  },
  "zone:economics": {
    summary: "Brix set up a station to work out the costs.",
    by: "brix",
    items: [{ operation: "add_module", module: mod("economics"), why: { reason: "The launch budget needs a cost estimate.", agentId: "brix" } }],
  },
  "zone:risk": {
    summary: "Brix set up a station to test the risks.",
    by: "brix",
    items: [{ operation: "add_module", module: mod("risk"), why: { reason: "A slow buying cycle could strain the budget.", agentId: "brix" } }],
  },
  "zone:possibility": {
    summary: "Brix set up a station to compare the options.",
    by: "brix",
    items: [
      {
        operation: "add_module",
        module: mod("possibility"),
        why: { reason: "The 6-month assumption was challenged, so the options need comparing.", assumptionId: ASSUMPTION, agentId: "brix" },
      },
    ],
  },
  "budget-request": {
    summary: "Nova needs one answer from you: the launch budget.",
    by: "nova",
    items: [{ operation: "request_human_input", requestId: "budget", question: BUDGET_QUESTION, askedBy: "nova" }],
  },
  budget: {
    items: [
      evidence({ id: "ev-budget", statement: `Your launch budget is capped at ${BUDGET_ANSWER}.`, kind: "constraint", moduleId: null, foundBy: "user", source: USER }),
    ],
  },
  analysis: {
    summary: "Sage's first estimate: going in alone just fits the budget, if deals close within 6 months.",
    by: "sage",
    items: [
      { operation: "add_assumption", assumptionId: ASSUMPTION, statement: "Going in alone just fits the budget, if deals close within 6 months.", raisedBy: "sage" },
      summary("economics", "Going alone just fits", "Only if deals close in 6 months"),
    ],
  },
  challenge: {
    summary: "Vex pushes back: there's no proof big UAE companies buy within 6 months.",
    by: "vex",
    items: [
      { operation: "challenge_assumption", assumptionId: ASSUMPTION, by: "vex", note: "No proof yet that big companies buy within 6 months." },
      summary("economics", "6-month deal time in doubt", "Vex found no proof for it"),
    ],
  },
  retry: { items: [{ type: "retry_requested", by: "vex", agentId: "orion", assumptionId: ASSUMPTION }] },
  "retry-done": {
    summary: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, not 6.",
    by: "orion",
    items: [
      evidence({
        id: "ev-sales-cycle",
        statement: "Big companies take 9–12 months to buy, so going in alone runs over budget.",
        kind: "fact",
        moduleId: "market",
        foundBy: "orion",
        source: FIXTURE,
      }),
      { operation: "update_assumption", assumptionId: ASSUMPTION, status: "rejected", evidenceId: "ev-sales-cycle" },
      summary("market", "Buying takes 9–12 months", "Confirmed with 2 more sources"),
      summary("economics", "Going alone runs over", "Deals take 9–12 months, not 6"),
    ],
  },
  "risk-check": {
    summary: "Vex: the biggest risk is money running out before deals close.",
    by: "vex",
    items: [
      evidence({ id: "ev-cash-risk", statement: "Biggest risk: money runs out before deals close.", kind: "risk", moduleId: "risk", foundBy: "vex", source: FIXTURE }),
      summary("risk", "Biggest risk: slow sales", "Money runs out before deals close"),
    ],
  },
  scenarios: {
    summary: "Lume lays out 3 options: go in alone, partner locally, or wait.",
    by: "lume",
    items: [
      ...scenarioIds.map(
        (id): OperationDraft => ({ operation: "add_scenario", scenario: { id, label: SCENARIO_LABELS[id], assessment: weights(0.38, 0.36, 0.26)[id] } }),
      ),
      summary("possibility", "3 options on the table", "Go alone · Partner · Wait"),
    ],
  },
  shift: {
    summary: "With slower sales, partnering locally now looks best; going in alone looks weaker.",
    by: "lume",
    items: [
      ...scenarioIds.map((id): OperationDraft => ({ operation: "update_scenario", scenarioId: id, assessment: weights(0.18, 0.62, 0.2)[id] })),
      {
        operation: "update_recommendation",
        recommendation: { status: "forming", leaning: LEANING, statement: null, reason: null, confidence: "moderate", evidenceIds: BASIS },
        why: { reason: "Slower enterprise buying makes going in alone run over budget.", evidenceIds: ["ev-sales-cycle", "ev-budget"], agentId: "lume" },
      },
      summary("possibility", "Best fit: local partner", "Fits the budget and slow sales"),
    ],
  },
  "vex-at-costs": { items: [{ type: "agent_collaboration_started", agentIds: ["sage", "vex"], moduleId: "economics" }] },
  "lume-at-core": { items: [{ type: "agent_collaboration_started", agentIds: ["lume", "nova"], moduleId: null }] },
  synthesis: { summary: "Nova and Lume are putting the answer together.", items: [{ type: "synthesis_started", agentIds: ["nova", "lume"] }] },
  recommendation: {
    summary: `The answer: ${RECOMMENDATION.toLowerCase()}.`,
    by: "nova",
    items: [
      {
        operation: "update_recommendation",
        recommendation: { status: "final", leaning: LEANING, statement: RECOMMENDATION, reason: RECOMMENDATION_REASON, confidence: "moderate", evidenceIds: BASIS },
        why: { reason: "Nova and Lume agreed: a local partner fits the budget, the buying cycle and the data rule.", evidenceIds: BASIS, agentId: "nova" },
      },
      { operation: "update_objective", status: "answered" },
      { type: "synthesis_completed", agentIds: ["nova", "lume"] },
    ],
  },
};

/** Clears the deck at the end of a loop. */
export const END_OF_RUN_WHY = { reason: "The run is over; the deck clears before the story starts again." } as const;
