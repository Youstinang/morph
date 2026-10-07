import { describe, expect, it } from "vitest";
import { BAY_OFFSET, CENTER_X, CENTER_Z, GENERATOR_ANGLES, GENERATOR_RADIUS, polar } from "../scene/station-layout";
import { BASE_REACH, SECTOR_ORDER, layoutModules, type LayoutItem } from "./layout";
import { applyModuleChange, DISSOLVE_SECONDS, moduleScale, moduleSpot, moduleStatus, stepModules } from "./modules";
import { MODULE_CATALOG } from "./script";
import type { ModuleEmphasis, ModuleGroup, ModuleSpec, World } from "./types";
import { createWorld } from "./world";

function spec(id: string, group: ModuleGroup): ModuleSpec {
  return { id, title: id, group, station: "console", surface: "panel", color: "#ffffff" };
}

function advance(world: World, seconds: number) {
  world.time += seconds;
  stepModules(world);
}

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

describe("module layout", () => {
  it("places the demo modules where the approved arc had them", () => {
    const placements = layoutModules(
      Object.values(MODULE_CATALOG).map((module) => ({ id: module.id, group: module.group, reach: BASE_REACH })),
    );
    const approved: Record<string, [number, number]> = {
      market: [-8.6, -2.6],
      competition: [-5.2, -8.4],
      regulation: [1, -10.2],
      economics: [6.8, -7.6],
      risk: [10, -3.6],
      possibility: [7.4, 2.6],
    };
    for (const [id, [x, z]] of Object.entries(approved)) {
      const [px, pz] = placements.get(id)!.position;
      expect(Math.hypot(px - x, pz - z)).toBeLessThan(1.1);
      expect(placements.get(id)!.scale).toBe(1);
    }
  });

  it("never overlaps footprints, even in crowded neighborhoods", () => {
    const random = seeded(7);
    const emphases: ModuleEmphasis[] = ["normal", "emphasized", "muted"];
    for (let trial = 0; trial < 300; trial += 1) {
      const items: (LayoutItem & { label: string })[] = [];
      for (const group of SECTOR_ORDER) {
        const count = Math.floor(random() * 6);
        for (let i = 0; i < count; i += 1) {
          const size = 0.7 + random() * 0.45;
          const emphasis = emphases[Math.floor(random() * 3)]!;
          const collapsed = random() < 0.2;
          const scale = moduleScale({ size, emphasis, collapsed } as Parameters<typeof moduleScale>[0]);
          items.push({ id: `${group}-${i}`, group, reach: BASE_REACH * scale, label: `${group}-${i}` });
        }
      }
      const placements = layoutModules(items);
      for (let a = 0; a < items.length; a += 1) {
        for (let b = a + 1; b < items.length; b += 1) {
          const pa = placements.get(items[a]!.id)!;
          const pb = placements.get(items[b]!.id)!;
          const distance = Math.hypot(pa.position[0] - pb.position[0], pa.position[1] - pb.position[1]);
          expect(distance).toBeGreaterThan(items[a]!.reach * pa.scale + items[b]!.reach * pb.scale + 0.3);
        }
      }
      for (const placement of placements.values()) {
        const [x, z] = placement.position;
        const length = Math.hypot(x, z);
        const bay = [x + (x / length) * BAY_OFFSET, z + (z / length) * BAY_OFFSET];
        expect(Math.hypot(bay[0]! - CENTER_X, bay[1]! - CENTER_Z)).toBeLessThan(15.6);
        for (const angle of GENERATOR_ANGLES) {
          const [gx, gz] = polar(GENERATOR_RADIUS, angle);
          expect(Math.hypot(bay[0]! - gx, bay[1]! - gz)).toBeGreaterThan(3.2);
        }
        expect(length).toBeGreaterThan(6.5);
      }
    }
  });

  it("only moves the neighborhood that gains a module", () => {
    const base: LayoutItem[] = [
      { id: "r1", group: "research", reach: BASE_REACH },
      { id: "r2", group: "research", reach: BASE_REACH },
      { id: "a1", group: "analysis", reach: BASE_REACH },
      { id: "d1", group: "decision", reach: BASE_REACH },
    ];
    const before = layoutModules(base);
    const after = layoutModules([...base, { id: "a2", group: "analysis", reach: BASE_REACH }]);
    for (const id of ["r1", "r2", "d1"]) expect(after.get(id)!.position).toEqual(before.get(id)!.position);
    expect(after.get("a1")!.position).not.toEqual(before.get("a1")!.position);
  });

  it("fits four research, four analysis and three decision modules at a readable size", () => {
    const capacity: Record<ModuleGroup, number> = { research: 4, analysis: 4, decision: 3 };
    for (const group of SECTOR_ORDER) {
      const placements = layoutModules(
        Array.from({ length: capacity[group] }, (_, i) => ({ id: `${group}${i}`, group, reach: BASE_REACH })),
      );
      for (const placement of placements.values()) expect(placement.scale).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("moves crowded neighborhoods outward before shrinking them", () => {
    const crowd = (count: number) =>
      layoutModules(Array.from({ length: count }, (_, i) => ({ id: `a${i}`, group: "analysis" as const, reach: BASE_REACH })));
    const two = crowd(2).get("a0")!;
    const three = crowd(3).get("a0")!;
    const six = crowd(6).get("a0")!;
    expect(Math.hypot(...three.position)).toBeGreaterThan(Math.hypot(...two.position));
    expect(two.scale).toBe(1);
    expect(six.scale).toBeLessThan(1);
  });
});

describe("module operations", () => {
  it("walks a module through reserved, materializing, idle, active, collapsed and dissolving", () => {
    const world = createWorld();
    applyModuleChange(world, { op: "create", spec: spec("valuation", "analysis"), visible: false });
    expect(moduleStatus(world, "valuation")).toBe("reserved");
    applyModuleChange(world, { op: "reveal", id: "valuation" });
    expect(moduleStatus(world, "valuation")).toBe("materializing");
    advance(world, 2);
    expect(moduleStatus(world, "valuation")).toBe("idle");
    world.agents.sage.zone = "valuation";
    stepModules(world);
    expect(moduleStatus(world, "valuation")).toBe("active");
    world.agents.sage.zone = null;
    applyModuleChange(world, { op: "collapse", id: "valuation", collapsed: true });
    stepModules(world);
    expect(moduleStatus(world, "valuation")).toBe("collapsed");
    applyModuleChange(world, { op: "remove", id: "valuation" });
    expect(moduleStatus(world, "valuation")).toBe("dissolving");
    advance(world, DISSOLVE_SECONDS);
    expect(moduleStatus(world, "valuation")).toBeNull();
    expect(world.moduleOrder).toHaveLength(0);
  });

  it("closes the gap after a removal finishes dissolving", () => {
    const world = createWorld();
    for (const id of ["a", "b", "c"]) applyModuleChange(world, { op: "create", spec: spec(id, "research") });
    const before = world.modules.c!.position;
    applyModuleChange(world, { op: "remove", id: "b" });
    expect(world.modules.c!.position).toEqual(before);
    advance(world, DISSOLVE_SECONDS);
    expect(world.modules.b).toBeUndefined();
    expect(world.modules.c!.position).not.toEqual(before);
  });

  it("re-lays out on emphasis and resize, clamping the size", () => {
    const world = createWorld();
    applyModuleChange(world, { op: "create", spec: spec("a", "analysis") });
    applyModuleChange(world, { op: "create", spec: spec("b", "analysis") });
    const version = world.layoutVersion;
    applyModuleChange(world, { op: "emphasize", id: "a", emphasis: "emphasized" });
    applyModuleChange(world, { op: "resize", id: "b", size: 4 });
    expect(world.layoutVersion).toBe(version + 2);
    expect(world.modules.b!.size).toBe(1.15);
    expect(moduleScale(world.modules.a!)).toBeGreaterThan(1);
  });

  it("ignores changes to unknown modules and duplicate creates", () => {
    const world = createWorld();
    applyModuleChange(world, { op: "remove", id: "missing" });
    applyModuleChange(world, { op: "create", spec: spec("a", "decision") });
    applyModuleChange(world, { op: "create", spec: spec("a", "decision") });
    expect(world.moduleOrder).toEqual(["a"]);
  });

  it("puts working agents in front of the module, toward the Core", () => {
    const world = createWorld();
    applyModuleChange(world, { op: "create", spec: spec("a", "research") });
    const [mx, mz] = world.modules.a!.position;
    const [sx, sz] = moduleSpot(world, "a", "sage")!;
    expect(Math.hypot(sx, sz)).toBeLessThan(Math.hypot(mx, mz));
    expect(moduleSpot(world, "missing", "sage")).toBeNull();
  });
});
