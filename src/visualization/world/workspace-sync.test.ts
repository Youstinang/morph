import { describe, expect, it } from "vitest";
import { WorkspaceSchema } from "@/state/domain";
import { DEMO_AGENTS, UAE_STORY, createUaeWorkspace } from "@/state/fixtures/uae-market";
import { findingLines } from "@/state/selectors";
import { createWorkspaceStore } from "@/state/store";
import { applyStoryFact } from "@/state/story";
import { AGENTS, AGENT_ORDER } from "./sim/roster";
import type { World } from "./sim/types";
import { createWorld, stepWorld } from "./sim/world";
import { createWorkspaceSync } from "./workspace-sync";

const DT = 1 / 60;
const SYNC_EVERY = 0.14;

/** Runs the demo with the bridge at the HUD's cadence, recording the workspace whenever a check asks. */
function play(until: (world: World) => boolean, onSync?: (world: World, store: ReturnType<typeof createWorkspaceStore>) => void) {
  const store = createWorkspaceStore(createUaeWorkspace());
  const sync = createWorkspaceSync(store);
  let world = createWorld();
  let since = 0;
  for (let i = 0; i < 120 / DT && !until(world); i += 1) {
    world = stepWorld(world, DT);
    since += DT;
    if (since >= SYNC_EVERY) {
      since = 0;
      sync(world);
      onSync?.(world, store);
    }
  }
  sync(world);
  return { world, store };
}

describe("demo fixture", () => {
  it("names the same agents the world renders", () => {
    expect(DEMO_AGENTS.map((agent) => agent.id)).toEqual([...AGENT_ORDER]);
    for (const agent of DEMO_AGENTS) expect(agent.name).toBe(AGENTS[agent.id as keyof typeof AGENTS].name);
  });

  it("never marks fixture or model facts as verified", () => {
    for (const facts of Object.values(UAE_STORY)) {
      for (const fact of facts) {
        if (fact.type === "evidence" && fact.evidence.source.kind !== "user") expect(fact.evidence.source.verified).toBe(false);
      }
    }
  });
});

describe("workspace bridge", () => {
  it("records the whole story in the canonical store without a rejected fact", () => {
    const store = createWorkspaceStore(createUaeWorkspace());
    const s = store.getState();
    for (const id of ["market", "competition", "regulation", "risk"]) {
      s.openModule({ id, title: id, kind: id, group: "research", emphasis: "normal", collapsed: false, size: 1 });
    }
    const order = ["objective", "plan", "pkg-market", "competition", "rules", "budget-request", "budget", "analysis", "challenge", "retry-done", "risk-check", "shift", "recommendation"];
    expect(Object.keys(UAE_STORY).sort()).toEqual([...order].sort());
    for (const signal of order) for (const fact of UAE_STORY[signal]!) expect(applyStoryFact(store, fact)).toBe(true);
    expect(WorkspaceSchema.safeParse(store.getState().workspace).success).toBe(true);
  });

  it("ends with the answer, every module mirrored, and per-agent task history", () => {
    const seenModules = new Set<string>();
    const { store } = play(
      (world) => world.signals.has("recommendation") && world.time > world.signals.get("recommendation")! + 1,
      (_, s) => s.getState().workspace.moduleOrder.forEach((id) => seenModules.add(id)),
    );
    const ws = store.getState().workspace;
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true);
    expect(ws.objective).toMatchObject({ status: "answered" });
    expect(ws.recommendation).toMatchObject({ status: "final", statement: "Start with a local partner" });
    expect([...seenModules].sort()).toEqual(["competition", "economics", "market", "possibility", "regulation", "risk"]);
    expect(ws.humanInputs).toEqual([expect.objectContaining({ id: "budget", status: "answered", answer: "USD 500,000" })]);
    expect(ws.assumptions[0]).toMatchObject({ status: "rejected", resolvedBy: "ev-sales-cycle" });
    expect(ws.tasks.some((task) => task.agentId === "orion" && task.status === "failed")).toBe(true);
    for (const id of AGENT_ORDER) expect(ws.tasks.some((task) => task.agentId === id)).toBe(true);
    const partnership = ws.scenarios.find((scenario) => scenario.id === "partnership")!;
    expect(ws.scenarios.every((scenario) => scenario.assessment <= partnership.assessment)).toBe(true);
  });

  it("shows the same findings the approved HUD showed, in the same order", () => {
    const lines = (signal: string) => {
      const ws = play((world) => world.signals.has(signal)).store.getState().workspace;
      return findingLines(ws.evidence, ws.assumptions, ws.recommendation).map((line) => [line.kind, line.text]);
    };
    const known = [
      ["fact", "UAE companies are actively buying AI software."],
      ["fact", "Two local rivals already sell to banks and government."],
      ["fact", "Customer data must stay inside the UAE."],
      ["fact", "Your launch budget is capped at USD 500,000."],
    ];
    expect(lines("risk-check")).toEqual([
      ...known,
      ["fact", "Going in alone just fits the budget, if deals close within 6 months."],
      ["doubt", "No proof yet that big companies buy within 6 months."],
      ["doubt", "Biggest risk: money runs out before deals close."],
    ]);
    expect(lines("shift")).toEqual([
      ...known,
      ["doubt", "Biggest risk: money runs out before deals close."],
      ["fact", "Big companies take 9–12 months to buy, so going in alone runs over budget."],
      ["conclusion", "A local partner fits the budget and the slow buying cycle best."],
    ]);
  });

  it("is deterministic and resets when the story loops", () => {
    const a = play((world) => world.time > 45).store.getState().workspace;
    const b = play((world) => world.time > 45).store.getState().workspace;
    expect(a).toEqual(b);
    const looped = play((world) => world.cycle === 1).store.getState().workspace;
    expect(looped.evidence).toHaveLength(0);
    expect(looped.objective).toBeNull();
  });
});
