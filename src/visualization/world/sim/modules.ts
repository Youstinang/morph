import { BASE_REACH, layoutModules, pointAt } from "./layout";
import { AGENT_ORDER } from "./roster";
import type {
  AgentId,
  ModuleChange,
  ModuleEmphasis,
  ModuleId,
  ModulePose,
  ModuleRuntime,
  ModuleSpec,
  ModuleStatus,
  Vec2,
  World,
} from "./types";

export const MATERIALIZE_SECONDS = 1.3;
export const DISSOLVE_SECONDS = 1.2;
export const SIZE_RANGE = [0.7, 1.15] as const;
export const EMPHASIS_SCALE: Record<ModuleEmphasis, number> = { normal: 1, emphasized: 1.12, muted: 0.86 };
export const COLLAPSED_SCALE = 0.55;
/** Neighbours re-spacing along the arc. */
export const GLIDE_SECONDS = 1.2;
/** A module carried to another neighborhood: lift, travel over the others, set down; longer trips take longer. */
export const CARRY_SECONDS = [2, 3.6] as const;
export const CARRY_HEIGHT = 3.4;
/** Rise and set-down time of a carry; neighbours wait `LIFT_OFF_SECONDS` before sliding into a vacated slot. */
export const RISE_SECONDS = 0.6;
export const LIFT_OFF_SECONDS = 0.35;
export const CARRY_SCALE = 0.5;

