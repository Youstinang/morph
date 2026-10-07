import { describe, expect, it } from "vitest";
import { createEventBus } from "@/events/bus";
import { WorkspaceSchema } from "./domain";
import { createOperationGate } from "./gate";
import { SAMPLE_PLAN } from "./fixtures/sample-plan";
import { createLiveWorkspace, parsePlan, planToOperations, tidyPlan, type Plan } from "./plan";
import { createWorkspaceStore } from "./store";


describe("plan contract", () => {
  it("accepts a well-formed plan", () => {
    expect(parsePlan(SAMPLE_PLAN)).toEqual({ ok: true, plan: SAMPLE_PLAN });
  });

  it("tidies small slips instead of paying for a second model call", () => {
    const tidied = tidyPlan({
      ...SAMPLE_PLAN,
      tasks: [
        { agent: "orion", module: "Customer demand", task: "Checking who orders" },
        { agent: "orion", module: "costs", task: "a second task for Orion" },
        { agent: "sage", module: "nowhere", task: "lost task" },
      ],
      questions: [{ question: "a?" }, { question: "b?" }, { question: "c?" }],
    }) as Plan;
    expect(tidied.tasks).toEqual([{ agent: "orion", module: "demand", task: "checking who orders" }]);
    expect(tidied.questions).toHaveLength(2);
    expect(parsePlan(tidied).ok).toBe(true);
  });

  it("refuses plans the deck can't show, and says why", () => {
    const crowded = { ...SAMPLE_PLAN, modules: SAMPLE_PLAN.modules.map((mod, i) => ({ ...mod, key: `k${i}`, group: "decision" })).concat({ ...SAMPLE_PLAN.modules[0]!, key: "k9", group: "decision" }) };
    expect(parsePlan(crowded)).toMatchObject({ ok: false, issues: expect.stringMatching(/at most 3 decision stations/) });
    expect(parsePlan({ ...SAMPLE_PLAN, modules: [SAMPLE_PLAN.modules[0], SAMPLE_PLAN.modules[0]] })).toMatchObject({ ok: false, issues: expect.stringMatching(/used twice/) });
    expect(parsePlan({ ...SAMPLE_PLAN, modules: [{ ...SAMPLE_PLAN.modules[0]!, kind: "spaceship" }, SAMPLE_PLAN.modules[1]] }).ok).toBe(false);
    expect(parsePlan({ ...SAMPLE_PLAN, tasks: [{ agent: "nova", module: "demand", task: "x" }] }).ok).toBe(false);
    expect(parsePlan({ ...SAMPLE_PLAN, html: "<script>" }).ok).toBe(false);
    expect(parsePlan("plan everything").ok).toBe(false);
  });

  it("becomes ordinary operations that the gate accepts from the planner, with ids MORPH assigns", () => {
    const bus = createEventBus({ clock: () => ({ at: 1, cycle: 0 }) });
    const store = createWorkspaceStore(createLiveWorkspace("live"));
    const gate = createOperationGate(store, bus, () => 1);
    const ops = planToOperations(SAMPLE_PLAN, "live1");
    expect(ops.moduleIds).toEqual(["live1-m1", "live1-m2", "live1-m3"]);
    const as = { kind: "model", label: "Planner", agentId: "nova" } as const;
    const all = [...ops.modules, ...ops.assumptions, ...ops.questions, ...ops.assignments.map((a) => a.operation)];
    all.forEach((operation, i) => expect(gate.submit({ ...operation, id: `op-${i}` }, { as }).ok).toBe(true));
    const ws = store.getState().workspace;
    expect(ws.moduleOrder).toEqual(ops.moduleIds);
    expect(ws.modules["live1-m2"]).toMatchObject({ title: "App costs", kind: "economics", group: "analysis" });
    expect(ws.humanInputs[0]).toMatchObject({ status: "pending", askedBy: "nova" });
    expect(ws.agents.vex).toMatchObject({ state: "assigned", task: "testing what could go wrong" });
    expect(ws.evidence).toEqual([]);
    expect(bus.history().find((event) => event.type === "module_created")?.operation?.why?.reason).toBe(SAMPLE_PLAN.modules[0]!.why);
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true);
  });

  it("starts a live workspace empty, with the demo's team, in real mode", () => {
    const ws = createLiveWorkspace("live");
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true);
    expect(ws).toMatchObject({ mode: "real", objective: null, moduleOrder: [] });
    expect(ws.agentOrder).toEqual(["nova", "orion", "sage", "brix", "vex", "lume"]);
  });
});
