import { describe, expect, it } from "vitest";
import { createEventBus } from "@/events/bus";
import { WorkspaceSchema, type Workspace } from "./domain";
import { createUaeWorkspace } from "./fixtures/uae-market";
import { createOperationGate } from "./gate";
import { OPERATION_TYPES, SIGNIFICANT, applyMorphOperation, type MorphOperation } from "./operations";
import { createWorkspaceStore } from "./store";

const demo = { kind: "demo" } as const;
const model = { kind: "model", label: "Planner model" } as const;
const why = { reason: "Test reason." };
let counter = 0;
const id = () => `op-${++counter}`;
const fixture = { kind: "fixture", label: "Fixture", verified: false } as const;

const ops = {
  objective: (): MorphOperation => ({ operation: "set_objective", id: id(), source: demo, objectiveId: "q", text: "Enter the UAE?" }),
  module: (moduleId = "market", extra: Partial<{ reserve: boolean }> = {}): MorphOperation => ({
    operation: "add_module",
    id: id(),
    source: demo,
    module: { id: moduleId, title: "Market demand", kind: "market", group: "research" },
    why,
    ...extra,
  }),
  evidence: (evidenceId = "ev-1", moduleId: string | null = null): MorphOperation => ({
    operation: "add_evidence",
    id: id(),
    source: demo,
    evidence: { id: evidenceId, statement: `Statement ${evidenceId}`, kind: "fact", moduleId, foundBy: "orion", source: fixture },
  }),
};

/** Applies operations in order, failing the test if one is refused. */
function chain(ws: Workspace, ...list: unknown[]): Workspace {
  return list.reduce<Workspace>((current, operation) => {
    const result = applyMorphOperation(current, operation);
    if (!result.ok) throw new Error(result.reason);
    return result.workspace;
  }, ws);
}

function refusal(ws: Workspace, operation: unknown): string {
  const result = applyMorphOperation(ws, operation);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.reason;
}

