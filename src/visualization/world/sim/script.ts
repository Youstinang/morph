import type { Action, AgentId, ScenarioWeights, ZoneId } from "./types";

export const OBJECTIVE =
  "Should a European AI software company enter the UAE market?";

export const BUDGET_QUESTION = "What's the most you can spend on the launch?";
export const BUDGET_ANSWER = "USD 500,000";
export const BUDGET_AUTO_CONFIRM_SECONDS = 3.5;

export const RECOMMENDATION = "Start with a local partner";
export const RECOMMENDATION_REASON =
  "Big UAE companies take 9–12 months to buy. On a USD 500,000 budget, going in alone runs out of money before deals close. A local partner already has customers and can keep data inside the UAE.";

export const SCENARIO_LABELS: Record<keyof ScenarioWeights, string> = {
  direct: "Go in alone",
  partnership: "Partner locally",
  delay: "Wait for now",
};

/**
 * Agent `task` strings are "-ing" phrases so they read both as a status ("Checking…")
 * and as narration ("Orion is checking…"). Emitted `log` strings are full sentences.
 */
const home = { home: true } as const;
const core = { core: true } as const;

export const SCRIPT: Record<AgentId, readonly Action[]> = {
  nova: [
    { kind: "wait", seconds: 1.4 },
    { kind: "moveTo", target: core, task: "reading the question" },
    { kind: "hold", seconds: 2.6, state: "working", task: "splitting the question into things to check" },
    { kind: "emit", signal: "plan", log: "Nova's plan: check customer demand, competitors and the rules." },
    { kind: "hold", seconds: 0.8, state: "completed", task: "handing out the work" },
    { kind: "waitFor", signal: "discovery", task: "keeping an eye on the team" },
    { kind: "hold", seconds: 1.2, state: "working", task: "updating the plan around the budget" },
    { kind: "emit", signal: "budget-request", log: "Nova needs one answer from you: the launch budget." },
    { kind: "waitFor", signal: "budget", task: "waiting for your budget" },
    { kind: "hold", seconds: 1, state: "completed", task: "adding your budget to the plan" },
    { kind: "waitFor", signal: "lume-at-core", task: "waiting for the options to be compared" },
    { kind: "hold", seconds: 3.4, state: "collaborating", task: "agreeing on an answer with Lume" },
    { kind: "waitFor", signal: "recommendation" },
    { kind: "hold", seconds: 1.4, state: "completed", task: "signing off the answer" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  orion: [
    { kind: "waitFor", signal: "plan", task: "waiting for a task" },
    { kind: "moveTo", target: { zone: "market" }, task: "heading to Market demand" },
    { kind: "hold", seconds: 3.6, state: "working", task: "checking whether UAE companies are buying AI software", zone: "market", evidence: 5 },
    { kind: "hold", seconds: 0.6, state: "completed", task: "wrapping up the demand findings", zone: "market" },
    { kind: "moveTo", target: { zone: "competition" }, task: "taking the demand findings to Sage" },
    { kind: "handoff", to: "sage", artifact: "evidence", signal: "pkg-market", task: "handing the demand findings to Sage" },
    { kind: "moveTo", target: { zone: "regulation" }, task: "heading to Rules" },
    { kind: "hold", seconds: 2, state: "working", task: "looking up the UAE rules on customer data", zone: "regulation", evidence: 1 },
    { kind: "hold", seconds: 1.5, state: "failed", task: "stuck: the government rules site isn't responding", zone: "regulation" },
    { kind: "hold", seconds: 2.4, state: "retrying", task: "trying another source for the rules", zone: "regulation", evidence: 4 },
    { kind: "emit", signal: "rules", log: "Orion found the rule: customer data must stay inside the UAE." },
    { kind: "emit", signal: "discovery", log: "Two things will decide this: your budget, and how long big companies take to buy." },
    { kind: "hold", seconds: 0.6, state: "completed", task: "wrapping up the rules findings", zone: "regulation" },
    { kind: "waitFor", signal: "retry", task: "standing by" },
    { kind: "moveTo", target: { zone: "market" }, task: "going back to double-check how long buying takes", state: "retrying" },
    { kind: "hold", seconds: 2.8, state: "working", task: "double-checking how long big companies take to buy", zone: "market", evidence: 8 },
    { kind: "emit", signal: "retry-done", log: "Checked with 2 more sources: big UAE companies take 9–12 months to buy, not 6." },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  sage: [
    { kind: "waitFor", signal: "plan", task: "waiting for a task" },
    { kind: "moveTo", target: { zone: "competition" }, task: "heading to Competitors" },
    { kind: "hold", seconds: 3, state: "working", task: "mapping who already sells AI software in the UAE", zone: "competition", evidence: 4 },
    { kind: "waitFor", signal: "pkg-market", task: "waiting for Orion's demand findings" },
    { kind: "hold", seconds: 2.6, state: "working", task: "comparing demand with what competitors offer", zone: "competition", evidence: 6 },
    { kind: "emit", signal: "competition", log: "Sage: two local rivals already sell to banks and government." },
    { kind: "waitFor", signal: "zone:economics", task: "waiting for the cost station" },
    { kind: "moveTo", target: { zone: "economics" }, task: "heading to Costs" },
    { kind: "hold", seconds: 3, state: "working", task: "estimating the cost of the first 18 months", zone: "economics", evidence: 3 },
    { kind: "emit", signal: "analysis", log: "Sage's first estimate: going in alone just fits the budget, if deals close within 6 months." },
    { kind: "hold", seconds: 2.8, state: "collaborating", task: "going through the numbers with Vex", zone: "economics" },
    { kind: "waitFor", signal: "retry-done", task: "waiting for Orion to double-check" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  brix: [
    { kind: "waitFor", signal: "discovery", task: "waiting for a task" },
    { kind: "moveTo", target: { zone: "economics" }, task: "going to set up the cost station" },
    { kind: "hold", seconds: 2, state: "working", task: "setting up the cost station", zone: "economics" },
    { kind: "emit", signal: "zone:economics", log: "Brix set up a station to work out the costs." },
    { kind: "moveTo", target: { zone: "risk" }, task: "going to set up the risk station" },
    { kind: "hold", seconds: 2, state: "working", task: "setting up the risk station", zone: "risk" },
    { kind: "emit", signal: "zone:risk", log: "Brix set up a station to test the risks." },
    { kind: "waitFor", signal: "challenge", task: "standing by" },
    { kind: "moveTo", target: { zone: "possibility" }, task: "going to set up the options station" },
    { kind: "hold", seconds: 2.4, state: "working", task: "setting up the options station", zone: "possibility" },
    { kind: "emit", signal: "zone:possibility", log: "Brix set up a station to compare the options." },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  vex: [
    { kind: "waitFor", signal: "analysis", task: "waiting for something to review" },
    { kind: "moveTo", target: { zone: "economics" }, task: "going to review Sage's estimate" },
    { kind: "hold", seconds: 2.8, state: "evaluating", task: "questioning the 6-month deal time", zone: "economics" },
    { kind: "emit", signal: "challenge", log: "Vex pushes back: there's no proof big UAE companies buy within 6 months." },
    { kind: "handoff", to: "orion", artifact: "flag", signal: "retry", task: "asking Orion to double-check" },
    { kind: "hold", seconds: 0.8, state: "completed", task: "noting the doubt", zone: "economics" },
    { kind: "moveTo", target: { zone: "risk" }, task: "going to test the risks" },
    { kind: "hold", seconds: 2.4, state: "evaluating", task: "testing what could go wrong", zone: "risk" },
    { kind: "emit", signal: "risk-check", log: "Vex: the biggest risk is money running out before deals close." },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  lume: [
    { kind: "waitFor", signal: "zone:possibility", task: "waiting for the options station" },
    { kind: "moveTo", target: { zone: "possibility" }, task: "going to compare the options" },
    { kind: "hold", seconds: 2, state: "working", task: "laying out the 3 options", zone: "possibility" },
    { kind: "emit", signal: "scenarios", log: "Lume lays out 3 options: go in alone, partner locally, or wait." },
    { kind: "waitFor", signal: "retry-done", task: "waiting for Orion to double-check" },
    { kind: "hold", seconds: 2.6, state: "evaluating", task: "weighing the options against your budget", zone: "possibility" },
    { kind: "emit", signal: "shift", log: "With slower sales, partnering locally now looks best; going in alone looks weaker." },
    { kind: "moveTo", target: core, task: "heading to the center to agree on an answer" },
    { kind: "emit", signal: "lume-at-core" },
    { kind: "emit", signal: "synthesis", log: "Nova and Lume are putting the answer together." },
    { kind: "hold", seconds: 3.4, state: "collaborating", task: "agreeing on an answer with Nova" },
    { kind: "emit", signal: "recommendation", log: `The answer: ${RECOMMENDATION.toLowerCase()}.` },
    { kind: "hold", seconds: 1.4, state: "completed", task: "sharing the answer" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
};

export type FindingKind = "fact" | "doubt" | "conclusion";

export interface Finding {
  signal: string;
  kind: FindingKind;
  text: string;
  /** A later finding that supersedes this one removes it from view. */
  replacedBy?: string;
}

export const FINDINGS: readonly Finding[] = [
  { signal: "pkg-market", kind: "fact", text: "UAE companies are actively buying AI software." },
  { signal: "competition", kind: "fact", text: "Two local rivals already sell to banks and government." },
  { signal: "rules", kind: "fact", text: "Customer data must stay inside the UAE." },
  { signal: "budget", kind: "fact", text: "Your launch budget is capped at USD 500,000." },
  { signal: "analysis", kind: "fact", text: "Going in alone just fits the budget, if deals close within 6 months.", replacedBy: "retry-done" },
  { signal: "challenge", kind: "doubt", text: "No proof yet that big companies buy within 6 months.", replacedBy: "retry-done" },
  { signal: "retry-done", kind: "fact", text: "Big companies take 9–12 months to buy, so going in alone runs over budget." },
  { signal: "risk-check", kind: "doubt", text: "Biggest risk: money runs out before deals close." },
  { signal: "shift", kind: "conclusion", text: "A local partner fits the budget and the slow buying cycle best." },
];

export interface ZoneHeadline {
  signal: string;
  headline: string;
  detail: string;
}

/** What each station's floating panel says; the latest fired signal wins. */
export const ZONE_HEADLINES: Record<ZoneId, readonly ZoneHeadline[]> = {
  market: [
    { signal: "pkg-market", headline: "Demand is growing", detail: "UAE companies are buying AI software" },
    { signal: "retry-done", headline: "Buying takes 9–12 months", detail: "Confirmed with 2 more sources" },
  ],
  competition: [
    { signal: "competition", headline: "2 strong local rivals", detail: "Already selling to banks and government" },
  ],
  regulation: [
    { signal: "rules", headline: "Data must stay in the UAE", detail: "Needs local hosting or a local partner" },
  ],
  economics: [
    { signal: "analysis", headline: "Going alone just fits", detail: "Only if deals close in 6 months" },
    { signal: "challenge", headline: "6-month deal time in doubt", detail: "Vex found no proof for it" },
    { signal: "retry-done", headline: "Going alone runs over", detail: "Deals take 9–12 months, not 6" },
  ],
  risk: [
    { signal: "risk-check", headline: "Biggest risk: slow sales", detail: "Money runs out before deals close" },
  ],
  possibility: [
    { signal: "scenarios", headline: "3 options on the table", detail: "Go alone · Partner · Wait" },
    { signal: "shift", headline: "Best fit: local partner", detail: "Fits the budget and slow sales" },
  ],
};
