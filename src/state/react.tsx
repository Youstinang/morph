"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Workspace } from "./domain";
import type { WorkspaceStore } from "./store";

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ store, children }: { store: WorkspaceStore; children: ReactNode }) {
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore(): WorkspaceStore {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  return store;
}

/** Subscribes to one slice of the workspace; arrays and objects are compared shallowly. */
export function useWorkspace<T>(selector: (workspace: Workspace) => T): T {
  const store = useWorkspaceStore();
  return useStore(store, useShallow((state) => selector(state.workspace)));
}
