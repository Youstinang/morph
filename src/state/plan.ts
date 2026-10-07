import { z } from "zod";
import { ModuleGroupSchema, type ModuleGroup, type Workspace } from "./domain";
import type { MorphOperation } from "./operations";
import { createTeamWorkspace } from "./team";

/**
 * The objective planner's output contract. A model fills it in; MORPH validates it here (on the server and
 * again in the browser) and turns it into ordinary MorphOperations, so a model never writes operations,
 * ids or markup directly. Nothing in a plan is evidence: it is a proposal for what to look into.
 */

export const PLANNER_AGENT = "nova";
export const PLAN_AGENTS = ["orion", "sage", "brix", "vex", "lume"] as const;
export const TEAM = [PLANNER_AGENT, ...PLAN_AGENTS] as const;
/** Kinds with a registered workstation; anything else is "general" and gets a plain console. */
export const PLAN_KINDS = ["market", "competition", "regulation", "economics", "risk", "general"] as const;
export const GROUP_CAPACITY: Record<ModuleGroup, number> = { research: 4, analysis: 4, decision: 3 };
export const PLAN_LIMITS = { modules: 6, tasks: 5, assumptions: 2, questions: 2 } as const;
export const OBJECTIVE_LIMITS = { min: 8, max: 300 } as const;

const Text = (max: number) => z.string().trim().min(1).max(max);

const PlanModuleSchema = z
  .object({ key: Text(40), title: Text(40), kind: z.enum(PLAN_KINDS), group: ModuleGroupSchema, why: Text(200) })
  .strict();
const PlanTaskSchema = z.object({ agent: z.enum(PLAN_AGENTS), module: Text(40), task: Text(90) }).strict();

export const PlanSchema = z
  .object({
    interpretation: Text(200),
    modules: z.array(PlanModuleSchema).min(2).max(PLAN_LIMITS.modules),
    tasks: z.array(PlanTaskSchema).min(1).max(PLAN_LIMITS.tasks),
    assumptions: z.array(z.object({ statement: Text(140), raisedBy: z.enum(TEAM) }).strict()).max(PLAN_LIMITS.assumptions),
    questions: z.array(z.object({ question: Text(140) }).strict()).max(PLAN_LIMITS.questions),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const keys = new Set<string>();
    for (const mod of plan.modules) {
      if (keys.has(mod.key)) ctx.addIssue({ code: "custom", path: ["modules"], message: `station key "${mod.key}" is used twice` });
      keys.add(mod.key);
    }
    for (const group of ModuleGroupSchema.options) {
      const count = plan.modules.filter((mod) => mod.group === group).length;
      if (count > GROUP_CAPACITY[group]) {
        ctx.addIssue({ code: "custom", path: ["modules"], message: `at most ${GROUP_CAPACITY[group]} ${group} stations` });
      }
    }
    const agents = new Set<string>();
    plan.tasks.forEach((task, i) => {
      if (!keys.has(task.module)) ctx.addIssue({ code: "custom", path: ["tasks", i, "module"], message: `"${task.module}" is not a station key` });
      if (agents.has(task.agent)) ctx.addIssue({ code: "custom", path: ["tasks", i, "agent"], message: `${task.agent} has two tasks` });
      agents.add(task.agent);
    });
  });
export type Plan = z.infer<typeof PlanSchema>;

export const PlanUsageSchema = z.object({
  calls: z.number().int().min(0).max(10),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nonnegative(),
});
export type PlanUsage = z.infer<typeof PlanUsageSchema>;

/** What `/api/plan` returns. Reasons are short and safe to show; they never contain secrets. */
export const PlanResponseSchema = z.discriminatedUnion("ok", [
  /** `runId` names the server's record of this question, for the team's later steps. */
  z.object({ ok: z.literal(true), plan: PlanSchema, usage: PlanUsageSchema, runId: z.string().regex(/^[\w-]{8,64}$/).optional() }),
  z.object({ ok: z.literal(false), reason: Text(200), usage: PlanUsageSchema.optional() }),
]);
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/**
 * Forgiving clean-up before validation, so small slips don't cost a second model call: extra items beyond
 * the limits are dropped, a task that names a station by its title is pointed at its key, an agent's
 * second task and tasks for unknown stations are dropped, and task phrases start lowercase.
 */
