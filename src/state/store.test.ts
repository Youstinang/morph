import { describe, expect, it } from "vitest";
import { WorkspaceSchema, type NewEvidence } from "./domain";
import { createUaeWorkspace } from "./fixtures/uae-market";
import { findingLines, selectAgents, selectPendingInput } from "./selectors";
import { createWorkspaceStore } from "./store";

const source = { kind: "fixture", label: "Test fixture", verified: false } as const;
const evidence = (id: string, moduleId: string | null = null): NewEvidence => ({
  id,
  statement: `Statement ${id}`,
  kind: "fact",
  moduleId,
  foundBy: "orion",
  source,
});

function setup() {
  const store = createWorkspaceStore(createUaeWorkspace());
  return { store, s: () => store.getState() };
}

describe("workspace store", () => {
  it("starts from a valid seeded fixture", () => {
    const { s } = setup();
    expect(WorkspaceSchema.safeParse(s().workspace).success).toBe(true);
    expect(selectAgents(s().workspace).map((agent) => agent.name)).toEqual(["Nova", "Orion", "Sage", "Brix", "Vex", "Lume"]);
  });

  it("rejects a malformed seed or reset", () => {
    expect(() => createWorkspaceStore({ ...createUaeWorkspace(), mode: "live" } as never)).toThrow();
    const { s } = setup();
    expect(s().reset({ ...createUaeWorkspace(), time: -1 })).toBe(false);
  });

  it("updates agents immutably and keeps untouched records stable", () => {
    const { s } = setup();
    const before = s().workspace;
    expect(s().updateAgent("orion", { state: "working", task: "checking demand" })).toBe(true);
    const after = s().workspace;
    expect(after).not.toBe(before);
    expect(after.agents.orion).not.toBe(before.agents.orion);
    expect(after.agents.nova).toBe(before.agents.nova);
    expect(before.agents.orion!.state).toBe("idle");
  });

  it("rejects malformed or no-op agent updates and unknown agents", () => {
    const { s } = setup();
    const before = s().workspace;
    expect(s().updateAgent("orion", { state: "dancing" as never })).toBe(false);
    expect(s().updateAgent("orion", { progress: 2 })).toBe(false);
    expect(s().updateAgent("ghost", { state: "working" })).toBe(false);
    expect(s().updateAgent("orion", { state: "idle" })).toBe(false);
    expect(s().workspace).toBe(before);
  });

  it("tracks a task lifecycle per agent", () => {
    const { s } = setup();
    s().openModule({ id: "market", title: "Market demand", kind: "market", group: "research", emphasis: "normal", collapsed: false, size: 1 });
    s().setTime(5);
    expect(s().startTask("orion", "checking demand", "market")).toBe(true);
    s().setTime(8);
    expect(s().startTask("orion", "wrapping up", "market")).toBe(true);
    expect(s().finishTask("orion", "failed")).toBe(true);
    expect(s().finishTask("orion", "done")).toBe(false);
    expect(s().startTask("orion", "anything", "nowhere")).toBe(false);
    expect(s().workspace.tasks.map((task) => [task.id, task.status, task.endedAt])).toEqual([
      ["orion-task-1", "done", 8],
      ["orion-task-2", "failed", 8],
    ]);
  });

  it("reserves, opens, updates and removes modules", () => {
    const { s } = setup();
    const spec = { id: "risk", title: "Risks", kind: "risk", group: "analysis", emphasis: "normal", collapsed: false, size: 1 } as const;
    expect(s().openModule({ ...spec, reserved: true })).toBe(true);
    expect(s().workspace.modules.risk!.status).toBe("reserved");
    s().setTime(3);
    expect(s().openModule(spec)).toBe(true);
    expect(s().workspace.modules.risk).toMatchObject({ status: "open", openedAt: 3 });
    expect(s().openModule(spec)).toBe(false);
    expect(s().updateModule("risk", { size: 3 })).toBe(false);
    expect(s().updateModule("risk", { emphasis: "emphasized" })).toBe(true);
    expect(s().removeModule("risk")).toBe(true);
    expect(s().workspace.moduleOrder).toEqual([]);
  });

  it("keeps evidence provenance-bearing and refuses dangling references", () => {
    const { s } = setup();
    expect(s().addEvidence(evidence("a"))).toBe(true);
    expect(s().addEvidence(evidence("a"))).toBe(false);
    expect(s().addEvidence(evidence("b", "missing-module"))).toBe(false);
    expect(s().addEvidence({ ...evidence("c"), source: { kind: "model", label: "", verified: false } })).toBe(false);
    expect(s().supersedeEvidence("a", "missing")).toBe(false);
    expect(s().addEvidence(evidence("d"))).toBe(true);
    expect(s().supersedeEvidence("a", "d")).toBe(true);
    expect(s().workspace.evidence[0]).toMatchObject({ status: "superseded", supersededBy: "d" });
    expect(
      s().setRecommendation({ status: "final", leaning: "x", statement: "y", reason: "z", confidence: "moderate", evidenceIds: ["nope"] }),
    ).toBe(false);
  });

  it("moves assumptions through open, challenged and resolved only in order", () => {
    const { s } = setup();
    s().addEvidence(evidence("proof"));
    expect(s().raiseAssumption("fast", "Deals close fast.", "sage")).toBe(true);
    expect(s().resolveAssumption("fast", "rejected", "missing")).toBe(false);
    expect(s().challengeAssumption("fast", "vex", "No proof.")).toBe(true);
    expect(s().challengeAssumption("fast", "vex", "Again.")).toBe(false);
    expect(s().resolveAssumption("fast", "rejected", "proof")).toBe(true);
    expect(s().resolveAssumption("fast", "confirmed", null)).toBe(false);
  });

  it("handles a human-input request and answer once", () => {
    const { s } = setup();
    expect(s().requestHumanInput("budget", "How much?", "nova")).toBe(true);
    expect(selectPendingInput(s().workspace)?.id).toBe("budget");
    expect(s().answerHumanInput("budget", "")).toBe(false);
    expect(s().answerHumanInput("budget", "USD 1")).toBe(true);
    expect(s().answerHumanInput("budget", "USD 2")).toBe(false);
    expect(selectPendingInput(s().workspace)).toBeNull();
  });

  it("only accepts scenario assessments between 0 and 1 and skips unchanged updates", () => {
    const { s } = setup();
    expect(s().setScenarios([{ id: "a", label: "A", assessment: 1.4 }])).toBe(false);
    expect(s().setScenarios([{ id: "a", label: "A", assessment: 0.4 }])).toBe(true);
    const before = s().workspace;
    expect(s().setScenarios([{ id: "a", label: "A", assessment: 0.4 }])).toBe(false);
    expect(s().workspace).toBe(before);
  });
});

describe("finding lines", () => {
  it("lists live facts and doubts oldest first, without superseded or resolved ones", () => {
    const { s } = setup();
    s().setTime(1);
    s().addEvidence(evidence("old"));
    s().setTime(2);
    s().raiseAssumption("fast", "Deals close fast.", "sage");
    s().setTime(3);
    s().challengeAssumption("fast", "vex", "No proof.");
    s().setTime(3.5);
    s().addEvidence({ ...evidence("risk"), kind: "risk" });
    let ws = s().workspace;
    expect(findingLines(ws.evidence, ws.assumptions, ws.recommendation).map((line) => [line.kind, line.text])).toEqual([
      ["fact", "Statement old"],
      ["fact", "Deals close fast."],
      ["doubt", "No proof."],
      ["doubt", "Statement risk"],
    ]);
    s().setTime(4);
    s().addEvidence(evidence("new"));
    s().supersedeEvidence("old", "new");
    s().resolveAssumption("fast", "rejected", "new");
    ws = s().workspace;
    expect(findingLines(ws.evidence, ws.assumptions, ws.recommendation).map((line) => line.text)).toEqual([
      "Statement risk",
      "Statement new",
    ]);
  });
});
