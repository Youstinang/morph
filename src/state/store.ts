import { createStore, type StoreApi } from "zustand/vanilla";
import { WorkspaceSchema, type AgentPatch, type Workspace } from "./domain";
import { applyMorphOperation, type OperationResult } from "./operations";
import * as t from "./transitions";

/**
 * The canonical workspace. Its findings, modules, assumptions, scenarios, questions and answer change only
 * through `apply` (validated MorphOperations). Agent activity — state, current task, task history — is
 * recorded directly from activity events. Every action leaves the workspace untouched when it refuses.
 */
export interface WorkspaceActions {
  reset: (workspace: Workspace) => boolean;
  setTime: (time: number) => void;
  apply: (operation: unknown) => OperationResult;
  updateAgent: (id: string, patch: AgentPatch) => boolean;
  startTask: (agentId: string, title: string, moduleId: string | null) => boolean;
  finishTask: (agentId: string, status: "done" | "failed") => boolean;
}

export type WorkspaceStoreState = { workspace: Workspace } & WorkspaceActions;
export type WorkspaceStore = StoreApi<WorkspaceStoreState>;

export function createWorkspaceStore(initial: Workspace): WorkspaceStore {
  const seed = WorkspaceSchema.parse(initial);
  return createStore<WorkspaceStoreState>()((set, get) => {
    const ws = () => get().workspace;
    const run = (next: t.Transition) => {
      if (t.refused(next)) return false;
      set({ workspace: next });
      return true;
    };

    return {
      workspace: seed,
      reset: (workspace) => {
        const parsed = WorkspaceSchema.safeParse(workspace);
        return parsed.success ? run(parsed.data) : false;
      },
      setTime: (time) => {
        if (Number.isFinite(time) && time >= 0 && time !== ws().time) set({ workspace: { ...ws(), time } });
      },
      apply: (operation) => {
        const result = applyMorphOperation(ws(), operation);
        if (result.ok) set({ workspace: result.workspace });
        return result;
      },
      updateAgent: (id, patch) => run(t.updateAgent(ws(), id, patch)),
      startTask: (agentId, title, moduleId) => run(t.startTask(ws(), agentId, title, moduleId)),
      finishTask: (agentId, status) => run(t.finishTask(ws(), agentId, status)),
    };
  });
}
