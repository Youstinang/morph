import { TEXT_CONTROL, checkAnswer, type InputControl } from "./input-controls";
import {
  AgentPatchSchema,
  ModulePatchSchema,
  NewEvidenceSchema,
  RecommendationSchema,
  ScenarioSchema,
  WorkspaceModuleSchema,
  type AgentPatch,
  type Evidence,
  type Focus,
  type ModulePatch,
  type NewEvidence,
  type Recommendation,
  type Scenario,
  type Workspace,
  type WorkspaceModule,
} from "./domain";

/**
 * Pure, deterministic workspace transitions. Each returns the next workspace, or a short reason when the
 * change is malformed, refers to something that does not exist, or is out of order. Untouched records keep
 * their references, so selectors stay stable. Times come from `workspace.time`.
 */
export type Transition = Workspace | string;

export const refused = (result: Transition): result is string => typeof result === "string";

export function receiveObjective(ws: Workspace, id: string, text: string): Transition {
  if (!id || !text.trim()) return "the objective is empty";
  if (ws.objective?.id === id) return `objective ${id} was already received`;
  return { ...ws, objective: { id, text: text.trim(), status: "received", receivedAt: ws.time } };
}

export function setObjectiveStatus(ws: Workspace, status: NonNullable<Workspace["objective"]>["status"]): Transition {
  if (!ws.objective) return "there is no objective yet";
  if (ws.objective.status === status) return `the objective is already ${status}`;
  return { ...ws, objective: { ...ws.objective, status } };
}

export function updateAgent(ws: Workspace, id: string, patch: AgentPatch): Transition {
  const agent = ws.agents[id];
  if (!agent) return `agent ${id} does not exist`;
  const parsed = AgentPatchSchema.safeParse(patch);
  if (!parsed.success) return "the agent change is malformed";
  const changed = (Object.keys(parsed.data) as (keyof AgentPatch)[]).some((key) => agent[key] !== parsed.data[key]);
  if (!changed) return "nothing changed";
  return { ...ws, agents: { ...ws.agents, [id]: { ...agent, ...parsed.data } } };
}

export function startTask(ws: Workspace, agentId: string, title: string, moduleId: string | null): Transition {
  if (!ws.agents[agentId]) return `agent ${agentId} does not exist`;
  if (!title.trim()) return "the task has no title";
  if (moduleId !== null && !ws.modules[moduleId]) return `module ${moduleId} does not exist`;
  const tasks = closeActive(ws.tasks, agentId, "done", ws.time);
  const id = `${agentId}-task-${ws.tasks.filter((task) => task.agentId === agentId).length + 1}`;
  return { ...ws, tasks: [...tasks, { id, agentId, title: title.trim(), moduleId, status: "active", startedAt: ws.time, endedAt: null }] };
}

export function finishTask(ws: Workspace, agentId: string, status: "done" | "failed"): Transition {
  if (!ws.tasks.some((task) => task.agentId === agentId && task.status === "active")) return `agent ${agentId} has no active task`;
  return { ...ws, tasks: closeActive(ws.tasks, agentId, status, ws.time) };
}

type NewModule = Omit<WorkspaceModule, "openedAt" | "status" | "summary">;

export function openModule(ws: Workspace, mod: NewModule, reserved = false): Transition {
  const parsed = WorkspaceModuleSchema.safeParse({ ...mod, status: reserved ? "reserved" : "open", openedAt: reserved ? null : ws.time, summary: null });
  if (!parsed.success) return "the module is malformed";
  const existing = ws.modules[mod.id];
  if (existing) {
    if (reserved || existing.status !== "reserved") return `module ${mod.id} already exists`;
    return { ...ws, modules: { ...ws.modules, [mod.id]: { ...existing, status: "open", openedAt: ws.time } } };
  }
  return { ...ws, moduleOrder: [...ws.moduleOrder, mod.id], modules: { ...ws.modules, [mod.id]: parsed.data } };
}

/** Opens a module in another's slot; the evidence gathered there moves to the new module. */
export function replaceModule(ws: Workspace, mod: NewModule, oldId: string): Transition {
  if (oldId === mod.id) return "a module can't replace itself";
  if (!ws.modules[oldId]) return `module ${oldId} does not exist`;
  if (ws.modules[mod.id]) return `module ${mod.id} already exists`;
  const index = ws.moduleOrder.indexOf(oldId);
  const without = removeModule(ws, oldId);
  if (refused(without)) return without;
  const opened = openModule(without, mod);
  if (refused(opened)) return opened;
  const moduleOrder = opened.moduleOrder.filter((id) => id !== mod.id);
  moduleOrder.splice(index, 0, mod.id);
  const evidence = opened.evidence.map((item) => (item.moduleId === oldId ? { ...item, moduleId: mod.id } : item));
  return { ...opened, moduleOrder, evidence };
}

