import { describe, expect, it } from "vitest";
import { AGENT_ORDER, CORE_RADIUS, homePosition } from "./roster";
import { MODULE_CATALOG, SCRIPT } from "./script";
import type { AgentId, AgentState, World } from "./types";
import {
  LOOP_RESTART_DELAY,
  confirmBudget,
  coreState,
  createWorld,
  planRoute,
  scenarioWeights,
  stepWorld,
} from "./world";

const DT = 1 / 60;

function runUntil(world: World, predicate: (w: World) => boolean, maxSeconds = 120) {
  let current = world;
  const seen = new Map<AgentId, Set<AgentState>>(
    AGENT_ORDER.map((id) => [id, new Set<AgentState>()]),
  );
  for (let i = 0; i < maxSeconds / DT; i += 1) {
    current = stepWorld(current, DT);
    for (const id of AGENT_ORDER) seen.get(id)?.add(current.agents[id].state);
    if (predicate(current)) break;
  }
  return { world: current, seen };
}

describe("lab agent simulation", () => {
  it("plays the flagship story in order within a minute and a half", () => {
    const { world } = runUntil(createWorld(), (w) => w.endedAt !== null);
    const order = [
      "objective",
      "plan",
      "pkg-market",
      "discovery",
      "zone:economics",
      "analysis",
      "challenge",
      "retry",
      "zone:possibility",
      "scenarios",
      "shift",
      "synthesis",
      "recommendation",
    ];
    const times = order.map((signal) => world.signals.get(signal));
    times.forEach((time) => expect(time).toBeDefined());
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    }
    expect(world.signals.get("budget")!).toBeLessThan(world.signals.get("challenge")!);
    expect(world.signals.get("retry-done")!).toBeGreaterThan(world.signals.get("retry")!);
    expect(world.signals.get("retry-done")!).toBeLessThanOrEqual(world.signals.get("shift")!);
    expect(world.endedAt!).toBeLessThan(90);
  });

  it("drives every agent through real movement and work states", () => {
    const { seen } = runUntil(createWorld(), (w) => w.endedAt !== null);
    for (const id of AGENT_ORDER) {
      const states = seen.get(id)!;
      expect(states.has("moving") || states.has("returning")).toBe(true);
      expect(
        states.has("working") || states.has("evaluating") || states.has("collaborating"),
      ).toBe(true);
    }
    const orion = seen.get("orion")!;
    for (const state of ["assigned", "handoff", "failed", "retrying", "completed", "returning"] as const) {
      expect(orion.has(state)).toBe(true);
    }
    expect(seen.get("sage")!.has("waiting")).toBe(true);
    expect(seen.get("vex")!.has("handoff")).toBe(true);
  });

  it("is deterministic", () => {
    const a = runUntil(createWorld(), (w) => w.time > 40).world;
    const b = runUntil(createWorld(), (w) => w.time > 40).world;
    expect(a.log.map((e) => e.text)).toEqual(b.log.map((e) => e.text));
    expect(a.agents.orion.position).toEqual(b.agents.orion.position);
  });

  it("waits for the budget and accepts an early user confirmation", () => {
    const { world } = runUntil(createWorld(), (w) => w.signals.has("budget-request"));
    expect(world.signals.has("budget")).toBe(false);
    expect(world.agents.nova.state).toBe("waiting");
    confirmBudget(world);
    expect(world.signals.get("budget")).toBe(world.time);
    expect(world.log.at(-1)?.agent).toBe("user");
  });

  it("materializes modules only when the plan or the builder creates them", () => {
    const world = createWorld();
    expect(world.moduleOrder).toHaveLength(0);
    const planned = runUntil(world, (w) => w.signals.has("plan")).world;
    expect(planned.moduleOrder).toEqual(["market", "competition", "regulation"]);
    expect(planned.modules.market!.visible).toBe(true);
    const reserved = runUntil(planned, (w) => w.signals.has("discovery")).world;
    expect(reserved.modules.economics!.visible).toBe(false);
    const built = runUntil(reserved, (w) => w.signals.has("zone:risk")).world;
    expect(built.modules.economics!.visible).toBe(true);
    expect(built.modules.risk!.visible).toBe(true);
  });

  it("keeps every module the script sends agents to in the module catalog", () => {
    const known = new Set(Object.keys(MODULE_CATALOG));
    for (const id of AGENT_ORDER) {
      for (const action of SCRIPT[id]) {
        if (action.kind === "moveTo" && "zone" in action.target) expect(known.has(action.target.zone)).toBe(true);
        if (action.kind === "hold" && action.zone) expect(known.has(action.zone)).toBe(true);
      }
    }
  });

  it("only sends agents to modules that exist, and keeps the demo layout stable", () => {
    let world = createWorld();
    const positions = new Map<string, string>();
    for (let i = 0; i < 70 / DT; i += 1) {
      world = stepWorld(world, DT);
      for (const id of AGENT_ORDER) {
        const zone = world.agents[id].zone;
        if (zone) expect(world.modules[zone]).toBeDefined();
      }
      for (const id of world.moduleOrder) {
        const key = world.modules[id]!.position.join(",");
        expect(positions.get(id) ?? key).toBe(key);
        positions.set(id, key);
      }
    }
  });

  it("dissolves every module before the loop restarts", () => {
    const { world } = runUntil(createWorld(), (w) => w.endedAt !== null && w.time > w.endedAt + LOOP_RESTART_DELAY - 0.1);
    expect(world.cycle).toBe(0);
    expect(world.moduleOrder).toHaveLength(0);
  });

  it("reports core states and scenario weights from signals", () => {
    const world = createWorld();
    expect(coreState(world)).toBe("dormant");
    expect(scenarioWeights(world)).toBeNull();
    const done = runUntil(world, (w) => w.signals.has("recommendation")).world;
    expect(coreState(done)).toBe("completed");
    const weights = scenarioWeights(done)!;
    expect(weights.partnership).toBeGreaterThan(weights.direct);
    expect(weights.partnership).toBeGreaterThan(weights.delay);
  });

  it("routes walks around the Intent Core", () => {
    const route = planRoute([-6, 3], [6, -3]);
    expect(route).toHaveLength(2);
    const [wx, wz] = route[0]!;
    expect(Math.hypot(wx, wz)).toBeGreaterThan(CORE_RADIUS);
    expect(planRoute([-6, 3], [-10, -1.5])).toHaveLength(1);
  });

  it("restarts the loop after the recommendation settles", () => {
    const { world } = runUntil(createWorld(), (w) => w.cycle === 1);
    expect(world.cycle).toBe(1);
    expect(world.signals.size).toBe(0);
  });

  it("turns agents resting at home to face out from the Core", () => {
    const { world } = runUntil(createWorld(), (w) => w.endedAt !== null && w.time > w.endedAt + 4);
    for (const id of AGENT_ORDER) {
      const [hx, hz] = homePosition(id);
      const agent = world.agents[id];
      if (Math.hypot(agent.position[0] - hx, agent.position[1] - hz) < 0.3) {
        expect(agent.facing).toBeCloseTo(Math.atan2(hx, hz), 5);
      }
    }
  });
});
