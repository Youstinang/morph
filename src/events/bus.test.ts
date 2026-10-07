import { describe, expect, it } from "vitest";
import { createEventBus } from "./bus";
import { EVENT_TYPES, parseEvent, type WorkspaceEvent } from "./schema";

function setup() {
  const clock = { at: 0, cycle: 0 };
  const errors: unknown[] = [];
  const bus = createEventBus({ clock: () => clock, historyLimit: 5, onListenerError: (error) => errors.push(error) });
  return { bus, clock, errors };
}

describe("event bus", () => {
  it("stamps events with an increasing sequence, the run clock and the source", () => {
    const { bus, clock } = setup();
    clock.at = 1.5;
    const first = bus.publish({ type: "planning_started", agentId: "nova" }, "demo");
    clock.at = 2;
    const second = bus.publish({ type: "agent_arrived", agentId: "nova", target: { kind: "core" } }, "world");
    expect(first).toMatchObject({ seq: 1, at: 1.5, cycle: 0, source: "demo" });
    expect(second).toMatchObject({ seq: 2, at: 2, source: "world" });
  });

  it("rejects malformed or unknown drafts without delivering or recording them", () => {
    const { bus } = setup();
    const seen: WorkspaceEvent[] = [];
    bus.subscribe((event) => seen.push(event));
    expect(bus.publish({ type: "agent_teleported", agentId: "nova" } as never, "demo")).toBeNull();
    expect(bus.publish({ type: "planning_started" } as never, "demo")).toBeNull();
    expect(bus.publish({ type: "scenario_updated", scenarios: [{ id: "a", label: "A", assessment: 1.7 }] }, "demo")).toBeNull();
    expect(bus.publish({ type: "planning_started", agentId: "nova", summary: "" }, "demo")).toBeNull();
    expect(seen).toHaveLength(0);
    expect(bus.history()).toHaveLength(0);
    expect(bus.stats()).toMatchObject({ published: 0, rejected: 4 });
  });

  it("strips fields that are not part of the event contract", () => {
    const { bus } = setup();
    const event = bus.publish({ type: "planning_started", agentId: "nova", html: "<script>" } as never, "demo")!;
    expect(event).not.toHaveProperty("html");
  });

  it("delivers to all subscribers and filters by type", () => {
    const { bus } = setup();
    const all: string[] = [];
    const arrivals: string[] = [];
    bus.subscribe((event) => all.push(event.type));
    const off = bus.on("agent_arrived", (event) => arrivals.push(event.agentId));
    bus.publish({ type: "planning_started", agentId: "nova" }, "demo");
    bus.publish({ type: "agent_arrived", agentId: "orion", target: { kind: "home" } }, "world");
    off();
    bus.publish({ type: "agent_arrived", agentId: "sage", target: { kind: "home" } }, "world");
    expect(all).toEqual(["planning_started", "agent_arrived", "agent_arrived"]);
    expect(arrivals).toEqual(["orion"]);
  });

  it("delivers events published by listeners after the current one, in one global order", () => {
    const { bus } = setup();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((event) => {
      a.push(event.seq);
      if (event.type === "agent_assigned") bus.publish({ type: "agent_move_started", agentId: event.agentId, target: event.target, travel: event.travel }, "world");
    });
    bus.subscribe((event) => b.push(event.seq));
    bus.publish({ type: "agent_assigned", agentId: "nova", target: { kind: "core" }, task: "reading", travel: "moving" }, "demo");
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
  });

  it("isolates a failing listener from the others", () => {
    const { bus, errors } = setup();
    const seen: number[] = [];
    bus.subscribe(() => {
      throw new Error("broken listener");
    });
    bus.subscribe((event) => seen.push(event.seq));
    bus.publish({ type: "planning_started", agentId: "nova" }, "demo");
    expect(seen).toEqual([1]);
    expect(errors).toHaveLength(1);
    expect(bus.stats().listenerErrors).toBe(1);
  });

  it("keeps a bounded history for replay", () => {
    const { bus } = setup();
    for (let i = 0; i < 8; i += 1) bus.publish({ type: "planning_started", agentId: "nova" }, "demo");
    expect(bus.history().map((event) => event.seq)).toEqual([4, 5, 6, 7, 8]);
  });

  it("round-trips recorded events through validation", () => {
    const { bus } = setup();
    const event = bus.publish({ type: "evidence_discovered", evidence: { id: "e", statement: "S", kind: "fact", moduleId: null, foundBy: "orion", source: { kind: "fixture", label: "F", verified: false } }, summary: "Found it." }, "demo")!;
    expect(parseEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
    expect(parseEvent({ ...event, seq: 0 })).toBeNull();
  });

  it("covers the event catalog from the specification", () => {
    for (const type of [
      "objective_received", "planning_started", "plan_created", "agent_assigned", "agent_move_started", "agent_arrived",
      "agent_work_started", "tool_started", "tool_completed", "evidence_discovered", "artifact_handoff_started",
      "artifact_handoff_completed", "assumption_created", "assumption_challenged", "retry_requested", "retry_started",
      "agent_collaboration_started", "module_created", "module_emphasized", "module_removed", "workspace_morph_started",
      "workspace_morph_completed", "human_input_requested", "human_input_received", "scenario_created", "scenario_updated",
      "recommendation_updated", "synthesis_started", "synthesis_completed", "task_failed",
    ]) {
      expect(EVENT_TYPES).toContain(type);
    }
  });
});
