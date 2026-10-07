import { describe, expect, it } from "vitest";
import { BAY_OFFSET, CENTER_X, CENTER_Z, GENERATOR_ANGLES, GENERATOR_RADIUS, polar } from "../scene/station-layout";
import { BASE_REACH, SECTOR_ORDER, layoutModules, type LayoutItem } from "./layout";
import {
  applyModuleChange,
  CARRY_SECONDS,
  DISSOLVE_SECONDS,
  GLIDE_SECONDS,
  moduleGrowth,
  modulePose,
  moduleScale,
  moduleSpot,
  moduleStatus,
  stepModules,
} from "./modules";
import { CORE_RADIUS } from "./roster";
import { MODULE_CATALOG } from "./script";
import type { ModuleChange, ModuleEmphasis, ModuleGroup, ModuleSpec, World } from "./types";
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

const DT = 1 / 60;

/** Drawn footprint radius of a module at rest or mid-move. */
function footprint(world: World, id: string) {
  const mod = world.modules[id]!;
  const pose = modulePose(mod, world.time);
  return BASE_REACH * pose.scale * pose.carry * moduleGrowth(mod, world.time);
}

/** Steps the world, checking every frame that no two stations standing on the deck overlap. */
function playChecked(world: World, seconds: number, onFrame?: () => void) {
  for (let t = 0; t < seconds; t += DT) {
    advance(world, DT);
    onFrame?.();
    const grounded = world.moduleOrder.filter((id) => {
      const mod = world.modules[id]!;
      return mod.replacedBy === null && mod.removedAt === null && moduleGrowth(mod, world.time) > 0.01 && modulePose(mod, world.time).lift < 1;
    });
    for (let a = 0; a < grounded.length; a += 1) {
      for (let b = a + 1; b < grounded.length; b += 1) {
        const pa = modulePose(world.modules[grounded[a]!]!, world.time).position;
        const pb = modulePose(world.modules[grounded[b]!]!, world.time).position;
        const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) - footprint(world, grounded[a]!) - footprint(world, grounded[b]!);
        expect(gap, `${grounded[a]} and ${grounded[b]} at ${world.time.toFixed(2)}s`).toBeGreaterThan(0);
      }
    }
  }
}

function demoDeck() {
  const world = createWorld();
  for (const id of ["market", "competition", "regulation", "economics", "risk", "possibility"] as const) {
    applyModuleChange(world, { op: "create", spec: MODULE_CATALOG[id] });
  }
  advance(world, 2);
  return world;
}

