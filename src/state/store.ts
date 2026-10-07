import { createStore, type StoreApi } from "zustand/vanilla";
import { WorkspaceSchema, type AgentPatch, type Workspace } from "./domain";
import { applyMorphOperation, type OperationResult } from "./operations";
import * as t from "./transitions";

/**
 * The canonical workspace. Its findings, modules, assumptions, scenarios, questions and answer change only
 * through `apply` (validated MorphOperations). Agent activity — state, current task, task history and tool
 * calls — is recorded directly from activity events. Every action leaves the workspace untouched when it refuses.
 */
export interface WorkspaceActions {
  reset: (workspace: Workspace) => boolean;
  setTime: (time: number) => void;
  apply: (operation: unknown) => OperationResult;
  updateAgent: (id: string, patch: AgentPatch) => boolean;
  startTask: (agentId: string, title: string, moduleId: string | null) => boolean;
  finishTask: (agentId: string, status: "done" | "failed") => boolean;
  recordModelUsage: (usage: { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number }) => void;
  /** Starts a tool call (counted once) or ends a running one; false when it changes nothing. */
  recordToolCall: (call: { id: string; agentId: string; tool: string } | { id: string; status: "succeeded" | "failed" }) => boolean;
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
      recordModelUsage: (usage) => {
        const cost = ws().cost;
        set({
          workspace: {
            ...ws(),
            cost: {
              ...cost,
              modelCalls: cost.modelCalls + usage.calls,
              inputTokens: cost.inputTokens + usage.inputTokens,
              outputTokens: cost.outputTokens + usage.outputTokens,
              estimatedUsd: cost.estimatedUsd + usage.estimatedUsd,
            },
          },
        });
      },
      recordToolCall: (call) => {
        const workspace = ws();
        const known = workspace.toolCalls.find((item) => item.id === call.id);
        if ("tool" in call) {
          if (known) return false;
          const started = { id: call.id, agentId: call.agentId, tool: call.tool, status: "running" as const, startedAt: workspace.time, endedAt: null };
          set({ workspace: { ...workspace, toolCalls: [...workspace.toolCalls, started], cost: { ...workspace.cost, toolCalls: workspace.cost.toolCalls + 1 } } });
          return true;
        }
        if (!known || known.status !== "running") return false;
        const ended = { ...known, status: call.status, endedAt: workspace.time };
        set({ workspace: { ...workspace, toolCalls: workspace.toolCalls.map((item) => (item === known ? ended : item)) } });
        return true;
      },
    };
  });
}
