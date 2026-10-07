import type { Plan } from "../plan";

/** A small valid plan for tests and development pages. */
export const SAMPLE_PLAN: Plan = {
  interpretation: "Decide whether the bakery should deliver through apps.",
  modules: [
    { key: "demand", title: "Customer demand", kind: "market", group: "research", why: "We need to know if customers want delivery." },
    { key: "costs", title: "App costs", kind: "economics", group: "analysis", why: "Commissions decide whether orders make money." },
    { key: "risks", title: "Operating risks", kind: "risk", group: "decision", why: "Quality and staffing could suffer." },
  ],
  tasks: [
    { agent: "orion", module: "demand", task: "checking who orders bakery delivery" },
    { agent: "sage", module: "costs", task: "comparing app fees with margins" },
    { agent: "vex", module: "risks", task: "testing what could go wrong" },
  ],
  assumptions: [{ statement: "The bakery can list on at least one app.", raisedBy: "nova" }],
  questions: [{ question: "How many extra orders a day can the kitchen handle?" }],
};
