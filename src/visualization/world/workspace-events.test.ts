import { describe, expect, it } from "vitest";
import { applyWorkspaceEvent, connectWorkspace } from "@/state/apply-event";
import { WorkspaceSchema } from "@/state/domain";
import { DEMO_AGENTS, UAE_TIMELINE, createUaeWorkspace } from "@/state/fixtures/uae-market";
import { findingLines } from "@/state/selectors";
import { createWorkspaceStore } from "@/state/store";
import { AGENTS, AGENT_ORDER } from "./sim/roster";
import { createDemoSession, type DemoSession } from "./sim/session";
import { takeSnapshot } from "./snapshot";

const DT = 1 / 60;

function play(until: (session: DemoSession) => boolean) {
  const session = createDemoSession();
  const store = createWorkspaceStore(createUaeWorkspace());
  connectWorkspace(session.bus, store, createUaeWorkspace);
  for (let i = 0; i < 120 / DT && !until(session); i += 1) session.step(DT);
  return { session, store, ws: () => store.getState().workspace };
}
const reached = (signal: string) => (session: DemoSession) => session.runner.signals.has(signal);

describe("demo fixture", () => {
  it("names the same agents the world renders", () => {
    expect(DEMO_AGENTS.map((agent) => agent.id)).toEqual([...AGENT_ORDER]);
    for (const agent of DEMO_AGENTS) expect(agent.name).toBe(AGENTS[agent.id as keyof typeof AGENTS].name);
  });

  it("never marks fixture facts as verified", () => {
    for (const beat of Object.values(UAE_TIMELINE)) {
      for (const draft of beat.events) {
        if (draft.type === "evidence_discovered" && draft.evidence.source.kind !== "user") expect(draft.evidence.source.verified).toBe(false);
      }
    }
  });
});

describe("workspace store fed by events", () => {
  it("applies every event of a full run without corrupting the workspace", () => {
    const { session, ws } = play((s) => s.runner.endedAt !== null);
    expect(session.bus.stats()).toMatchObject({ rejected: 0, listenerErrors: 0 });
    expect(WorkspaceSchema.safeParse(ws()).success).toBe(true);
  });

  it("ends with the answer, every module, and per-agent task history", () => {
    const seenModules = new Set<string>();
    const { store, ws } = play(reached("recommendation"));
    store.getState().workspace.moduleOrder.forEach((id) => seenModules.add(id));
    expect(ws().objective).toMatchObject({ status: "answered" });
    expect(ws().recommendation).toMatchObject({ status: "final", statement: "Start with a local partner" });
    expect([...seenModules].sort()).toEqual(["competition", "economics", "market", "possibility", "regulation", "risk"]);
    expect(ws().humanInputs).toEqual([expect.objectContaining({ id: "budget", status: "answered", answer: "USD 500,000" })]);
    expect(ws().assumptions[0]).toMatchObject({ status: "rejected", resolvedBy: "ev-sales-cycle" });
    expect(ws().tasks.some((task) => task.agentId === "orion" && task.status === "failed")).toBe(true);
    for (const id of AGENT_ORDER) expect(ws().tasks.some((task) => task.agentId === id)).toBe(true);
    const partnership = ws().scenarios.find((scenario) => scenario.id === "partnership")!;
    expect(ws().scenarios.every((scenario) => scenario.assessment <= partnership.assessment)).toBe(true);
  });

  it("shows the same findings the approved HUD showed, in the same order", () => {
    const lines = (signal: string) => {
      const ws = play(reached(signal)).ws();
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

  it("matches the world: every agent's state in the store is the state the world acts out", () => {
    const session = createDemoSession();
    const store = createWorkspaceStore(createUaeWorkspace());
    connectWorkspace(session.bus, store, createUaeWorkspace);
    for (let i = 0; i < 60 / DT; i += 1) {
      session.step(DT);
      for (const id of AGENT_ORDER) expect(store.getState().workspace.agents[id]!.state).toBe(session.world.agents[id].state);
    }
  });

  it("is deterministic and resets when the story loops", () => {
    const a = play((s) => s.world.time > 45).ws();
    const b = play((s) => s.world.time > 45).ws();
    expect(a).toEqual(b);
    const looped = play((s) => s.world.cycle === 1).ws();
    expect(looped.evidence).toHaveLength(0);
    expect(looped.objective).toBeNull();
  });

  it("refuses events that reference things that don't exist", () => {
    const store = createWorkspaceStore(createUaeWorkspace());
    const base = { seq: 1, at: 1, cycle: 0, source: "demo" as const };
    expect(applyWorkspaceEvent(store, { ...base, type: "assumption_challenged", assumptionId: "nope", by: "vex", note: "x" }, createUaeWorkspace)).toBe(false);
    expect(applyWorkspaceEvent(store, { ...base, type: "agent_idle", agentId: "ghost", task: "x" }, createUaeWorkspace)).toBe(false);
    expect(applyWorkspaceEvent(store, { ...base, type: "human_input_received", requestId: "budget", answer: "1", answeredBy: "user" }, createUaeWorkspace)).toBe(false);
  });
});

describe("steps list", () => {
  it("narrates from the event history of the current run only", () => {
    const { session } = play(reached("budget"));
    const snapshot = takeSnapshot(session.world, session.bus.history());
    expect(snapshot.caption).toMatchObject({ agent: "user", text: "You set the launch budget: USD 500,000." });
    expect(snapshot.log.map((line) => line.text)).toContain("Nova needs one answer from you: the launch budget.");
    expect(snapshot.log.length).toBeLessThanOrEqual(8);
    const looped = play((s) => s.world.cycle === 1).session;
    expect(takeSnapshot(looped.world, looped.bus.history()).log).toEqual([]);
  });
});
