import { DISSOLVE_SECONDS, applyModuleChange, moduleSpot, removeModule, stepModules } from "./modules";
import { AGENTS, AGENT_ORDER, CORE_RADIUS, coreSpot, homePosition } from "./roster";
import {
  BUDGET_ANSWER,
  BUDGET_AUTO_CONFIRM_SECONDS,
  MODULE_CHANGES,
  MODULE_HEADLINES,
  SCRIPT,
  type ModuleHeadline,
} from "./script";
import type { Action, AgentId, AgentRuntime, CoreState, ModuleId, ScenarioWeights, Target, Vec2, World } from "./types";

export const WALK_SPEED = 3.4;
export const ASSIGN_PAUSE = 0.55;
export const HANDOFF_SECONDS = 1.4;
export const LOOP_RESTART_DELAY = 7;
const MAX_LOG = 40;

export function createWorld(cycle = 0): World {
  const agents = {} as Record<AgentId, AgentRuntime>;
  for (const id of AGENT_ORDER) {
    const [x, z] = homePosition(id);
    agents[id] = {
      id,
      position: [x, z],
      facing: Math.atan2(-x, -z) + Math.PI,
      state: "idle",
      task: "ready",
      progress: 0,
      moving: false,
      zone: null,
      route: [],
      actionIndex: 0,
      actionElapsed: 0,
      actionStarted: false,
      hasWorked: false,
    };
  }
  return {
    time: 0,
    cycle,
    agents,
    modules: {},
    moduleOrder: [],
    layoutVersion: 0,
    signals: new Map(),
    artifacts: [],
    log: [],
    nextId: 1,
    endedAt: null,
  };
}

function log(world: World, agent: World["log"][number]["agent"], text: string, beat = false) {
  world.log.push({ id: world.nextId++, time: world.time, agent, text, beat });
  if (world.log.length > MAX_LOG) world.log.shift();
}

export function emitSignal(world: World, signal: string, text?: string) {
  if (world.signals.has(signal)) return;
  world.signals.set(signal, world.time);
  for (const change of MODULE_CHANGES[signal] ?? []) applyModuleChange(world, change);
  if (text) log(world, "system", text, true);
}

export function confirmBudget(world: World) {
  if (!world.signals.has("budget-request") || world.signals.has("budget")) return;
  emitSignal(world, "budget");
  log(world, "user", `You set the launch budget: ${BUDGET_ANSWER}.`, true);
}

export function resolveTarget(world: World, id: AgentId, target: Target): Vec2 {
  if ("zone" in target) return moduleSpot(world, target.zone, id) ?? coreSpot(id);
  if ("core" in target) return coreSpot(id);
  return homePosition(id);
}

export function planRoute(from: Vec2, to: Vec2): [number, number][] {
  const [ax, az] = from;
  const [bx, bz] = to;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-6) return [[bx, bz]];
  const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / lengthSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const clearance = Math.hypot(cx, cz);
  const endpointsClear =
    Math.hypot(ax, az) > CORE_RADIUS + 0.3 && Math.hypot(bx, bz) > CORE_RADIUS + 0.3;
  if (clearance >= CORE_RADIUS + 0.4 || !endpointsClear || t <= 0 || t >= 1) {
    return [[bx, bz]];
  }
  const nx = clearance > 1e-3 ? cx / clearance : -dz / Math.sqrt(lengthSq);
  const nz = clearance > 1e-3 ? cz / clearance : dx / Math.sqrt(lengthSq);
  const radius = CORE_RADIUS + 1.1;
  return [
    [nx * radius, nz * radius],
    [bx, bz],
  ];
}

function enterAction(world: World, agent: AgentRuntime, action: Action) {
  const name = AGENTS[agent.id].name;
  switch (action.kind) {
    case "moveTo": {
      agent.route = planRoute(agent.position, resolveTarget(world, agent.id, action.target));
      agent.zone = null;
      if (action.state !== "returning") log(world, agent.id, `${name} is ${action.task}.`);
      break;
    }
    case "hold":
      if (action.state !== "completed") {
        const beat = action.state === "failed" || action.state === "retrying";
        log(world, agent.id, `${name} is ${action.task}.`, beat);
      }
      break;
    case "handoff": {
      world.artifacts.push({
        id: world.nextId++,
        kind: action.artifact,
        from: agent.id,
        to: action.to,
        start: [agent.position[0], agent.position[1]],
        startedAt: world.time,
        duration: HANDOFF_SECONDS,
        signal: action.signal,
      });
      log(world, agent.id, `${name} is ${action.task}.`, true);
      break;
    }
    default:
      break;
  }
}

