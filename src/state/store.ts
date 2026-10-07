import { createStore, type StoreApi } from "zustand/vanilla";
import {
  AgentPatchSchema,
  ModulePatchSchema,
  NewEvidenceSchema,
  ScenarioSchema,
  WorkspaceModuleSchema,
  WorkspaceSchema,
  type AgentPatch,
  type Evidence,
  type ModulePatch,
  type NewEvidence,
  type Recommendation,
  type Scenario,
  type Workspace,
  type WorkspaceModule,
} from "./domain";

/**
 * Every action validates its input and returns false, leaving the workspace unchanged, when the input is
 * malformed or refers to something that does not exist. Updates are immutable and keep the references of
 * untouched records, so selectors stay stable.
 */
export interface WorkspaceActions {
  reset: (workspace: Workspace) => boolean;
  setTime: (time: number) => void;
  receiveObjective: (id: string, text: string) => boolean;
  setObjectiveStatus: (status: NonNullable<Workspace["objective"]>["status"]) => boolean;
  updateAgent: (id: string, patch: AgentPatch) => boolean;
  startTask: (agentId: string, title: string, moduleId: string | null) => boolean;
  finishTask: (agentId: string, status: "done" | "failed") => boolean;
  openModule: (module: Omit<WorkspaceModule, "openedAt" | "status"> & { reserved?: boolean }) => boolean;
  updateModule: (id: string, patch: ModulePatch) => boolean;
  removeModule: (id: string) => boolean;
  addEvidence: (evidence: NewEvidence) => boolean;
  supersedeEvidence: (id: string, by: string) => boolean;
  raiseAssumption: (id: string, statement: string, raisedBy: string) => boolean;
  challengeAssumption: (id: string, by: string, note: string) => boolean;
  resolveAssumption: (id: string, status: "confirmed" | "rejected", evidenceId: string | null) => boolean;
  setScenarios: (scenarios: Omit<Scenario, "updatedAt">[]) => boolean;
  setRecommendation: (recommendation: Omit<Recommendation, "updatedAt">) => boolean;
  requestHumanInput: (id: string, question: string, askedBy: string) => boolean;
  answerHumanInput: (id: string, answer: string) => boolean;
}

export type WorkspaceStoreState = { workspace: Workspace } & WorkspaceActions;
export type WorkspaceStore = StoreApi<WorkspaceStoreState>;

