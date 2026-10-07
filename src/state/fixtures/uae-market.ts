import type { ModuleGroup, Source, Workspace } from "../domain";
import type { EventDraft } from "@/events/schema";
import type { MorphOperation } from "../operations";
import type { InputControl } from "../input-controls";
import { createTeamWorkspace } from "../team";

/** Deterministic demo fixture for the flagship question. Demo data only — not live research. */

export const OBJECTIVE = "Should a European AI software company enter the UAE market?";
export const BUDGET_QUESTION = "What's the most you can spend on the launch?";
export const BUDGET_ANSWER = "USD 500,000";
export const RECOMMENDATION = "Start with a local partner";
export const RECOMMENDATION_REASON =
  "Big UAE companies take 9–12 months to buy. On a USD 500,000 budget, going in alone runs out of money before deals close. A local partner already has customers and can keep data inside the UAE.";

/** The budgets the demo's slider offers; each has its own scripted ending. */
export const BUDGET_STOPS = [250_000, 500_000, 1_000_000] as const;
export const BUDGET_DEFAULT = 500_000;
export const BUDGET_CONTROL = {
  type: "slider",
  min: BUDGET_STOPS[0],
  max: BUDGET_STOPS[2],
  currency: "USD",
  stops: [...BUDGET_STOPS],
  initial: BUDGET_DEFAULT,
} satisfies InputControl;
export type BudgetEnding = "low" | "mid" | "high";
export const ENDING_FOR: Record<number, BudgetEnding> = { 250_000: "low", 500_000: "mid", 1_000_000: "high" };

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

const BASIS = ["ev-sales-cycle", "ev-budget", "ev-data-residency"];
const ASSUMPTION = "as-fast-deals";