export function tidyPlan(input: unknown): unknown {
  const plan = record(input);
  if (!plan) return input;
  const modules = list(plan.modules).slice(0, PLAN_LIMITS.modules);
  const keyFor = new Map<string, string>();
  for (const item of modules) {
    const mod = record(item);
    if (typeof mod?.key !== "string") continue;
    keyFor.set(mod.key.trim().toLowerCase(), mod.key.trim());
    if (typeof mod.title === "string") keyFor.set(mod.title.trim().toLowerCase(), mod.key.trim());
  }
  const seen = new Set<unknown>();
  const tasks = list(plan.tasks).flatMap((item) => {
    const task = record(item);
    if (!task || seen.has(task.agent)) return [];
    const key = typeof task.module === "string" ? keyFor.get(task.module.trim().toLowerCase()) : undefined;
    if (!key) return [];
    seen.add(task.agent);
    return [{ ...task, module: key, task: typeof task.task === "string" ? lowerFirst(task.task.trim()) : task.task }];
  });
  return {
    ...plan,
    modules: modules.map((item) => {
      const mod = record(item);
      return mod && typeof mod.key === "string" ? { ...mod, key: mod.key.trim() } : item;
    }),
    tasks: tasks.slice(0, PLAN_LIMITS.tasks),
    assumptions: list(plan.assumptions).slice(0, PLAN_LIMITS.assumptions),
    questions: list(plan.questions).slice(0, PLAN_LIMITS.questions),
  };
}

export function parsePlan(input: unknown): { ok: true; plan: Plan } | { ok: false; issues: string } {
  const parsed = PlanSchema.safeParse(tidyPlan(input));
  if (parsed.success) return { ok: true, plan: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`)
    .join("; ");
  return { ok: false, issues };
}

/** One operation without its id; whoever proposes it adds the id and the trusted source. */
type Draft = Record<string, unknown> & { operation: MorphOperation["operation"] };

export interface PlanOperations {
  moduleIds: string[];
  modules: Draft[];
  assumptions: Draft[];
  questions: Draft[];
  assignments: { agentId: string; moduleId: string; task: string; operation: Draft }[];
}

/** Turns a validated plan into operations, deterministically. Station ids are assigned here, not by the model. */
export function planToOperations(plan: Plan, prefix: string): PlanOperations {
  const idFor = new Map(plan.modules.map((mod, i) => [mod.key, `${prefix}-m${i + 1}`]));
  const moduleIds = plan.modules.map((mod) => idFor.get(mod.key)!);
  return {
    moduleIds,
    modules: plan.modules.map((mod) => ({
      operation: "add_module",
      module: { id: idFor.get(mod.key)!, title: mod.title, kind: mod.kind, group: mod.group },
      why: { reason: mod.why, agentId: PLANNER_AGENT },
    })),
    assumptions: plan.assumptions.map((item, i) => ({
      operation: "add_assumption",
      assumptionId: `${prefix}-a${i + 1}`,
      statement: item.statement,
      raisedBy: item.raisedBy,
    })),
    questions: plan.questions.map((item, i) => ({
      operation: "request_human_input",
      requestId: `${prefix}-q${i + 1}`,
      question: item.question,
      askedBy: PLANNER_AGENT,
    })),
    assignments: plan.tasks.map((task) => {
      const moduleId = idFor.get(task.module)!;
      return { agentId: task.agent, moduleId, task: task.task, operation: { operation: "assign_agent", agentId: task.agent, task: task.task, moduleId } };
    }),
  };
}

/** An empty workspace for a live question, with the standing team. */
export const createLiveWorkspace = (id: string): Workspace => createTeamWorkspace(id, "real");
