import { BASE_REACH, layoutModules } from "./layout";
import { AGENT_ORDER } from "./roster";
import type {
  AgentId,
  ModuleChange,
  ModuleEmphasis,
  ModuleId,
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

/** How much bigger than its footprint a module's rendered geometry is scaled, before crowding. */
export function moduleScale(mod: ModuleRuntime): number {
  return mod.size * EMPHASIS_SCALE[mod.emphasis] * (mod.collapsed ? COLLAPSED_SCALE : 1);
}

function relayout(world: World) {
  const items = world.moduleOrder.map((id) => {
    const mod = world.modules[id]!;
    return { id, group: mod.spec.group, reach: BASE_REACH * moduleScale(mod) };
  });
  for (const [id, placement] of layoutModules(items)) {
    const mod = world.modules[id]!;
    mod.position = placement.position;
    mod.bearing = placement.bearing;
    mod.layoutScale = placement.scale;
  }
  world.layoutVersion += 1;
}

export function createModule(world: World, spec: ModuleSpec, visible = true): void {
  if (world.modules[spec.id]) {
    if (visible) revealModule(world, spec.id);
    return;
  }
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
    position: [0, 0],
    bearing: 0,
    layoutScale: 1,
  };
  world.moduleOrder.push(spec.id);
  relayout(world);
}

export function revealModule(world: World, id: ModuleId): void {
  const mod = world.modules[id];
  if (!mod || mod.visible || mod.removedAt !== null) return;
  mod.visible = true;
  mod.appearedAt = world.time;
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
    createModule(world, change.spec, change.visible ?? true);
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
    const removedAt = world.modules[id]!.removedAt;
    if (removedAt !== null && world.time - removedAt >= DISSOLVE_SECONDS) deleteModule(world, id);
  }
}

export function moduleStatus(world: World, id: ModuleId): ModuleStatus | null {
  const mod = world.modules[id];
  if (!mod) return null;
  if (mod.removedAt !== null) return "dissolving";
  if (!mod.visible) return "reserved";
  if (world.time - mod.appearedAt < MATERIALIZE_SECONDS) return "materializing";
  if (mod.collapsed) return "collapsed";
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
