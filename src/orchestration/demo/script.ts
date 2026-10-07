import type { AgentState } from "@/state/domain";
import type { TeamAgentId } from "@/state/team";

export type ArtifactKind = "evidence" | "insight" | "flag";

/** Where an agent is sent: a module by id, the Intent Core, or home. */
export type DemoTarget = { zone: string } | { core: true } | { home: true };

/**
 * One step of an agent's part in the recorded story. `waitFor` and `emit` coordinate agents through named
 * story moments; what each moment publishes lives in the fixture's `UAE_TIMELINE`.
 */
export type DemoAction =
  | { kind: "wait"; seconds: number }
  | { kind: "waitFor"; signal: string; task?: string }
  | { kind: "moveTo"; target: DemoTarget; task: string; state?: "moving" | "returning" | "retrying" }
  | { kind: "hold"; seconds: number; state: AgentState; task: string; zone?: string; evidence?: number }
  | { kind: "emit"; signal: string }
  | { kind: "handoff"; to: TeamAgentId; artifact: ArtifactKind; signal: string; task: string };

export const BUDGET_AUTO_CONFIRM_SECONDS = 3.5;

/**
 * Agent `task` strings are "-ing" phrases so they read both as a status ("Checking…")
 * and as narration ("Orion is checking…"). What each emitted signal publishes lives in the fixture's
 * `UAE_TIMELINE`.
 */
const home = { home: true } as const;
const core = { core: true } as const;

export const DEMO_SCRIPT: Record<TeamAgentId, readonly DemoAction[]> = {
  nova: [
    { kind: "wait", seconds: 1.4 },
    { kind: "moveTo", target: core, task: "reading the question" },
    { kind: "emit", signal: "planning" },
    { kind: "hold", seconds: 2.6, state: "working", task: "splitting the question into things to check" },
    { kind: "emit", signal: "plan" },
    { kind: "hold", seconds: 0.8, state: "completed", task: "handing out the work" },
    { kind: "waitFor", signal: "discovery", task: "keeping an eye on the team" },
    { kind: "hold", seconds: 1.2, state: "working", task: "updating the plan around the budget" },
    { kind: "emit", signal: "budget-request" },
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
    { kind: "emit", signal: "rules" },
    { kind: "emit", signal: "discovery" },
    { kind: "hold", seconds: 0.6, state: "completed", task: "wrapping up the rules findings", zone: "regulation" },
    { kind: "waitFor", signal: "retry", task: "standing by" },
    { kind: "moveTo", target: { zone: "market" }, task: "going back to double-check how long buying takes", state: "retrying" },
    { kind: "hold", seconds: 2.8, state: "working", task: "double-checking how long big companies take to buy", zone: "market", evidence: 8 },
    { kind: "emit", signal: "retry-done" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  sage: [
    { kind: "waitFor", signal: "plan", task: "waiting for a task" },
    { kind: "moveTo", target: { zone: "competition" }, task: "heading to Competitors" },
    { kind: "hold", seconds: 3, state: "working", task: "mapping who already sells AI software in the UAE", zone: "competition", evidence: 4 },
    { kind: "waitFor", signal: "pkg-market", task: "waiting for Orion's demand findings" },
    { kind: "hold", seconds: 2.6, state: "working", task: "comparing demand with what competitors offer", zone: "competition", evidence: 6 },
    { kind: "emit", signal: "competition" },
    { kind: "waitFor", signal: "zone:economics", task: "waiting for the cost station" },
    { kind: "moveTo", target: { zone: "economics" }, task: "heading to Costs" },
    { kind: "hold", seconds: 3, state: "working", task: "estimating the cost of the first 18 months", zone: "economics", evidence: 3 },
    { kind: "emit", signal: "analysis" },
    { kind: "waitFor", signal: "vex-at-costs", task: "waiting for Vex to review the estimate" },
    { kind: "hold", seconds: 2.8, state: "collaborating", task: "going through the numbers with Vex", zone: "economics" },
    { kind: "waitFor", signal: "retry-done", task: "waiting for Orion to double-check" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  brix: [
    { kind: "waitFor", signal: "discovery", task: "waiting for a task" },
    { kind: "moveTo", target: { zone: "economics" }, task: "going to set up the cost station" },
    { kind: "hold", seconds: 2, state: "working", task: "setting up the cost station", zone: "economics" },
    { kind: "emit", signal: "zone:economics" },
    { kind: "moveTo", target: { zone: "risk" }, task: "going to set up the risk station" },
    { kind: "hold", seconds: 2, state: "working", task: "setting up the risk station", zone: "risk" },
    { kind: "emit", signal: "zone:risk" },
    { kind: "waitFor", signal: "challenge", task: "standing by" },
    { kind: "moveTo", target: { zone: "possibility" }, task: "going to set up the options station" },
    { kind: "hold", seconds: 2.4, state: "working", task: "setting up the options station", zone: "possibility" },
    { kind: "emit", signal: "zone:possibility" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  vex: [
    { kind: "waitFor", signal: "analysis", task: "waiting for something to review" },
    { kind: "moveTo", target: { zone: "economics" }, task: "going to review Sage's estimate" },
    { kind: "emit", signal: "vex-at-costs" },
    { kind: "hold", seconds: 2.8, state: "evaluating", task: "questioning the 6-month deal time", zone: "economics" },
    { kind: "emit", signal: "challenge" },
    { kind: "handoff", to: "orion", artifact: "flag", signal: "retry", task: "asking Orion to double-check" },
    { kind: "hold", seconds: 0.8, state: "completed", task: "noting the doubt", zone: "economics" },
    { kind: "moveTo", target: { zone: "risk" }, task: "going to test the risks" },
    { kind: "hold", seconds: 2.4, state: "evaluating", task: "testing what could go wrong", zone: "risk" },
    { kind: "emit", signal: "risk-check" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
  lume: [
    { kind: "waitFor", signal: "zone:possibility", task: "waiting for the options station" },
    { kind: "moveTo", target: { zone: "possibility" }, task: "going to compare the options" },
    { kind: "hold", seconds: 2, state: "working", task: "laying out the 3 options", zone: "possibility" },
    { kind: "emit", signal: "scenarios" },
    { kind: "waitFor", signal: "retry-done", task: "waiting for Orion to double-check" },
    { kind: "hold", seconds: 2.6, state: "evaluating", task: "weighing the options against your budget", zone: "possibility" },
    { kind: "emit", signal: "shift" },
    { kind: "moveTo", target: core, task: "heading to the center to agree on an answer" },
    { kind: "emit", signal: "lume-at-core" },
    { kind: "emit", signal: "synthesis" },
    { kind: "hold", seconds: 3.4, state: "collaborating", task: "agreeing on an answer with Nova" },
    { kind: "emit", signal: "recommendation" },
    { kind: "hold", seconds: 1.4, state: "completed", task: "sharing the answer" },
    { kind: "moveTo", target: home, task: "heading back", state: "returning" },
  ],
};