/** How much bigger than its footprint a module's rendered geometry is scaled, before crowding. */
export function moduleScale(mod: ModuleRuntime): number {
  return mod.size * EMPHASIS_SCALE[mod.emphasis] * (mod.collapsed ? COLLAPSED_SCALE : 1);
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Where a module is drawn at `time`. Travel interpolates radius and distance along the arc, so every path
 * stays on the ring around the Core (never across it) and the spacing between neighbours changes evenly. A carried module rises first, travels high and small, then
 * settles, so it clears the stations it passes.
 */
export function modulePose(mod: ModuleRuntime, time: number): ModulePose {
  const transit = mod.transit;
  const raw = transit ? (time - transit.startedAt) / transit.duration : 1;
  if (!transit || raw >= 1) {
    return { position: mod.position, bearing: mod.bearing, lift: 0, carry: 1, scale: mod.restScale, crowd: mod.layoutScale, progress: 1 };
  }
  const progress = Math.max(0, raw);
  const elapsed = progress * transit.duration;
  const rise = transit.fromHeight + (1 - transit.fromHeight) * smooth(elapsed / RISE_SECONDS);
  const height = transit.lifted ? Math.min(rise, smooth((transit.duration - elapsed) / RISE_SECONDS)) : 0;
  const cruise = transit.duration - 2 * RISE_SECONDS;
  const travel = transit.lifted ? smooth((elapsed - RISE_SECONDS) / cruise) : smooth(progress);
  const fromRadius = Math.hypot(transit.from[0], transit.from[1]);
  const toRadius = Math.hypot(mod.position[0], mod.position[1]);
  const radius = fromRadius + (toRadius - fromRadius) * travel;
  const arc = fromRadius * transit.fromBearing + (toRadius * mod.bearing - fromRadius * transit.fromBearing) * travel;
  const bearing = arc / radius;
  return {
    position: pointAt(radius, bearing),
    bearing,
    lift: height * CARRY_HEIGHT,
    carry: 1 - (1 - CARRY_SCALE) * height,
    scale: transit.fromScale + (mod.restScale - transit.fromScale) * travel,
    crowd: transit.fromCrowd + (mod.layoutScale - transit.fromCrowd) * travel,
    progress,
  };
}

/**
 * How far a module has materialized (0 → 1) or dissolved (1 → 0) at `time`; it scales the whole station.
 * A newcomer whose arrival pushes neighbours aside starts growing only once they have mostly made room.
 */
export function moduleGrowth(mod: ModuleRuntime, time: number): number {
  if (!mod.visible) return 0;
  const k = mod.removedAt !== null ? 1 - smooth((time - mod.removedAt) / DISSOLVE_SECONDS) : smooth((time - mod.appearedAt) / MATERIALIZE_SECONDS);
  return k < 1 ? 1 - (1 - k) ** 3 : 1;
}

/** Delay before a newcomer grows, while its neighbours glide aside. */
export const MAKE_ROOM_SECONDS = GLIDE_SECONDS * 0.75;

/**
 * Re-runs the layout and starts a move for every visible module whose slot changed, from wherever it is
 * drawn now (so a new change interrupts a move smoothly). `carried` modules changed neighborhood.
 */
function relayout(world: World, carried: ReadonlySet<ModuleId> = new Set()): void {
  const liftingOff = [...carried].some((id) => {
    const mod = world.modules[id];
    return mod !== undefined && mod.visible && modulePose(mod, world.time).lift < 1;
  });
  const items = world.moduleOrder
    .filter((id) => world.modules[id]!.replacedBy === null)
    .map((id) => {
      const mod = world.modules[id]!;
      return { id, group: mod.spec.group, reach: BASE_REACH * moduleScale(mod) };
    });
  const placements = layoutModules(items);
  const changed = new Set<ModuleId>();
  for (const [id, placement] of placements) {
    const mod = world.modules[id]!;
    const restScale = moduleScale(mod) * placement.scale;
    const moved = Math.hypot(placement.position[0] - mod.position[0], placement.position[1] - mod.position[1]) > 0.01;
    const resized = Math.abs(restScale - mod.restScale) > 0.005 || Math.abs(placement.scale - mod.layoutScale) > 0.005;
    if ((moved || resized) && mod.visible) changed.add(id);
  }
  // Every visible module of a neighborhood that changes restarts on one shared clock from where it is drawn,
  // so neighbours keep their spacing even when moves interrupt each other.
  const regrouped = new Set([...changed].map((id) => world.modules[id]!.spec.group));
  for (const [id, placement] of placements) {
    const mod = world.modules[id]!;
    if (mod.visible && (changed.has(id) || regrouped.has(mod.spec.group))) {
      const pose = modulePose(mod, world.time);
      const lifted = carried.has(id) || pose.lift > 0.05 || (mod.transit?.lifted === true && pose.progress < 1);
      const radius = (Math.hypot(...pose.position) + Math.hypot(...placement.position)) / 2;
      const trip = Math.abs(placement.bearing - pose.bearing) * radius;
      const carrySeconds = Math.min(CARRY_SECONDS[1], Math.max(CARRY_SECONDS[0], 1.6 + trip / 10));
      const startedAt = lifted || !liftingOff ? world.time : world.time + LIFT_OFF_SECONDS;
      for (const other of world.moduleOrder) {
        const waiting = world.modules[other]!;
        if (other !== id && waiting.spec.group === mod.spec.group && waiting.visible && waiting.appearedAt > world.time) {
          waiting.appearedAt = Math.max(waiting.appearedAt, startedAt + MAKE_ROOM_SECONDS);
        }
      }
      mod.transit = {
        from: pose.position,
        fromBearing: pose.bearing,
        startedAt,
        duration: lifted ? carrySeconds : GLIDE_SECONDS,
        lifted,
        fromHeight: pose.lift / CARRY_HEIGHT,
        fromScale: pose.scale,
        fromCrowd: pose.crowd,
      };
    }
    mod.position = placement.position;
    mod.bearing = placement.bearing;
    mod.layoutScale = placement.scale;
    mod.restScale = moduleScale(mod) * placement.scale;
  }
  world.layoutVersion += 1;
}

/**
 * Adds a module. With `replaces`, it takes that module's slot: the old one dissolves where it stands while
 * the new one materializes in its place, keeping the evidence gathered there.
 */
export function createModule(world: World, spec: ModuleSpec, visible = true, replaces?: ModuleId): void {
  if (world.modules[spec.id]) {
    if (visible) revealModule(world, spec.id);
    return;
  }
  const old = replaces !== undefined && replaces !== spec.id ? world.modules[replaces] : undefined;
  const index = old ? world.moduleOrder.indexOf(replaces!) : world.moduleOrder.length;
  world.modules[spec.id] = {
    spec,
    visible,
    appearedAt: world.time,
    removedAt: null,
    emphasis: "normal",
    collapsed: false,
    size: 1,
    activity: 0,
    evidence: 0,
    headline: null,
    position: old ? old.position : [0, 0],
    bearing: old ? old.bearing : 0,
    layoutScale: 1,
    restScale: 1,
    transit: null,
    replacedBy: null,
  };
  world.moduleOrder.splice(index, 0, spec.id);
  const created = world.modules[spec.id]!;
  if (old) {
    created.evidence = old.evidence;
    created.restScale = old.restScale;
    created.layoutScale = old.layoutScale;
    created.transit = old.transit && { ...old.transit };
    created.appearedAt = Math.max(created.appearedAt, old.appearedAt);
    old.replacedBy = spec.id;
    if (old.removedAt === null) old.removedAt = world.time;
  }
  relayout(world);
  if (!old) created.transit = null;
  const pushed = world.moduleOrder.some((id) => {
    const transit = world.modules[id]!.transit;
    return id !== spec.id && transit?.startedAt === world.time && transit.from.some((v, i) => Math.abs(v - world.modules[id]!.position[i]!) > 0.01);
  });
  if (visible && pushed) created.appearedAt = world.time + MAKE_ROOM_SECONDS;
  if (old && !old.visible) deleteModule(world, replaces!);
}

export function revealModule(world: World, id: ModuleId): void {
  const mod = world.modules[id];
  if (!mod || mod.visible || mod.removedAt !== null) return;
  mod.visible = true;
  mod.appearedAt = Math.max(mod.appearedAt, world.time);
  mod.transit = null;
}

/** Starts the dissolve; the slot is released (and neighbours close the gap) once it finishes. */
export function removeModule(world: World, id: ModuleId): void {
  const mod = world.modules[id];
  if (!mod || mod.removedAt !== null) return;
  if (!mod.visible) {
    deleteModule(world, id);
    return;
  }
  mod.removedAt = world.time;
}

function deleteModule(world: World, id: ModuleId) {
  delete world.modules[id];
  world.moduleOrder = world.moduleOrder.filter((other) => other !== id);
  relayout(world);
}

export function applyModuleChange(world: World, change: ModuleChange): void {
  if (change.op === "create") {
    createModule(world, change.spec, change.visible ?? true, change.replaces);
    return;
  }
  const mod = world.modules[change.id];
  if (!mod) return;
  switch (change.op) {
    case "reveal":
      revealModule(world, change.id);
      return;
    case "remove":
      removeModule(world, change.id);
      return;
    case "emphasize":
      mod.emphasis = change.emphasis;
      break;
    case "collapse":
      mod.collapsed = change.collapsed;
      break;
    case "resize":
      mod.size = Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], change.size));
      break;
    case "move":
      if (mod.spec.group === change.group) return;
      mod.spec = { ...mod.spec, group: change.group };
      relayout(world, new Set([change.id]));
      return;
    case "retitle":
      mod.spec = { ...mod.spec, title: change.title };
      return;
  }
  relayout(world);
}