function advance(agent: AgentRuntime) {
  agent.actionIndex += 1;
  agent.actionElapsed = 0;
  agent.actionStarted = false;
  agent.progress = 0;
}

function faceToward(agent: AgentRuntime, point: Vec2) {
  const dx = point[0] - agent.position[0];
  const dz = point[1] - agent.position[1];
  if (Math.hypot(dx, dz) > 1e-3) agent.facing = Math.atan2(dx, dz);
}

/** Agents resting at their home slot face out from the Core, toward the observer. */
function faceOutwardAtHome(agent: AgentRuntime) {
  const [hx, hz] = homePosition(agent.id);
  if (Math.hypot(agent.position[0] - hx, agent.position[1] - hz) < 0.3) {
    agent.facing = Math.atan2(hx, hz);
  }
}

function stepAgent(world: World, agent: AgentRuntime, dt: number) {
  const script = SCRIPT[agent.id];
  for (let guard = 0; guard < 12; guard += 1) {
    const action = script[agent.actionIndex];
    agent.moving = false;
    if (!action) {
      agent.state = "idle";
      agent.task = world.signals.has("recommendation") ? "done for now" : "ready";
      agent.zone = null;
      faceOutwardAtHome(agent);
      return;
    }
    if (!agent.actionStarted) {
      agent.actionStarted = true;
      enterAction(world, agent, action);
    }

    switch (action.kind) {
      case "wait": {
        agent.state = "idle";
        agent.task = "ready";
        agent.actionElapsed += dt;
        if (agent.actionElapsed < action.seconds) return;
        advance(agent);
        continue;
      }
      case "waitFor": {
        if (world.signals.has(action.signal)) {
          advance(agent);
          continue;
        }
        agent.state = agent.hasWorked ? "waiting" : "idle";
        agent.task = action.task ?? agent.task;
        faceOutwardAtHome(agent);
        return;
      }
      case "emit": {
        emitSignal(world, action.signal, action.log);
        advance(agent);
        continue;
      }
      case "handoff": {
        agent.state = "handoff";
        agent.task = action.task;
        faceToward(agent, world.agents[action.to].position);
        if (!world.signals.has(action.signal)) return;
        advance(agent);
        continue;
      }
      case "hold": {
        agent.hasWorked = true;
        agent.state = action.state;
        agent.task = action.task;
        agent.zone = action.zone ?? null;
        const mod = action.zone ? world.modules[action.zone] : undefined;
        if (action.zone) followModule(world, agent, action.zone, dt);
        faceToward(agent, mod ? mod.position : [0, 0]);
        agent.actionElapsed += dt;
        agent.progress = Math.min(1, agent.actionElapsed / action.seconds);
        if (mod && action.evidence !== undefined) {
          mod.evidence = Math.max(mod.evidence, Math.floor(action.evidence * agent.progress));
        }
        if (agent.actionElapsed < action.seconds) return;
        advance(agent);
        continue;
      }
      case "moveTo": {
        agent.hasWorked = true;
        agent.task = action.task;
        agent.actionElapsed += dt;
        const movingState = action.state ?? "moving";
        if (movingState !== "returning" && agent.actionElapsed < ASSIGN_PAUSE) {
          agent.state = "assigned";
          const next = agent.route[0];
          if (next) faceToward(agent, next);
          return;
        }
        agent.state = movingState;
        let budget = WALK_SPEED * dt;
        while (budget > 0 && agent.route.length > 0) {
          const [tx, tz] = agent.route[0]!;
          const dx = tx - agent.position[0];
          const dz = tz - agent.position[1];
          const distance = Math.hypot(dx, dz);
          if (distance <= budget) {
            agent.position = [tx, tz];
            agent.route.shift();
            budget -= distance;
          } else {
            agent.position = [
              agent.position[0] + (dx / distance) * budget,
              agent.position[1] + (dz / distance) * budget,
            ];
            agent.facing = Math.atan2(dx, dz);
            budget = 0;
          }
        }
        if (agent.route.length > 0) {
          agent.moving = true;
          return;
        }
        advance(agent);
        continue;
      }
    }
  }
}

