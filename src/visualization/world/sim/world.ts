import { agentChange } from "@/events/agents";
import type { AgentTarget, EventDraft, WorkspaceEvent } from "@/events/schema";
import { createModule, moduleSpot, removeModule, applyModuleChange, stepModules } from "./modules";
import { AGENT_ORDER, CORE_RADIUS, coreSpot, homePosition } from "./roster";
import { presentationFor } from "./script";
import type { AgentId, AgentRuntime, AgentState, CoreState, ModuleHeadline, ModuleId, ScenarioWeights, StoryView, Vec2, World } from "./types";

export const WALK_SPEED = 3.4;
export const ASSIGN_PAUSE = 0.55;
export const HANDOFF_SECONDS = 1.4;

/** Publishes a physical report (arrival, landed handoff) back onto the bus. */
export type WorldReport = (draft: EventDraft) => void;

/** States in which an agent stands at its work and faces it. */
const AT_WORK = new Set<AgentState>(["working", "evaluating", "collaborating", "completed", "failed", "retrying"]);

const emptyStory = (): StoryView => ({
  objectiveAt: null,
  planningAt: null,
  planAt: null,
  challengeOpen: false,
  synthesisAt: null,
  answeredAt: null,
  budgetPending: false,
  scenarios: null,
});

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
      moving: false,
      zone: null,
      route: [],
      trip: null,
      facingAgent: null,
    };
  }
  return { time: 0, cycle, agents, modules: {}, moduleOrder: [], layoutVersion: 0, artifacts: [], story: emptyStory() };
}

const isAgent = (world: World, id: string): id is AgentId => id in world.agents;