export function updateModule(ws: Workspace, id: string, patch: ModulePatch): Transition {
  const mod = ws.modules[id];
  if (!mod) return `module ${id} does not exist`;
  const parsed = ModulePatchSchema.safeParse(patch);
  if (!parsed.success) return "the module change is malformed";
  const changed = (Object.keys(parsed.data) as (keyof ModulePatch)[]).some(
    (key) => JSON.stringify(mod[key]) !== JSON.stringify(parsed.data[key]),
  );
  if (!changed) return "nothing changed";
  return { ...ws, modules: { ...ws.modules, [id]: { ...mod, ...parsed.data } } };
}

export function removeModule(ws: Workspace, id: string): Transition {
  if (!ws.modules[id]) return `module ${id} does not exist`;
  const modules = { ...ws.modules };
  delete modules[id];
  return { ...ws, modules, moduleOrder: ws.moduleOrder.filter((other) => other !== id) };
}

export function addEvidence(ws: Workspace, evidence: NewEvidence): Transition {
  const parsed = NewEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return "the evidence is malformed";
  if (ws.evidence.some((item) => item.id === parsed.data.id)) return `evidence ${parsed.data.id} already exists`;
  if (parsed.data.moduleId !== null && !ws.modules[parsed.data.moduleId]) return `module ${parsed.data.moduleId} does not exist`;
  const item: Evidence = { ...parsed.data, status: "accepted", foundAt: ws.time, supersededBy: null };
  return { ...ws, evidence: [...ws.evidence, item] };
}

export function supersedeEvidence(ws: Workspace, id: string, by: string): Transition {
  const target = ws.evidence.find((item) => item.id === id);
  if (!target) return `evidence ${id} does not exist`;
  if (target.status === "superseded") return `evidence ${id} is already superseded`;
  if (id === by || !ws.evidence.some((item) => item.id === by)) return `evidence ${by} does not exist`;
  return { ...ws, evidence: ws.evidence.map((item) => (item.id === id ? { ...item, status: "superseded", supersededBy: by } : item)) };
}

export function removeEvidence(ws: Workspace, id: string): Transition {
  if (!ws.evidence.some((item) => item.id === id)) return `evidence ${id} does not exist`;
  if (ws.recommendation?.evidenceIds.includes(id)) return `evidence ${id} supports the recommendation`;
  if (ws.assumptions.some((item) => item.resolvedBy === id)) return `evidence ${id} resolved an assumption`;
  return { ...ws, evidence: ws.evidence.filter((item) => item.id !== id) };
}

export function raiseAssumption(ws: Workspace, id: string, statement: string, raisedBy: string): Transition {
  if (!id || !statement.trim()) return "the assumption is empty";
  if (ws.assumptions.some((item) => item.id === id)) return `assumption ${id} already exists`;
  return {
    ...ws,
    assumptions: [...ws.assumptions, { id, statement: statement.trim(), status: "open", raisedBy, raisedAt: ws.time, challenge: null, resolvedBy: null, resolvedAt: null }],
  };
}

export function challengeAssumption(ws: Workspace, id: string, by: string, note: string): Transition {
  const target = ws.assumptions.find((item) => item.id === id);
  if (!target) return `assumption ${id} does not exist`;
  if (target.status !== "open") return `assumption ${id} is ${target.status}, not open`;
  if (!note.trim()) return "the challenge has no note";
  return {
    ...ws,
    assumptions: ws.assumptions.map((item) => (item.id === id ? { ...item, status: "challenged", challenge: { by, note: note.trim(), at: ws.time } } : item)),
  };
}

export function resolveAssumption(ws: Workspace, id: string, status: "confirmed" | "rejected", evidenceId: string | null): Transition {
  const target = ws.assumptions.find((item) => item.id === id);
  if (!target) return `assumption ${id} does not exist`;
  if (target.status === "confirmed" || target.status === "rejected") return `assumption ${id} is already ${target.status}`;
  if (evidenceId !== null && !ws.evidence.some((item) => item.id === evidenceId)) return `evidence ${evidenceId} does not exist`;
  return { ...ws, assumptions: ws.assumptions.map((item) => (item.id === id ? { ...item, status, resolvedBy: evidenceId, resolvedAt: ws.time } : item)) };
}