describe("applyMorphOperation", () => {
  it("covers the specification's operations", () => {
    for (const type of [
      "add_module", "remove_module", "update_module", "move_module", "resize_module", "emphasize_module", "deemphasize_module",
      "add_evidence", "remove_evidence", "add_assumption", "update_assumption", "challenge_assumption", "add_scenario",
      "update_scenario", "update_recommendation", "request_human_input", "assign_agent", "focus_camera",
    ]) {
      expect(OPERATION_TYPES).toContain(type);
    }
  });

  it("applies a valid operation deterministically and leaves the input untouched", () => {
    const ws = createUaeWorkspace();
    const operation = ops.module();
    const a = applyMorphOperation(ws, operation);
    const b = applyMorphOperation(ws, operation);
    expect(a).toEqual(b);
    expect(ws.moduleOrder).toEqual([]);
    expect(a.ok && a.workspace.modules.market).toMatchObject({ status: "open", summary: null });
    expect(a.ok && WorkspaceSchema.safeParse(a.workspace).success).toBe(true);
  });

  it("refuses the same operation twice", () => {
    const operation = ops.module();
    const ws = chain(createUaeWorkspace(), operation);
    expect(refusal(ws, operation)).toMatch(/already applied/);
  });

  it("refuses malformed, unknown and non-data input without throwing", () => {
    const ws = createUaeWorkspace();
    const circular: Record<string, unknown> = { operation: "add_module" };
    circular.self = circular;
    expect(refusal(ws, null)).toMatch(/malformed/);
    expect(refusal(ws, "add a module please")).toMatch(/malformed/);
    expect(refusal(ws, [ops.module()])).toMatch(/malformed/);
    expect(refusal(ws, { operation: "run_code", id: "x", source: demo, code: "fetch('/steal')" })).toBe('unknown operation "run_code"');
    expect(refusal(ws, { operation: "add_module", id: "x", source: demo })).toMatch(/malformed operation at module/);
    expect(refusal(ws, circular)).toBe("the operation is not plain data");
    expect(refusal(ws, { ...ops.module(), module: { id: "m", title: "x".repeat(20_000), kind: "k", group: "research" } })).toBe("the operation is too large");
  });

  it("refuses extra fields, so markup or code can't ride along", () => {
    const ws = createUaeWorkspace();
    expect(refusal(ws, { ...ops.module(), render: "<script>alert(1)</script>" })).toMatch(/malformed/);
    expect(refusal(ws, { ...ops.module(), module: { id: "m", title: "T", kind: "k", group: "research", component: "() => evil()" } })).toMatch(/malformed/);
    expect(refusal(ws, { ...ops.module("bad id <img>") })).toMatch(/ids may only use/);
  });

  it("keeps markup in text as plain text, never as structure", () => {
    const ws = chain(createUaeWorkspace(), { ...ops.module(), module: { id: "m", title: "<b>Bold</b>", kind: "k", group: "research" } });
    expect(ws.modules.m!.title).toBe("<b>Bold</b>");
  });

  it("requires a reason for significant changes", () => {
    const ws = chain(createUaeWorkspace(), ops.module());
    const unexplained: Record<string, unknown> = { ...ops.module("risk") };
    delete unexplained.why;
    expect(refusal(ws, unexplained)).toBe("add_module must say why");
    expect(refusal(ws, { operation: "remove_module", id: id(), source: demo, moduleId: "market" })).toBe("remove_module must say why");
    expect(SIGNIFICANT.has("update_recommendation")).toBe(true);
  });

  it("refuses references to things that don't exist", () => {
    const ws = createUaeWorkspace();
    expect(refusal(ws, ops.evidence("ev-1", "nowhere"))).toBe("module nowhere does not exist");
    expect(refusal(ws, { operation: "resize_module", id: id(), source: demo, moduleId: "ghost", size: 1 })).toBe("module ghost does not exist");
    expect(refusal(ws, { operation: "challenge_assumption", id: id(), source: demo, assumptionId: "a", by: "vex", note: "?" })).toBe("assumption a does not exist");
    expect(refusal(ws, { operation: "assign_agent", id: id(), source: demo, agentId: "ghost", task: "t", moduleId: null })).toBe("agent ghost does not exist");
    expect(refusal(ws, { operation: "focus_camera", id: id(), source: demo, target: { kind: "module", moduleId: "ghost" } })).toBe("module ghost does not exist");
  });

  it("keeps AI proposals from posing as verified evidence or as the user", () => {
    const ws = chain(createUaeWorkspace(), {
      operation: "request_human_input",
      id: id(),
      source: demo,
      requestId: "budget",
      question: "Budget?",
      askedBy: "nova",
    });
    const claim = ops.evidence("ev-claim") as Extract<MorphOperation, { operation: "add_evidence" }>;
    expect(refusal(ws, { ...claim, source: model, evidence: { ...claim.evidence, source: { kind: "model", label: "LLM", verified: true } } })).toMatch(/verified/);
    expect(refusal(ws, { ...claim, source: model, evidence: { ...claim.evidence, source: { kind: "user", label: "You", verified: true } } })).toMatch(/only the user/);
    expect(refusal(ws, { operation: "answer_human_input", id: id(), source: model, requestId: "budget", value: "USD 9" })).toMatch(/only the user/);
    expect(refusal(ws, { operation: "skip_human_input", id: id(), source: model, requestId: "budget" })).toMatch(/only the user/);
    expect(refusal(ws, { operation: "set_objective", id: id(), source: model, objectiveId: "q", text: "Something else" })).toMatch(/only the user/);
    expect(applyMorphOperation(ws, { operation: "answer_human_input", id: id(), source: { kind: "user" }, requestId: "budget", value: "USD 9" }).ok).toBe(true);
  });

  it("moves modules, resizes them and steps emphasis up and down", () => {
    let ws = chain(createUaeWorkspace(), ops.module());
    ws = chain(
      ws,
      { operation: "move_module", id: id(), source: demo, moduleId: "market", group: "decision", why },
      { operation: "resize_module", id: id(), source: demo, moduleId: "market", size: 1.1 },
      { operation: "emphasize_module", id: id(), source: demo, moduleId: "market", why },
    );
    expect(ws.modules.market).toMatchObject({ group: "decision", size: 1.1, emphasis: "emphasized" });
    ws = chain(ws, { operation: "deemphasize_module", id: id(), source: demo, moduleId: "market", why });
    expect(ws.modules.market!.emphasis).toBe("normal");
    ws = chain(ws, { operation: "deemphasize_module", id: id(), source: demo, moduleId: "market", why });
    expect(ws.modules.market!.emphasis).toBe("muted");
    expect(refusal(ws, { operation: "resize_module", id: id(), source: demo, moduleId: "market", size: 3 })).toMatch(/malformed/);
  });

  it("reserves a module, then opens it, and updates its summary", () => {
    let ws = chain(createUaeWorkspace(), ops.module("risk", { reserve: true }));
    expect(ws.modules.risk!.status).toBe("reserved");
    ws = chain(ws, ops.module("risk"), {
      operation: "update_module",
      id: id(),
      source: demo,
      moduleId: "risk",
      changes: { summary: { headline: "Slow sales", detail: "Cash runs out" } },
    });
    expect(ws.modules.risk).toMatchObject({ status: "open", summary: { headline: "Slow sales" } });
    expect(refusal(ws, ops.module("risk"))).toBe("module risk already exists");
  });

  it("replaces a module in its slot and hands its evidence over", () => {
    const targets = (extra: Record<string, unknown> = {}) => ({
      ...ops.module("targets"),
      module: { id: "targets", title: "Targets", kind: "targets", group: "research" },
      replaces: "market",
      ...extra,
    });
    const ws = chain(createUaeWorkspace(), ops.module("market"), ops.module("risk"), ops.evidence("ev-m", "market"));
    const next = chain(ws, targets());
    expect(next.moduleOrder).toEqual(["targets", "risk"]);
    expect(next.modules.market).toBeUndefined();
    expect(next.evidence.find((item) => item.id === "ev-m")!.moduleId).toBe("targets");
    expect(refusal(ws, targets({ reserve: true }))).toBe("a reserved module can't replace another");
    expect(refusal(ws, targets({ replaces: "ghost" }))).toBe("module ghost does not exist");
    expect(refusal(ws, { ...ops.module("market"), replaces: "market" })).toBe("a module can't replace itself");
    expect(refusal(ws, { ...ops.module("risk"), replaces: "market" })).toBe("module risk already exists");
  });

  it("follows the assumption lifecycle and evidence rules", () => {
    let ws = chain(
      createUaeWorkspace(),
      ops.evidence("proof"),
      { operation: "add_assumption", id: id(), source: demo, assumptionId: "fast", statement: "Deals close fast.", raisedBy: "sage" },
    );
    expect(refusal(ws, { operation: "update_assumption", id: id(), source: demo, assumptionId: "fast", status: "rejected", evidenceId: "missing" })).toMatch(/missing does not exist/);
    ws = chain(
      ws,
      { operation: "challenge_assumption", id: id(), source: demo, assumptionId: "fast", by: "vex", note: "No proof." },
      { operation: "update_assumption", id: id(), source: demo, assumptionId: "fast", status: "rejected", evidenceId: "proof" },
    );
    expect(ws.assumptions[0]!.status).toBe("rejected");
    expect(refusal(ws, { operation: "remove_evidence", id: id(), source: demo, evidenceId: "proof", why })).toMatch(/resolved an assumption/);
    ws = chain(ws, ops.evidence("old"), ops.evidence("new"), { operation: "remove_evidence", id: id(), source: demo, evidenceId: "old", supersededBy: "new", why });
    expect(ws.evidence.find((item) => item.id === "old")).toMatchObject({ status: "superseded", supersededBy: "new" });
  });

  it("only lets a recommendation cite accepted evidence, and a final one must be complete", () => {
    const ws = chain(createUaeWorkspace(), ops.evidence("a"), ops.evidence("b"), { operation: "remove_evidence", id: id(), source: demo, evidenceId: "a", supersededBy: "b", why });
    const recommendation = { status: "final", leaning: "L", statement: "S", reason: "R", confidence: "moderate", evidenceIds: ["a"] } as const;
    expect(refusal(ws, { operation: "update_recommendation", id: id(), source: demo, recommendation, why })).toMatch(/not accepted evidence/);
    expect(refusal(ws, { operation: "update_recommendation", id: id(), source: demo, recommendation: { ...recommendation, evidenceIds: ["b"], reason: null }, why })).toMatch(/needs a statement and a reason/);
    expect(applyMorphOperation(ws, { operation: "update_recommendation", id: id(), source: demo, recommendation: { ...recommendation, evidenceIds: ["b"] }, why }).ok).toBe(true);
  });

  it("keeps scenario assessments between 0 and 1", () => {
    const ws = chain(createUaeWorkspace(), { operation: "add_scenario", id: id(), source: demo, scenario: { id: "a", label: "A", assessment: 0.4 } });
    expect(refusal(ws, { operation: "update_scenario", id: id(), source: demo, scenarioId: "a", assessment: 1.4 })).toMatch(/malformed/);
    expect(refusal(ws, { operation: "update_scenario", id: id(), source: demo, scenarioId: "a", assessment: 0.4 })).toBe("nothing changed");
    expect(chain(ws, { operation: "update_scenario", id: id(), source: demo, scenarioId: "a", assessment: 0.7 }).scenarios[0]!.assessment).toBe(0.7);
  });

  it("assigns a task and records a camera focus suggestion", () => {
    const ws = chain(
      createUaeWorkspace(),
      ops.module(),
      { operation: "assign_agent", id: id(), source: model, agentId: "orion", task: "check demand", moduleId: "market" },
      { operation: "focus_camera", id: id(), source: model, target: { kind: "module", moduleId: "market" } },
    );
    expect(ws.agents.orion).toMatchObject({ state: "assigned", task: "check demand", moduleId: "market" });
    expect(ws.tasks.at(-1)).toMatchObject({ agentId: "orion", title: "check demand", status: "active" });
    expect(ws.focus).toEqual({ kind: "module", moduleId: "market" });
  });

  it("never corrupts the workspace under a stream of random proposals", () => {
    let ws = chain(createUaeWorkspace(), ops.module(), ops.evidence("ev-a", "market"));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
    const values = [null, "", "market", "ghost", 0.5, 2, -1, true, [], {}, "x".repeat(700), { kind: "home" }];
    for (let i = 0; i < 2000; i += 1) {
      const proposal: Record<string, unknown> = { operation: pick(OPERATION_TYPES), id: `r-${i}`, source: pick([demo, model, { kind: "user" }]) };
      for (const key of ["moduleId", "evidenceId", "assumptionId", "agentId", "size", "group", "why", "module", "evidence", "target", "status", "text"]) {
        if (rand() < 0.4) proposal[key] = key === "why" ? why : pick(values);
      }
      const result = applyMorphOperation(ws, proposal);
      if (result.ok) ws = result.workspace;
      expect(WorkspaceSchema.safeParse(ws).success).toBe(true);
    }
  });
});