export function resolveTarget(world: World, id: AgentId, target: AgentTarget): Vec2 {
  if (target.kind === "module") return moduleSpot(world, target.moduleId, id) ?? coreSpot(id);
  if (target.kind === "core") return coreSpot(id);
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

/**
 * The world's reaction to one event. This is the only way story facts reach the world; everything else it
 * does is animation toward what it has been told. Record events reach it only after the operation gate
 * accepted the operation behind them.
 */
export function reactToEvent(world: World, event: WorkspaceEvent, report: WorldReport): void {
  const change = agentChange(event);
  if (change && isAgent(world, change.agentId)) {
    const agent = world.agents[change.agentId];
    agent.state = change.state;
    if (change.task !== undefined) agent.task = change.task;
    if (change.moduleId !== undefined) agent.zone = change.moduleId;
    if (event.type !== "agent_move_started") agent.facingAgent = null;
  }

  const story = world.story;
  switch (event.type) {
    case "agent_assigned": {
      if (!isAgent(world, event.agentId)) return;
      const agent = world.agents[event.agentId];
      agent.route = planRoute(agent.position, resolveTarget(world, agent.id, event.target));
      agent.trip = { target: event.target, travel: event.travel, elapsed: 0, started: event.travel === "returning" };
      if (agent.trip.started) report({ type: "agent_move_started", agentId: agent.id, target: event.target, travel: event.travel });
      return;
    }
    case "agent_work_started":
    case "task_completed":
    case "task_failed":
    case "retry_started":
    case "agent_waiting":
    case "agent_idle":
      if (isAgent(world, event.agentId)) world.agents[event.agentId].trip = null;
      return;
    case "artifact_handoff_started": {
      if (!isAgent(world, event.from) || !isAgent(world, event.to)) return;
      const from = world.agents[event.from];
      from.facingAgent = event.to;
      world.artifacts.push({
        id: event.artifactId,
        kind: event.kind,
        from: event.from,
        to: event.to,
        start: [from.position[0], from.position[1]],
        startedAt: world.time,
        duration: HANDOFF_SECONDS,
      });
      return;
    }
    case "sources_checked": {
      const mod = world.modules[event.moduleId];
      if (mod) mod.evidence = Math.max(mod.evidence, event.total);
      return;
    }
    case "module_reserved":
    case "module_created": {
      const { id, title, kind, group } = event.module;
      createModule(world, { id, title, group, ...presentationFor(kind) }, event.type === "module_created");
      return;
    }
    case "module_updated": {
      const mod = world.modules[event.moduleId];
      if (!mod) return;
      const { summary, collapsed, title } = event.changes;
      if (summary !== undefined) mod.headline = summary;
      if (title !== undefined) applyModuleChange(world, { op: "retitle", id: event.moduleId, title });
      if (collapsed !== undefined) applyModuleChange(world, { op: "collapse", id: event.moduleId, collapsed });
      return;
    }
    case "module_moved":
      applyModuleChange(world, { op: "move", id: event.moduleId, group: event.group });
      return;
    case "module_resized":
      applyModuleChange(world, { op: "resize", id: event.moduleId, size: event.size });
      return;
    case "module_emphasized":
      applyModuleChange(world, { op: "emphasize", id: event.moduleId, emphasis: event.emphasis });
      return;
    case "module_removed":
      removeModule(world, event.moduleId);
      return;
    case "objective_received":
      story.objectiveAt = world.time;
      return;
    case "planning_started":
      story.planningAt = world.time;
      return;
    case "plan_created":
      story.planAt = world.time;
      return;
    case "assumption_challenged":
      story.challengeOpen = true;
      return;
    case "assumption_resolved":
      story.challengeOpen = false;
      return;
    case "synthesis_started":
      story.synthesisAt = world.time;
      return;
    case "recommendation_updated":
      if (event.recommendation.status === "final") story.answeredAt = world.time;
      return;
    case "human_input_requested":
      story.budgetPending = true;
      return;
    case "human_input_received":
      story.budgetPending = false;
      return;
    case "scenario_created":
    case "scenario_updated":
      story.scenarios = { ...story.scenarios, [event.scenario.id]: event.scenario.assessment } as ScenarioWeights;
      return;
    default:
      return;
  }
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

function walk(world: World, agent: AgentRuntime, dt: number, report: WorldReport) {
  const trip = agent.trip!;
  if (!trip.started) {
    trip.elapsed += dt;
    const next = agent.route[0];
    if (next) faceToward(agent, next);
    if (trip.elapsed < ASSIGN_PAUSE) return;
    trip.started = true;
    report({ type: "agent_move_started", agentId: agent.id, target: trip.target, travel: trip.travel });
  }
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
      agent.position = [agent.position[0] + (dx / distance) * budget, agent.position[1] + (dz / distance) * budget];
      agent.facing = Math.atan2(dx, dz);
      budget = 0;
    }
  }
  if (agent.route.length > 0) {
    agent.moving = true;
    return;
  }
  agent.trip = null;
  report({ type: "agent_arrived", agentId: agent.id, target: trip.target });
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

/** Advances the world's animation by `dt`; the clock itself is set by the session. */
export function stepWorld(world: World, dt: number, report: WorldReport): void {
  for (const id of AGENT_ORDER) {
    const agent = world.agents[id];
    agent.moving = false;
    if (agent.trip) {
      walk(world, agent, dt, report);
    } else if (agent.state === "handoff" && agent.facingAgent) {
      faceToward(agent, world.agents[agent.facingAgent].position);
    } else if (AT_WORK.has(agent.state)) {
      const mod = agent.zone ? world.modules[agent.zone] : undefined;
      if (agent.zone) followModule(world, agent, agent.zone, dt);
      faceToward(agent, mod ? mod.position : [0, 0]);
    } else if (agent.state === "idle" || agent.state === "waiting") {
      faceOutwardAtHome(agent);
    }
  }
  const landed = world.artifacts.filter((artifact) => world.time - artifact.startedAt >= artifact.duration);
  if (landed.length > 0) {
    world.artifacts = world.artifacts.filter((artifact) => !landed.includes(artifact));
    for (const artifact of landed) {
      report({ type: "artifact_handoff_completed", artifactId: artifact.id, kind: artifact.kind, from: artifact.from, to: artifact.to });
    }
  }
  stepModules(world);
}

export function coreState(world: World): CoreState {
  const story = world.story;
  if (story.answeredAt !== null) return "completed";
  if (story.synthesisAt !== null) return "converging";
  if (story.challengeOpen) return "uncertain";
  if (story.planAt !== null) return world.time - story.planAt < 3 ? "delegating" : "processing";
  if (world.agents.nova.state === "working") return "planning";
  if (world.agents.nova.state === "moving" || world.agents.nova.state === "assigned") return "interpreting";
  if (story.objectiveAt !== null) return "listening";
  return "dormant";
}

export function scenarioWeights(world: World): ScenarioWeights | null {
  return world.story.scenarios;
}

export function budgetPending(world: World): boolean {
  return world.story.budgetPending;
}

export function moduleHeadline(world: World, id: ModuleId): ModuleHeadline | null {
  return world.modules[id]?.headline ?? null;
}
