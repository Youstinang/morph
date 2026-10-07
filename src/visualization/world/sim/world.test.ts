import { describe, expect, it } from "vitest";
import type { EventDraft, WorkspaceEvent } from "@/events/schema";
import { CORE_RADIUS } from "./roster";
import { moduleSpot } from "./modules";
import { coreState, createWorld, planRoute, reactToEvent, stepWorld } from "./world";

const DT = 1 / 60;

describe("event-driven world", () => {
  it("routes walks around the Intent Core", () => {
    const route = planRoute([-6, 3], [6, -3]);
    expect(route).toHaveLength(2);
    const [wx, wz] = route[0]!;
    expect(Math.hypot(wx, wz)).toBeGreaterThan(CORE_RADIUS);
    expect(planRoute([-6, 3], [-10, -1.5])).toHaveLength(1);
  });


  it("acts out whatever events it is given, without the story runner", () => {
    const world = createWorld();
    const reports: string[] = [];
    let seq = 0;
    const feed = (draft: EventDraft) =>
      reactToEvent(world, { ...draft, seq: ++seq, at: 0, cycle: 0, source: "demo" } as WorkspaceEvent, (r) => reports.push(r.type));
    feed({ type: "module_created", module: { id: "valuation", title: "Valuation", kind: "valuation", group: "analysis" } });
    feed({ type: "module_updated", moduleId: "valuation", changes: { summary: { headline: "Fair price found", detail: "Within range" } } });
    feed({ type: "agent_assigned", agentId: "sage", target: { kind: "module", moduleId: "valuation" }, task: "pricing", travel: "moving" });
    expect(world.modules.valuation).toMatchObject({ visible: true, headline: { headline: "Fair price found" } });
    expect(world.modules.valuation!.spec.station).toBe("console");
    expect(world.agents.sage).toMatchObject({ state: "assigned", task: "pricing" });
    expect(world.agents.sage.route.length).toBeGreaterThan(0);
    feed({ type: "assumption_challenged", assumptionId: "a", by: "vex", note: "Prove it." });
    expect(coreState(world)).toBe("uncertain");
    feed({ type: "agent_assigned", agentId: "ghost", target: { kind: "home" }, task: "haunting", travel: "moving" });
    expect(Object.keys(world.agents)).not.toContain("ghost");
  });


  it("acts out replacements and morphs, and an agent follows its moved station around the Core", () => {
    const world = createWorld();
    let seq = 0;
    const feed = (draft: EventDraft) => reactToEvent(world, { ...draft, seq: ++seq, at: 0, cycle: 0, source: "demo" } as WorkspaceEvent, () => {});
    feed({ type: "workspace_morph_started", reason: "New plan." });
    expect(world.morph).toMatchObject({ startedAt: 0, endedAt: null, reason: "New plan." });
    feed({ type: "module_created", module: { id: "market", title: "Market", kind: "market", group: "research" } });
    feed({ type: "module_created", module: { id: "targets", title: "Targets", kind: "targets", group: "research" }, replaces: "market" });
    expect(world.modules.market!.replacedBy).toBe("targets");
    expect(world.modules.targets!.position).toEqual(world.modules.market!.position);

    for (let i = 0; i < 4 / DT; i += 1) {
      world.time += DT;
      stepWorld(world, DT, () => {});
    }
    feed({ type: "workspace_morph_completed" });
    expect(world.morph!.endedAt).toBeCloseTo(world.time);

    const sage = world.agents.sage;
    sage.state = "working";
    sage.zone = "targets";
    sage.position = [...moduleSpot(world, "targets", "sage")!];
    feed({ type: "module_moved", moduleId: "targets", group: "decision" });
    let closest = Infinity;
    for (let i = 0; i < 12 / DT; i += 1) {
      world.time += DT;
      stepWorld(world, DT, () => {});
      closest = Math.min(closest, Math.hypot(...sage.position));
    }
    expect(closest).toBeGreaterThan(CORE_RADIUS);
    const [sx, sz] = moduleSpot(world, "targets", "sage")!;
    expect(Math.hypot(sage.position[0] - sx, sage.position[1] - sz)).toBeLessThan(0.05);
  });
});