export function createWorkspaceStore(initial: Workspace): WorkspaceStore {
  const seed = WorkspaceSchema.parse(initial);
  return createStore<WorkspaceStoreState>()((set, get) => {
    const ws = () => get().workspace;
    const commit = (workspace: Workspace) => {
      set({ workspace });
      return true;
    };

    return {
      workspace: seed,

      reset: (workspace) => {
        const parsed = WorkspaceSchema.safeParse(workspace);
        return parsed.success ? commit(parsed.data) : false;
      },

      setTime: (time) => {
        if (Number.isFinite(time) && time >= 0 && time !== ws().time) commit({ ...ws(), time });
      },

      receiveObjective: (id, text) => {
        const current = ws();
        if (current.objective?.id === id || !id || !text.trim()) return false;
        return commit({ ...current, objective: { id, text: text.trim(), status: "received", receivedAt: current.time } });
      },

      setObjectiveStatus: (status) => {
        const current = ws();
        if (!current.objective || current.objective.status === status) return false;
        return commit({ ...current, objective: { ...current.objective, status } });
      },

      updateAgent: (id, patch) => {
        const current = ws();
        const agent = current.agents[id];
        const parsed = AgentPatchSchema.safeParse(patch);
        if (!agent || !parsed.success) return false;
        const changed = (Object.keys(parsed.data) as (keyof AgentPatch)[]).some((key) => agent[key] !== parsed.data[key]);
        if (!changed) return false;
        return commit({ ...current, agents: { ...current.agents, [id]: { ...agent, ...parsed.data } } });
      },

      startTask: (agentId, title, moduleId) => {
        const current = ws();
        if (!current.agents[agentId] || !title.trim()) return false;
        if (moduleId !== null && !current.modules[moduleId]) return false;
        const tasks = closeActive(current.tasks, agentId, "done", current.time);
        const id = `${agentId}-task-${current.tasks.filter((task) => task.agentId === agentId).length + 1}`;
        return commit({
          ...current,
          tasks: [...tasks, { id, agentId, title: title.trim(), moduleId, status: "active", startedAt: current.time, endedAt: null }],
        });
      },

      finishTask: (agentId, status) => {
        const current = ws();
        if (!current.tasks.some((task) => task.agentId === agentId && task.status === "active")) return false;
        return commit({ ...current, tasks: closeActive(current.tasks, agentId, status, current.time) });
      },

      openModule: ({ reserved = false, ...mod }) => {
        const current = ws();
        const parsed = WorkspaceModuleSchema.safeParse({
          ...mod,
          status: reserved ? "reserved" : "open",
          openedAt: reserved ? null : current.time,
        });
        if (!parsed.success) return false;
        const existing = current.modules[mod.id];
        if (existing) {
          if (reserved || existing.status !== "reserved") return false;
          return commit({ ...current, modules: { ...current.modules, [mod.id]: { ...existing, status: "open", openedAt: current.time } } });
        }
        return commit({
          ...current,
          moduleOrder: [...current.moduleOrder, mod.id],
          modules: { ...current.modules, [mod.id]: parsed.data },
        });
      },

      updateModule: (id, patch) => {
        const current = ws();
        const mod = current.modules[id];
        const parsed = ModulePatchSchema.safeParse(patch);
        if (!mod || !parsed.success) return false;
        const changed = (Object.keys(parsed.data) as (keyof ModulePatch)[]).some((key) => mod[key] !== parsed.data[key]);
        if (!changed) return false;
        return commit({ ...current, modules: { ...current.modules, [id]: { ...mod, ...parsed.data } } });
      },

      removeModule: (id) => {
        const current = ws();
        if (!current.modules[id]) return false;
        const modules = { ...current.modules };
        delete modules[id];
        return commit({ ...current, modules, moduleOrder: current.moduleOrder.filter((other) => other !== id) });
      },

      addEvidence: (evidence) => {
        const current = ws();
        const parsed = NewEvidenceSchema.safeParse(evidence);
        if (!parsed.success || current.evidence.some((item) => item.id === parsed.data.id)) return false;
        if (parsed.data.moduleId !== null && !current.modules[parsed.data.moduleId]) return false;
        const item: Evidence = { ...parsed.data, status: "accepted", foundAt: current.time, supersededBy: null };
        return commit({ ...current, evidence: [...current.evidence, item] });
      },

      supersedeEvidence: (id, by) => {
        const current = ws();
        const target = current.evidence.find((item) => item.id === id);
        if (!target || target.status === "superseded" || !current.evidence.some((item) => item.id === by)) return false;
        return commit({
          ...current,
          evidence: current.evidence.map((item) => (item.id === id ? { ...item, status: "superseded", supersededBy: by } : item)),
        });
      },

      raiseAssumption: (id, statement, raisedBy) => {
        const current = ws();
        if (!id || !statement.trim() || current.assumptions.some((item) => item.id === id)) return false;
        return commit({
          ...current,
          assumptions: [
            ...current.assumptions,
            { id, statement: statement.trim(), status: "open", raisedBy, raisedAt: current.time, challenge: null, resolvedBy: null, resolvedAt: null },
          ],
        });
      },

      challengeAssumption: (id, by, note) => {
        const current = ws();
        const target = current.assumptions.find((item) => item.id === id);
        if (!target || target.status !== "open" || !note.trim()) return false;
        return commit({
          ...current,
          assumptions: current.assumptions.map((item) =>
            item.id === id ? { ...item, status: "challenged", challenge: { by, note: note.trim(), at: current.time } } : item,
          ),
        });
      },

      resolveAssumption: (id, status, evidenceId) => {
        const current = ws();
        const target = current.assumptions.find((item) => item.id === id);
        if (!target || target.status === "confirmed" || target.status === "rejected") return false;
        if (evidenceId !== null && !current.evidence.some((item) => item.id === evidenceId)) return false;
        return commit({
          ...current,
          assumptions: current.assumptions.map((item) =>
            item.id === id ? { ...item, status, resolvedBy: evidenceId, resolvedAt: current.time } : item,
          ),
        });
      },

      setScenarios: (scenarios) => {
        const current = ws();
        const next = scenarios.map((scenario) => ScenarioSchema.safeParse({ ...scenario, updatedAt: current.time }));
        if (next.some((result) => !result.success)) return false;
        const parsed = next.map((result) => result.data!);
        const same =
          parsed.length === current.scenarios.length &&
          parsed.every((scenario, i) => {
            const before = current.scenarios[i]!;
            return before.id === scenario.id && before.label === scenario.label && before.assessment === scenario.assessment;
          });
        return same ? false : commit({ ...current, scenarios: parsed });
      },

      setRecommendation: (recommendation) => {
        const current = ws();
        const parsed = WorkspaceSchema.shape.recommendation.safeParse({ ...recommendation, updatedAt: current.time });
        if (!parsed.success || parsed.data === null) return false;
        const known = new Set(current.evidence.map((item) => item.id));
        if (!parsed.data.evidenceIds.every((id) => known.has(id))) return false;
        return commit({ ...current, recommendation: parsed.data });
      },

      requestHumanInput: (id, question, askedBy) => {
        const current = ws();
        if (!id || !question.trim() || current.humanInputs.some((item) => item.id === id)) return false;
        return commit({
          ...current,
          humanInputs: [
            ...current.humanInputs,
            { id, question: question.trim(), askedBy, askedAt: current.time, status: "pending", answer: null, answeredAt: null },
          ],
        });
      },

      answerHumanInput: (id, answer) => {
        const current = ws();
        const target = current.humanInputs.find((item) => item.id === id);
        if (!target || target.status !== "pending" || !answer.trim() || answer.length > 200) return false;
        return commit({
          ...current,
          humanInputs: current.humanInputs.map((item) =>
            item.id === id ? { ...item, status: "answered", answer: answer.trim(), answeredAt: current.time } : item,
          ),
        });
      },
    };
  });
}

function closeActive(tasks: Workspace["tasks"], agentId: string, status: "done" | "failed", time: number) {
  return tasks.map((task) => (task.agentId === agentId && task.status === "active" ? { ...task, status, endedAt: time } : task));
}
