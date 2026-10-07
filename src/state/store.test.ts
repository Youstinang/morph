import { describe, expect, it } from "vitest";
import { WorkspaceSchema } from "./domain";
import { createUaeWorkspace } from "./fixtures/uae-market";
import type { MorphOperation } from "./operations";
import { findingLines, selectAgents, selectPendingInput } from "./selectors";
import { createWorkspaceStore } from "./store";

const demo = { kind: "demo" } as const;
const source = { kind: "fixture", label: "Test fixture", verified: false } as const;
let n = 0;
const evidence = (id: string, kind: "fact" | "risk" = "fact"): MorphOperation => ({
  operation: "add_evidence",
  id: `op-${++n}`,
  source: demo,
  evidence: { id, statement: `Statement ${id}`, kind, moduleId: null, foundBy: "orion", source },
});
const op = (operation: Record<string, unknown>) => ({ id: `op-${++n}`, source: demo, ...operation });

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
    s().apply(op({ operation: "add_module", module: { id: "market", title: "Market demand", kind: "market", group: "research" }, why: { reason: "r" } }));
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

  it("changes the record only through operations, and a refused one changes nothing", () => {
    const { s } = setup();
    const before = s().workspace;
    const refused = s().apply(op({ operation: "remove_module", moduleId: "ghost", why: { reason: "r" } }));
    expect(refused).toMatchObject({ ok: false, reason: "module ghost does not exist" });
    expect(s().workspace).toBe(before);
    expect(s().apply(evidence("a")).ok).toBe(true);
    expect(s().workspace.agents).toBe(before.agents);
  });

  it("handles a human-input request and answer once", () => {
    const { s } = setup();
    expect(s().apply(op({ operation: "request_human_input", requestId: "budget", question: "How much?", askedBy: "nova" })).ok).toBe(true);
    expect(selectPendingInput(s().workspace)?.id).toBe("budget");
    expect(s().apply(op({ operation: "answer_human_input", requestId: "budget", value: "USD 1", source: { kind: "user" } })).ok).toBe(true);
    expect(s().apply(op({ operation: "answer_human_input", requestId: "budget", value: "USD 2", source: { kind: "user" } })).ok).toBe(false);
    expect(selectPendingInput(s().workspace)).toBeNull();
  });

  it("checks every answer against the question's control", () => {
    const { s } = setup();
    const user = { kind: "user" } as const;
    const ask = (requestId: string, control: unknown) => s().apply(op({ operation: "request_human_input", requestId, question: "Q?", askedBy: "nova", control }));
    const answer = (requestId: string, value: unknown) => s().apply(op({ operation: "answer_human_input", requestId, value, source: user }));
    expect(ask("bad", { type: "slider", min: 5, max: 1 }).ok).toBe(false);
    expect(ask("bad", { type: "single_choice", options: ["Only one"] }).ok).toBe(false);
    expect(ask("bad", { type: "script", code: "alert(1)" }).ok).toBe(false);
    expect(ask("money", { type: "currency", min: 0, max: 1000, currency: "EUR" }).ok).toBe(true);
    expect(answer("money", 5000).ok).toBe(false);
    expect(answer("money", "500").ok).toBe(false);
    expect(answer("money", 500).ok).toBe(true);
    expect(s().workspace.humanInputs.find((item) => item.id === "money")).toMatchObject({ answer: "EUR 500", value: 500 });
    expect(ask("budget", { type: "slider", min: 250000, max: 1000000, currency: "USD", stops: [250000, 500000, 1000000] }).ok).toBe(true);
    expect(answer("budget", 400000).ok).toBe(false);
    expect(answer("budget", 1000000).ok).toBe(true);
    expect(s().workspace.humanInputs.find((item) => item.id === "budget")?.answer).toBe("USD 1,000,000");
    expect(ask("which", { type: "multi_choice", options: ["Talabat", "Careem", "Deliveroo"] }).ok).toBe(true);
    expect(answer("which", ["Uber"]).ok).toBe(false);
    expect(answer("which", ["Deliveroo", "Talabat"]).ok).toBe(true);
    expect(s().workspace.humanInputs.find((item) => item.id === "which")?.answer).toBe("Talabat, Deliveroo");
    expect(ask("ok", { type: "confirmation" }).ok).toBe(true);
    expect(answer("ok", "yes").ok).toBe(false);
    expect(answer("ok", true).ok).toBe(true);
    expect(ask("later", { type: "percentage", min: 0, max: 100 }).ok).toBe(true);
    expect(s().apply(op({ operation: "skip_human_input", requestId: "later", source: user })).ok).toBe(true);
    expect(answer("later", 10).ok).toBe(false);
    expect(s().workspace.humanInputs.find((item) => item.id === "later")?.status).toBe("skipped");
  });
});

describe("finding lines", () => {
  it("lists live facts and doubts oldest first, without superseded or resolved ones", () => {
    const { s } = setup();
    s().setTime(1);
    s().apply(evidence("old"));
    s().setTime(2);
    s().apply(op({ operation: "add_assumption", assumptionId: "fast", statement: "Deals close fast.", raisedBy: "sage" }));
    s().setTime(3);
    s().apply(op({ operation: "challenge_assumption", assumptionId: "fast", by: "vex", note: "No proof." }));
    s().setTime(3.5);
    s().apply(evidence("risk", "risk"));
    let ws = s().workspace;
    expect(findingLines(ws.evidence, ws.assumptions, ws.recommendation).map((line) => [line.kind, line.text])).toEqual([
      ["fact", "Statement old"],
      ["fact", "Deals close fast."],
      ["doubt", "No proof."],
      ["doubt", "Statement risk"],
    ]);
    s().setTime(4);
    s().apply(evidence("new"));
    s().apply(op({ operation: "remove_evidence", evidenceId: "old", supersededBy: "new", why: { reason: "r" } }));
    s().apply(op({ operation: "update_assumption", assumptionId: "fast", status: "rejected", evidenceId: "new" }));
    ws = s().workspace;
    expect(findingLines(ws.evidence, ws.assumptions, ws.recommendation).map((line) => line.text)).toEqual(["Statement risk", "Statement new"]);
  });
});