/** Recounts activity from agents and releases modules whose dissolve has finished. */
export function stepModules(world: World): void {
  for (const id of world.moduleOrder) world.modules[id]!.activity = 0;
  for (const id of AGENT_ORDER) {
    const zone = world.agents[id].zone;
    const mod = zone ? world.modules[zone] : undefined;
    if (mod) mod.activity += 1;
  }
  for (const id of [...world.moduleOrder]) {
    const mod = world.modules[id]!;
    if (mod.transit && world.time - mod.transit.startedAt >= mod.transit.duration) mod.transit = null;
    if (mod.removedAt !== null && world.time - mod.removedAt >= DISSOLVE_SECONDS) deleteModule(world, id);
  }
}

export function moduleStatus(world: World, id: ModuleId): ModuleStatus | null {
  const mod = world.modules[id];
  if (!mod) return null;
  if (mod.removedAt !== null) return "dissolving";
  if (!mod.visible) return "reserved";
  if (world.time - mod.appearedAt < MATERIALIZE_SECONDS) return "materializing";
  if (mod.collapsed) return "collapsed";
  if (mod.transit) return "moving";
  return mod.activity > 0 ? "active" : "idle";
}

/** Where an agent stands to work at a module: in front of it, toward the Core, side by side. */
export function moduleSpot(world: World, id: ModuleId, agent: AgentId): Vec2 | null {
  const mod = world.modules[id];
  if (!mod) return null;
  const [zx, zz] = mod.position;
  const length = Math.hypot(zx, zz) || 1;
  const nx = -zx / length;
  const nz = -zz / length;
  const slot = (AGENT_ORDER.indexOf(agent) % 3) - 1;
  const scale = moduleScale(mod) * mod.layoutScale;
  const front = 1.2 + 0.9 * scale;
  return [zx + nx * front + -nz * slot * 0.95, zz + nz * front + nx * slot * 0.95];
}
