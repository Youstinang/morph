import { describe, expect, it } from "vitest";
import { createEventBus } from "@/events/bus";
import { MAX_CHANGES } from "./changes";
import type { Workspace } from "./domain";
import { createUaeWorkspace } from "./fixtures/uae-market";
import { createOperationGate } from "./gate";
import { applyMorphOperation } from "./operations";
import { changeLines } from "./selectors";
import { createWorkspaceStore } from "./store";

const demo = { kind: "demo" } as const;
const tool = { kind: "tool", label: "Web search, summarized by AI: Fees", url: "https://www.example.com/fees", verified: false } as const;
let counter = 0;
const id = () => `chg-${++counter}`;

function chain(ws: Workspace, ...list: unknown[]): Workspace {
  return list.reduce<Workspace>((current, operation) => {
    const result = applyMorphOperation(current, operation);
    if (!result.ok) throw new Error(result.reason);
    return result.workspace;
  }, ws);
}

const station = (moduleId: string, title: string) => ({
  operation: "add_module",
  id: id(),
  source: demo,
  module: { id: moduleId, title, kind: "market", group: "research" },
  why: { reason: `We need ${title.toLowerCase()}.`, agentId: "nova" },
});
const finding = (evidenceId: string) => ({
  operation: "add_evidence",
  id: id(),
  source: demo,
  evidence: { id: evidenceId, statement: `Apps take a cut (${evidenceId}).`, kind: "fact", moduleId: null, foundBy: "orion", source: tool },
});

describe("Why did MORPH change?", () => {
  it("records what changed, the reason, who gave it, and when", () => {
    const ws = chain(createUaeWorkspace(), station("market", "Market demand"), finding("ev-1"), {
      operation: "emphasize_module",
      id: "emph",
      source: demo,
      moduleId: "market",
      why: { reason: "Demand decides the answer.", evidenceIds: ["ev-1"], agentId: "sage" },
    });
    expect(ws.changes.map((change) => change.change)).toEqual(['Opened the "Market demand" station', 'Gave "Market demand" more weight']);
    expect(ws.changes[1]).toMatchObject({ operationId: "emph", operation: "emphasize_module", why: { reason: "Demand decides the answer.", evidenceIds: ["ev-1"] }, by: demo });
  });

  it("refuses a reason that cites evidence or an assumption the record doesn't have", () => {
    const ws = chain(createUaeWorkspace(), station("market", "Market demand"));
    const emphasize = (why: object) => applyMorphOperation(ws, { operation: "emphasize_module", id: id(), source: demo, moduleId: "market", why });
    expect(emphasize({ reason: "Trust me.", evidenceIds: ["ev-made-up"] })).toMatchObject({ ok: false, reason: "the reason cites evidence ev-made-up, which does not exist" });
    expect(emphasize({ reason: "Trust me.", assumptionId: "as-nope" })).toMatchObject({ ok: false, reason: "the reason cites assumption as-nope, which does not exist" });
    expect(ws.changes).toHaveLength(1);
  });

  it("leaves out changes without a reason, minor ones, and a path's own text", () => {
    const ws = chain(
      createUaeWorkspace(),
      station("market", "Market demand"),
      { operation: "update_module", id: id(), source: demo, moduleId: "market", changes: { summary: { headline: "Busy", detail: "" } }, why: { reason: "New headline." } },
      { operation: "add_scenario", id: id(), source: demo, scenario: { id: "s1", label: "Go alone", assessment: 0.5 } },
      { operation: "update_scenario", id: id(), source: demo, scenarioId: "s1", assessment: 0.6, why: "It fits the budget." },
    );
    expect(ws.changes.map((change) => change.operation)).toEqual(["add_module"]);
  });

  it("keeps only the most recent changes", () => {
    let ws = createUaeWorkspace();
    for (let i = 0; i < MAX_CHANGES + 5; i += 1) ws = chain(ws, station(`m${i}`, `Station ${i}`));
    expect(ws.changes).toHaveLength(MAX_CHANGES);
    expect(ws.changes[0]!.change).toBe('Opened the "Station 5" station');
  });

  it("explains newest first, with the cited evidence and its site", () => {
    const ws = chain(createUaeWorkspace(), finding("ev-1"), station("market", "Market demand"), {
      operation: "update_recommendation",
      id: id(),
      source: { kind: "model", label: "Synthesizer", agentId: "lume" },
      recommendation: { status: "final", leaning: "Try one app", statement: "Try one app", reason: "Fees are known.", confidence: "low", evidenceIds: ["ev-1"] },
      why: { reason: "The team agreed.", evidenceIds: ["ev-1"] },
    });
    expect(changeLines(ws.changes, ws.evidence, ws.assumptions)).toEqual([
      { key: expect.any(String), change: 'Gave the answer: "Try one app"', reason: "The team agreed.", by: "Lume", basis: [{ text: "Apps take a cut (ev-1).", site: "example.com" }], assumption: null },
      { key: expect.any(String), change: 'Opened the "Market demand" station', reason: "We need market demand.", by: "Nova", basis: [], assumption: null },
    ]);
  });

  it("only passes a real reason on in the event, never a path's own text", () => {
    const bus = createEventBus({ clock: () => ({ at: 3, cycle: 0 }) });
    const store = createWorkspaceStore(chain(createUaeWorkspace(), { operation: "add_scenario", id: id(), source: demo, scenario: { id: "s1", label: "Go alone", assessment: 0.5 } }));
    const gate = createOperationGate(store, bus, () => 3);
    expect(gate.submit({ operation: "update_scenario", id: "upd", scenarioId: "s1", assessment: 0.7, why: "Fits the budget." }, { as: demo }).ok).toBe(true);
    const event = bus.history().find((item) => item.type === "scenario_updated");
    expect(event?.operation).toMatchObject({ id: "upd" });
    expect(event?.operation).not.toHaveProperty("why");
  });
});