describe("morphing engine", () => {
  it("glides neighbours along the arc when a module joins, and the newcomer appears in place", () => {
    const world = createWorld();
    applyModuleChange(world, { op: "create", spec: spec("a1", "analysis") });
    advance(world, 2);
    const before = world.modules.a1!.position;
    applyModuleChange(world, { op: "create", spec: spec("a2", "analysis") });
    expect(world.modules.a2!.transit).toBeNull();
    expect(world.modules.a1!.transit).toMatchObject({ from: before, lifted: false, duration: GLIDE_SECONDS });
    expect(moduleStatus(world, "a1")).toBe("moving");
    playChecked(world, GLIDE_SECONDS + 0.1);
    expect(world.modules.a1!.transit).toBeNull();
    expect(modulePose(world.modules.a1!, world.time).position).toEqual(world.modules.a1!.position);
  });

  it("carries a module to another neighborhood over the others, staying on the ring around the Core", () => {
    const world = demoDeck();
    const from = world.modules.risk!.position;
    applyModuleChange(world, { op: "move", id: "risk", group: "decision" });
    const risk = world.modules.risk!;
    expect(risk.transit!.lifted).toBe(true);
    expect(risk.transit!.duration).toBeGreaterThanOrEqual(CARRY_SECONDS[0]);
    expect(risk.transit!.duration).toBeLessThanOrEqual(CARRY_SECONDS[1]);
    let highest = 0;
    playChecked(world, CARRY_SECONDS[1] + 0.1, () => {
      const pose = modulePose(risk, world.time);
      highest = Math.max(highest, pose.lift);
      expect(Math.hypot(...pose.position)).toBeGreaterThan(CORE_RADIUS + 4);
    });
    expect(highest).toBeGreaterThan(3);
    expect(risk.position).not.toEqual(from);
    expect(modulePose(risk, world.time)).toMatchObject({ lift: 0, carry: 1, progress: 1 });
  });

  it("never lets stations on the deck collide during reshuffles of every kind", () => {
    const world = demoDeck();
    const steps: ModuleChange[][] = [
      [
        { op: "emphasize", id: "economics", emphasis: "emphasized" },
        { op: "emphasize", id: "risk", emphasis: "emphasized" },
        { op: "emphasize", id: "market", emphasis: "muted" },
        { op: "collapse", id: "regulation", collapsed: true },
      ],
      [
        { op: "create", spec: spec("targets", "research"), replaces: "competition" },
        { op: "create", spec: spec("valuation", "analysis") },
        { op: "create", spec: spec("integration", "analysis") },
        { op: "move", id: "risk", group: "decision" },
        { op: "remove", id: "economics" },
      ],
      [
        { op: "resize", id: "valuation", size: 1.15 },
        { op: "move", id: "market", group: "analysis" },
        { op: "create", spec: spec("pricing", "analysis") },
      ],
    ];
    for (const batch of steps) {
      for (const change of batch) applyModuleChange(world, change);
      playChecked(world, 1.2);
    }
    playChecked(world, 3);
  });

  it("interrupts a move smoothly: a new change starts from where the module is drawn", () => {
    const world = demoDeck();
    applyModuleChange(world, { op: "move", id: "market", group: "analysis" });
    advance(world, world.modules.market!.transit!.duration * 0.4);
    const midway = modulePose(world.modules.market!, world.time);
    applyModuleChange(world, { op: "move", id: "market", group: "decision" });
    const restarted = modulePose(world.modules.market!, world.time);
    expect(Math.hypot(midway.position[0] - restarted.position[0], midway.position[1] - restarted.position[1])).toBeLessThan(1e-6);
    expect(world.modules.market!.transit!.lifted).toBe(true);
    let previous = restarted.position;
    playChecked(world, CARRY_SECONDS[1] + 0.1, () => {
      const now = modulePose(world.modules.market!, world.time).position;
      expect(Math.hypot(now[0] - previous[0], now[1] - previous[1])).toBeLessThan(0.4);
      previous = now;
    });
  });

  it("replaces a module in its own slot, keeping the evidence gathered there", () => {
    const world = demoDeck();
    world.modules.competition!.evidence = 6;
    const slot = world.modules.competition!.position;
    const neighbours = ["market", "regulation"].map((id) => world.modules[id]!.position);
    applyModuleChange(world, { op: "create", spec: spec("targets", "research"), replaces: "competition" });
    expect(world.modules.targets).toMatchObject({ position: slot, evidence: 6, transit: null });
    expect(world.modules.competition).toMatchObject({ replacedBy: "targets", position: slot });
    expect(moduleStatus(world, "competition")).toBe("dissolving");
    expect(world.moduleOrder.indexOf("targets")).toBe(world.moduleOrder.indexOf("competition") - 1);
    expect(["market", "regulation"].map((id) => world.modules[id]!.position)).toEqual(neighbours);
    advance(world, DISSOLVE_SECONDS);
    expect(world.modules.competition).toBeUndefined();
    expect(world.modules.targets!.position).toEqual(slot);
  });

  it("survives hundreds of random reshuffles, interrupted mid-move, without a collision", () => {
    const world = demoDeck();
    const random = seeded(11);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
    let next = 0;
    for (let round = 0; round < 120; round += 1) {
      const live = world.moduleOrder.filter((id) => world.modules[id]!.removedAt === null);
      const counts = SECTOR_ORDER.map((group) => live.filter((id) => world.modules[id]!.spec.group === group).length);
      const id = live.length > 0 ? pick(live) : null;
      const roll = random();
      const open = SECTOR_ORDER.filter((_, i) => counts[i]! < 4);
      if ((roll < 0.2 || id === null) && open.length > 0) {
        const group = pick(open);
        applyModuleChange(world, { op: "create", spec: spec(`m${(next += 1)}`, group) });
      } else if (id === null) {
        continue;
      } else if (roll < 0.35) {
        const targets = SECTOR_ORDER.filter((g, i) => g !== world.modules[id]!.spec.group && counts[i]! < 4);
        if (targets.length > 0) applyModuleChange(world, { op: "move", id, group: pick(targets) });
      } else if (roll < 0.5) applyModuleChange(world, { op: "emphasize", id, emphasis: pick(["normal", "emphasized", "muted"] as const) });
      else if (roll < 0.6) applyModuleChange(world, { op: "collapse", id, collapsed: random() < 0.5 });
      else if (roll < 0.72) applyModuleChange(world, { op: "resize", id, size: 0.7 + random() * 0.45 });
      else if (roll < 0.82) applyModuleChange(world, { op: "create", spec: spec(`m${(next += 1)}`, world.modules[id]!.spec.group), replaces: id });
      else if (live.length > 2) applyModuleChange(world, { op: "remove", id });
      playChecked(world, 0.2 + random() * 1.6);
    }
    playChecked(world, 4);
  });

  it("ignores a move to the module's own neighborhood", () => {
    const world = demoDeck();
    const version = world.layoutVersion;
    applyModuleChange(world, { op: "move", id: "market", group: "research" });
    expect(world.layoutVersion).toBe(version);
    expect(world.modules.market!.transit).toBeNull();
  });
});