type ScenarioDetail = Partial<Pick<Scenario, "why" | "risk" | "evidenceIds">>;
const unknownEvidence = (ws: Workspace, ids: readonly string[]) => ids.find((id) => !ws.evidence.some((item) => item.id === id && item.status === "accepted"));

export function addScenario(ws: Workspace, scenario: Pick<Scenario, "id" | "label" | "assessment"> & ScenarioDetail): Transition {
  const parsed = ScenarioSchema.safeParse({ ...scenario, updatedAt: ws.time });
  if (!parsed.success) return "the scenario is malformed";
  if (ws.scenarios.some((item) => item.id === scenario.id)) return `scenario ${scenario.id} already exists`;
  const missing = unknownEvidence(ws, parsed.data.evidenceIds);
  if (missing) return `evidence ${missing} does not exist`;
  return { ...ws, scenarios: [...ws.scenarios, parsed.data] };
}

export function updateScenario(ws: Workspace, id: string, change: { assessment: number; label?: string } & ScenarioDetail): Transition {
  const target = ws.scenarios.find((item) => item.id === id);
  if (!target) return `scenario ${id} does not exist`;
  const parsed = ScenarioSchema.safeParse({ ...target, ...change, updatedAt: ws.time });
  if (!parsed.success) return "the scenario change is malformed";
  const missing = unknownEvidence(ws, parsed.data.evidenceIds);
  if (missing) return `evidence ${missing} does not exist`;
  if (JSON.stringify({ ...parsed.data, updatedAt: 0 }) === JSON.stringify({ ...target, updatedAt: 0 })) return "nothing changed";
  return { ...ws, scenarios: ws.scenarios.map((item) => (item.id === id ? parsed.data : item)) };
}

export function setRecommendation(ws: Workspace, recommendation: Omit<Recommendation, "updatedAt">): Transition {
  const parsed = RecommendationSchema.safeParse({ ...recommendation, updatedAt: ws.time });
  if (!parsed.success) return "the recommendation is malformed";
  const known = new Set(ws.evidence.filter((item) => item.status === "accepted").map((item) => item.id));
  const missing = parsed.data.evidenceIds.find((id) => !known.has(id));
  if (missing) return `the recommendation cites evidence ${missing}, which is not accepted evidence`;
  if (parsed.data.status === "final" && (!parsed.data.statement || !parsed.data.reason)) return "a final recommendation needs a statement and a reason";
  return { ...ws, recommendation: parsed.data };
}

export function requestHumanInput(ws: Workspace, id: string, question: string, askedBy: string, control: InputControl = TEXT_CONTROL): Transition {
  if (!id || !question.trim()) return "the question is empty";
  if (ws.humanInputs.some((item) => item.id === id)) return `request ${id} already exists`;
  return {
    ...ws,
    humanInputs: [
      ...ws.humanInputs,
      { id, question: question.trim(), askedBy, askedAt: ws.time, control, status: "pending", answer: null, value: null, answeredAt: null },
    ],
  };
}

export function answerHumanInput(ws: Workspace, id: string, value: unknown): Transition {
  const target = ws.humanInputs.find((item) => item.id === id);
  if (!target) return `request ${id} does not exist`;
  if (target.status !== "pending") return `request ${id} was already ${target.status}`;
  const checked = checkAnswer(target.control, value);
  if (!checked.ok) return checked.reason;
  return {
    ...ws,
    humanInputs: ws.humanInputs.map((item) =>
      item.id === id ? { ...item, status: "answered", answer: checked.display, value: checked.value, answeredAt: ws.time } : item,
    ),
  };
}

export function skipHumanInput(ws: Workspace, id: string): Transition {
  const target = ws.humanInputs.find((item) => item.id === id);
  if (!target) return `request ${id} does not exist`;
  if (target.status !== "pending") return `request ${id} was already ${target.status}`;
  return { ...ws, humanInputs: ws.humanInputs.map((item) => (item.id === id ? { ...item, status: "skipped", answeredAt: ws.time } : item)) };
}

export function setFocus(ws: Workspace, focus: Focus): Transition {
  if (focus.kind === "module" && !ws.modules[focus.moduleId]) return `module ${focus.moduleId} does not exist`;
  if (focus.kind === "agent" && !ws.agents[focus.agentId]) return `agent ${focus.agentId} does not exist`;
  return { ...ws, focus };
}

function closeActive(tasks: Workspace["tasks"], agentId: string, status: "done" | "failed", time: number) {
  return tasks.map((task) => (task.agentId === agentId && task.status === "active" ? { ...task, status, endedAt: time } : task));
}