describe("operation gate", () => {
  function setup() {
    const bus = createEventBus({ clock: () => ({ at: 3, cycle: 0 }) });
    const store = createWorkspaceStore(createUaeWorkspace());
    const gate = createOperationGate(store, bus, () => 3);
    return { bus, store, gate };
  }

  it("announces an accepted operation as a record event carrying the operation and its reason", () => {
    const { bus, gate } = setup();
    expect(gate.submit(ops.module(), { as: { kind: "demo", agentId: "nova" }, summary: "Nova opened a station." }).ok).toBe(true);
    expect(bus.history().at(-1)).toMatchObject({
      type: "module_created",
      source: "demo",
      at: 3,
      summary: "Nova opened a station.",
      operation: { type: "add_module", source: { kind: "demo", agentId: "nova" }, why: { reason: "Test reason." } },
    });
  });

  it("announces a replacement as a module created in place of the old one", () => {
    const { bus, gate } = setup();
    gate.submit(ops.module("market"), { as: demo });
    gate.submit({ ...ops.module("targets"), replaces: "market" }, { as: demo });
    expect(bus.history().at(-1)).toMatchObject({ type: "module_created", module: { id: "targets" }, replaces: "market" });
  });

  it("announces a refusal with its reason and changes nothing", () => {
    const { bus, store, gate } = setup();
    const before = store.getState().workspace;
    const result = gate.submit({ operation: "remove_module", id: "rm-1", moduleId: "ghost", why }, { as: model });
    expect(result.ok).toBe(false);
    expect(store.getState().workspace.modules).toBe(before.modules);
    expect(bus.history().at(-1)).toMatchObject({ type: "operation_rejected", operationId: "rm-1", reason: "module ghost does not exist", source: "orchestrator" });
  });

  it("stamps the trusted channel's source over whatever the proposal claims", () => {
    const { gate, store } = setup();
    gate.submit({ operation: "request_human_input", id: "q", requestId: "budget", question: "Budget?", askedBy: "nova" }, { as: demo });
    const forged = gate.submit({ operation: "answer_human_input", id: "a", source: { kind: "user" }, requestId: "budget", answer: "USD 1" }, { as: model });
    expect(forged.ok).toBe(false);
    expect(store.getState().workspace.humanInputs[0]!.status).toBe("pending");
  });

  it("refuses record events published without an operation, so only the gate can report changes", () => {
    const { bus } = setup();
    expect(bus.publish({ type: "module_removed", moduleId: "market" }, "demo")).toBeNull();
    expect(bus.publish({ type: "planning_started", agentId: "nova", operation: { id: "x", type: "add_module", source: demo } }, "demo")).toBeNull();
  });
});