/** If the module was re-laid out while the agent works there, the agent walks to its new spot. */
function followModule(world: World, agent: AgentRuntime, zone: ModuleId, dt: number) {
  const spot = moduleSpot(world, zone, agent.id);
  if (!spot) return;
  const dx = spot[0] - agent.position[0];
  const dz = spot[1] - agent.position[1];
  const distance = Math.hypot(dx, dz);
  if (distance < 0.02) return;
  const step = Math.min(distance, WALK_SPEED * dt);
  agent.position = [agent.position[0] + (dx / distance) * step, agent.position[1] + (dz / distance) * step];
  agent.moving = true;
}

function stepArtifacts(world: World) {
  world.artifacts = world.artifacts.filter((artifact) => {
    if (world.time - artifact.startedAt < artifact.duration) return true;
    emitSignal(world, artifact.signal);
    log(
      world,
      artifact.to,
      `${AGENTS[artifact.to].name} got ${artifact.kind === "flag" ? "the request to double-check" : "the findings"} from ${AGENTS[artifact.from].name}.`,
    );
    return false;
  });
}


export function stepWorld(world: World, dt: number): World {
  world.time += dt;
  if (world.time >= 0.6 && !world.signals.has("objective")) {
    emitSignal(world, "objective");
    log(world, "user", "You asked the team a question.", true);
  }
  const requestedAt = world.signals.get("budget-request");
  if (
    requestedAt !== undefined &&
    !world.signals.has("budget") &&
    world.time - requestedAt >= BUDGET_AUTO_CONFIRM_SECONDS
  ) {
    confirmBudget(world);
  }
  for (const id of AGENT_ORDER) stepAgent(world, world.agents[id], dt);
  stepArtifacts(world);
  stepModules(world);

  const finished = AGENT_ORDER.every(
    (id) => world.agents[id].actionIndex >= SCRIPT[id].length,
  );
  if (finished && world.endedAt === null) world.endedAt = world.time;
  if (world.endedAt !== null && world.time - world.endedAt >= LOOP_RESTART_DELAY - DISSOLVE_SECONDS - 0.5) {
    for (const id of world.moduleOrder) removeModule(world, id);
  }
  if (world.endedAt !== null && world.time - world.endedAt >= LOOP_RESTART_DELAY) {
    return createWorld(world.cycle + 1);
  }
  return world;
}

export function coreState(world: World): CoreState {
  const has = (signal: string) => world.signals.has(signal);
  if (has("recommendation")) return "completed";
  if (has("synthesis")) return "converging";
  if (has("challenge") && !has("retry-done")) return "uncertain";
  if (has("plan")) {
    const planAt = world.signals.get("plan") ?? 0;
    return world.time - planAt < 3 ? "delegating" : "processing";
  }
  if (world.agents.nova.state === "working") return "planning";
  if (world.agents.nova.state === "moving" || world.agents.nova.state === "assigned") {
    return "interpreting";
  }
  if (has("objective")) return "listening";
  return "dormant";
}

export function scenarioWeights(world: World): ScenarioWeights | null {
  if (!world.signals.has("scenarios")) return null;
  if (world.signals.has("shift")) return { direct: 0.18, partnership: 0.62, delay: 0.2 };
  return { direct: 0.38, partnership: 0.36, delay: 0.26 };
}

export function budgetPending(world: World): boolean {
  return world.signals.has("budget-request") && !world.signals.has("budget");
}

export function moduleHeadline(world: World, id: ModuleId): ModuleHeadline | null {
  let latest: ModuleHeadline | null = null;
  let latestAt = -1;
  for (const entry of MODULE_HEADLINES[id] ?? []) {
    const at = world.signals.get(entry.signal);
    if (at !== undefined && at >= latestAt) {
      latest = entry;
      latestAt = at;
    }
  }
  return latest;
}