export const HUMAN_INPUTS = {
  budget: { question: BUDGET_QUESTION, control: BUDGET_CONTROL, autoplay: BUDGET_DEFAULT, answeredSummary: (display: string) => `You set the launch budget: ${display}.` },
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

/** The story moments every ending shares. Demo data only. */
const BASE_TIMELINE: Record<string, StoryBeat> = {
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
  "budget-request": {
    summary: "Nova needs one answer from you: the launch budget.",
    by: "nova",
    items: [{ operation: "request_human_input", requestId: "budget", question: BUDGET_QUESTION, askedBy: "nova", control: BUDGET_CONTROL }],
  },
  retry: { items: [{ type: "retry_requested", by: "vex", agentId: "orion", assumptionId: ASSUMPTION }] },
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
  "vex-at-costs": { items: [{ type: "agent_collaboration_started", agentIds: ["sage", "vex"], moduleId: "economics" }] },
  "lume-at-core": { items: [{ type: "agent_collaboration_started", agentIds: ["lume", "nova"], moduleId: null }] },
  synthesis: { summary: "Nova and Lume are putting the answer together.", items: [{ type: "synthesis_started", agentIds: ["nova", "lume"] }] },
};

/** What changes with the budget the user picks. Sage's first estimate rests on how fast deals must close. */
interface EndingText {
  budget: string;
  months: number;
  assumption: string;
  estimate: string;
  estimatePanel: [string, string];
  challengePanel: [string, string];
  salesCycle: string;
  checked: string;
  verdict: "confirmed" | "rejected";
  economicsAfter: [string, string];
  riskSummary: string;
  risk: string;
  riskPanel: [string, string];
  shiftSummary: string;
  shiftWeights: [number, number, number];
  shiftWhy: string;
  leaning: string;
  optionsPanel: [string, string];
  statement: string;
  reason: string;
  agreed: string;
}

export const ENDINGS: Record<BudgetEnding, EndingText> = {
  low: {
    budget: "USD 250,000",
    months: 3,
    assumption: "Going in alone only fits the budget if deals close within 3 months.",
    estimate: "Sage's first estimate: on USD 250,000, going in alone only works if deals close within 3 months.",
    estimatePanel: ["Going alone barely fits", "Only if deals close in 3 months"],
    challengePanel: ["3-month deal time in doubt", "Vex found no proof for it"],
    salesCycle: "Big companies take 9–12 months to buy, so going in alone runs out of money fast.",
    checked: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, not 3.",
    verdict: "rejected",
    economicsAfter: ["Going alone runs out", "Deals take 9–12 months, not 3"],
    riskSummary: "Vex: the biggest risk is running out of money within months.",
    risk: "Biggest risk: money runs out long before deals close.",
    riskPanel: ["Biggest risk: cash runs out", "Long before deals close"],
    shiftSummary: "With slow sales and a small budget, partnering locally looks best; going in alone looks weakest.",
    shiftWeights: [0.08, 0.58, 0.34],
    shiftWhy: "Slow enterprise buying makes going in alone impossible on this budget.",
    leaning: "A local partner is the only option this budget can carry.",
    optionsPanel: ["Best fit: local partner", "The budget can't carry going alone"],
    statement: "Start small with a local partner",
    reason:
      "Big UAE companies take 9–12 months to buy. USD 250,000 can't carry going in alone that long. A local partner already has customers and can keep data inside the UAE, so start small with one.",
    agreed: "Nova and Lume agreed: on a small budget, only a local partner fits the buying cycle and the data rule.",
  },
  mid: {
    budget: BUDGET_ANSWER,
    months: 6,
    assumption: "Going in alone just fits the budget, if deals close within 6 months.",
    estimate: "Sage's first estimate: going in alone just fits the budget, if deals close within 6 months.",
    estimatePanel: ["Going alone just fits", "Only if deals close in 6 months"],
    challengePanel: ["6-month deal time in doubt", "Vex found no proof for it"],
    salesCycle: "Big companies take 9–12 months to buy, so going in alone runs over budget.",
    checked: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, not 6.",
    verdict: "rejected",
    economicsAfter: ["Going alone runs over", "Deals take 9–12 months, not 6"],
    riskSummary: "Vex: the biggest risk is money running out before deals close.",
    risk: "Biggest risk: money runs out before deals close.",
    riskPanel: ["Biggest risk: slow sales", "Money runs out before deals close"],
    shiftSummary: "With slower sales, partnering locally now looks best; going in alone looks weaker.",
    shiftWeights: [0.18, 0.62, 0.2],
    shiftWhy: "Slower enterprise buying makes going in alone run over budget.",
    leaning: "A local partner fits the budget and the slow buying cycle best.",
    optionsPanel: ["Best fit: local partner", "Fits the budget and slow sales"],
    statement: RECOMMENDATION,
    reason: RECOMMENDATION_REASON,
    agreed: "Nova and Lume agreed: a local partner fits the budget, the buying cycle and the data rule.",
  },
  high: {
    budget: "USD 1,000,000",
    months: 12,
    assumption: "Going in alone fits the budget even if deals take up to 12 months.",
    estimate: "Sage's first estimate: on USD 1,000,000, going in alone fits even if deals take 12 months.",
    estimatePanel: ["Going alone fits", "Even if deals take 12 months"],
    challengePanel: ["12-month deal time in doubt", "Vex wants it checked"],
    salesCycle: "Big companies take 9–12 months to buy, which this budget can cover.",
    checked: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, so 12 months holds.",
    verdict: "confirmed",
    economicsAfter: ["Going alone fits", "The budget covers 12 months"],
    riskSummary: "Vex: with the money covered, the biggest risk is local rivals winning the first deals.",
    risk: "Biggest risk: local rivals win the first big deals.",
    riskPanel: ["Biggest risk: local rivals", "They may win the first deals"],
    shiftSummary: "Your budget covers the slow sales, so going in alone now looks best; partnering stays close.",
    shiftWeights: [0.54, 0.34, 0.12],
    shiftWhy: "Slow enterprise buying still fits a USD 1,000,000 budget.",
    leaning: "Going in alone fits the budget and keeps full control.",
    optionsPanel: ["Best fit: go in alone", "The budget covers slow sales"],
    statement: "Go in alone, with UAE data hosting",
    reason:
      "Big UAE companies take 9–12 months to buy, and USD 1,000,000 covers that wait. Going in alone keeps full control; hosting data inside the UAE meets the data rule. Watch the two local rivals.",
    agreed: "Nova and Lume agreed: the budget covers the buying cycle, and local hosting meets the data rule.",
  },
};

/** The story moments that depend on the budget the user picked. */
function endingBeats(text: EndingText): Record<string, StoryBeat> {
  return {
    "zone:possibility": {
      summary: "Brix set up a station to compare the options.",
      by: "brix",
      items: [
        {
          operation: "add_module",
          module: mod("possibility"),
          why: { reason: `The ${text.months}-month assumption was challenged, so the options need comparing.`, assumptionId: ASSUMPTION, agentId: "brix" },
        },
      ],
    },
    budget: {
      items: [
        evidence({ id: "ev-budget", statement: `Your launch budget is capped at ${text.budget}.`, kind: "constraint", moduleId: null, foundBy: "user", source: USER }),
      ],
    },
    analysis: {
      summary: text.estimate,
      by: "sage",
      items: [{ operation: "add_assumption", assumptionId: ASSUMPTION, statement: text.assumption, raisedBy: "sage" }, summary("economics", ...text.estimatePanel)],
    },
    challenge: {
      summary: `Vex pushes back: there's no proof big UAE companies buy within ${text.months} months.`,
      by: "vex",
      items: [
        { operation: "challenge_assumption", assumptionId: ASSUMPTION, by: "vex", note: `No proof yet that big companies buy within ${text.months} months.` },
        summary("economics", ...text.challengePanel),
      ],
    },
    "retry-done": {
      summary: text.checked,
      by: "orion",
      items: [
        evidence({ id: "ev-sales-cycle", statement: text.salesCycle, kind: "fact", moduleId: "market", foundBy: "orion", source: FIXTURE }),
        { operation: "update_assumption", assumptionId: ASSUMPTION, status: text.verdict, evidenceId: "ev-sales-cycle" },
        summary("market", "Buying takes 9–12 months", "Confirmed with 2 more sources"),
        summary("economics", ...text.economicsAfter),
      ],
    },
    "risk-check": {
      summary: text.riskSummary,
      by: "vex",
      items: [
        evidence({ id: "ev-cash-risk", statement: text.risk, kind: "risk", moduleId: "risk", foundBy: "vex", source: FIXTURE }),
        summary("risk", ...text.riskPanel),
      ],
    },
    shift: {
      summary: text.shiftSummary,
      by: "lume",
      items: [
        ...scenarioIds.map((id): OperationDraft => ({ operation: "update_scenario", scenarioId: id, assessment: weights(...text.shiftWeights)[id] })),
        {
          operation: "update_recommendation",
          recommendation: { status: "forming", leaning: text.leaning, statement: null, reason: null, confidence: "moderate", evidenceIds: BASIS },
          why: { reason: text.shiftWhy, evidenceIds: ["ev-sales-cycle", "ev-budget"], agentId: "lume" },
        },
        summary("possibility", ...text.optionsPanel),
      ],
    },
    recommendation: {
      summary: `The answer: ${text.statement.charAt(0).toLowerCase()}${text.statement.slice(1)}.`,
      by: "nova",
      items: [
        {
          operation: "update_recommendation",
          recommendation: { status: "final", leaning: text.leaning, statement: text.statement, reason: text.reason, confidence: "moderate", evidenceIds: BASIS },
          why: { reason: text.agreed, evidenceIds: BASIS, agentId: "nova" },
        },
        { operation: "update_objective", status: "answered" },
        { type: "synthesis_completed", agentIds: ["nova", "lume"] },
      ],
    },
  };
}

/** The flagship timeline for the budget the user picked, keyed by the story moment that plays it. Demo data only. */
export const timelineFor = (ending: BudgetEnding): Record<string, StoryBeat> => ({ ...BASE_TIMELINE, ...endingBeats(ENDINGS[ending]) });

/** The flagship timeline with the default budget. */
export const UAE_TIMELINE = timelineFor("mid");

/** Clears the deck at the end of a loop. */
export const END_OF_RUN_WHY = { reason: "The run is over; the deck clears before the story starts again." } as const;
