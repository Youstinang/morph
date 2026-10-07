import { agentChange } from "@/events/agents";
import type { AgentTarget, EventDraft, WorkspaceEvent } from "@/events/schema";
import { createCameraDirection, directCamera } from "./camera-director";
import { createModule, moduleSpot, removeModule, applyModuleChange, stepModules } from "./modules";
import { AGENT_ORDER, CORE_RADIUS, coreSpot, homePosition } from "./roster";
import { presentationFor } from "./presentation";
import type { AgentId, AgentRuntime, AgentState, Collaboration, CoreState, ModuleHeadline, ModuleId, ScenarioView, StoryView, Vec2, World } from "./types";

export const WALK_SPEED = 3.4;
export const ASSIGN_PAUSE = 0.55;
export const HANDOFF_SECONDS = 1.6;
/** How long a catch pulse and a cleared failed card stay visible. */
export const CATCH_SECONDS = 1.2;
export const CARD_FADE_SECONDS = 1.5;
/** An answer card's flight into the Core, then its landing glow. */
export const ANSWER_FLIGHT_SECONDS = 1.4;
export const ANSWER_GLOW_SECONDS = 1.2;

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
  openInputs: [],
  scenarios: [],
  scenarioShiftAt: null,
  waitingAt: null,
  failedAt: null,
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
  return { time: 0, cycle, agents, modules: {}, moduleOrder: [], layoutVersion: 0, artifacts: [], catches: [], failedCards: [], answerCards: [], story: emptyStory(), morph: null, camera: createCameraDirection() };
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
  reactToStory(world, event, report);
  directCamera(world, event);
}

function reactToStory(world: World, event: WorkspaceEvent, report: WorldReport): void {
  const change = agentChange(event);
  if (change && isAgent(world, change.agentId)) {
    const agent = world.agents[change.agentId];
    agent.state = change.state;
    if (change.task !== undefined) agent.task = change.task;
    if (change.moduleId !== undefined) agent.zone = change.moduleId;
    if (event.type !== "agent_move_started") agent.facingAgent = null;
  }

  const story = world.story;
  if (event.type === "task_failed" && isAgent(world, event.agentId)) leaveFailedCard(world, world.agents[event.agentId]);
  if (event.type === "task_completed" && isAgent(world, event.agentId)) {
    for (const card of world.failedCards) if (card.agentId === event.agentId && card.clearedAt === null) card.clearedAt = world.time;
  }
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
      const replaces = event.type === "module_created" ? event.replaces : undefined;
      createModule(world, { id, title, group, ...presentationFor(kind) }, event.type === "module_created", replaces);
      return;
    }
    case "workspace_morph_started":
      world.morph = { startedAt: world.time, endedAt: null, reason: event.reason };
      return;
    case "workspace_morph_completed":
      if (world.morph && world.morph.endedAt === null) world.morph.endedAt = world.time;
      return;
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
    case "run_waiting":
      story.waitingAt = world.time;
      return;
    case "run_failed":
      story.failedAt = world.time;
      return;
    case "recommendation_updated":
      if (event.recommendation.status === "final") story.answeredAt = world.time;
      return;
    case "human_input_requested":
      if (isAgent(world, event.askedBy)) story.openInputs = [...story.openInputs, { requestId: event.requestId, askedBy: event.askedBy }];
      return;
    case "human_input_received":
    case "human_input_skipped": {
      const asked = story.openInputs.find((item) => item.requestId === event.requestId);
      story.openInputs = story.openInputs.filter((item) => item !== asked);
      if (asked && event.type === "human_input_received") {
        const [x, z] = world.agents[asked.askedBy].position;
        world.answerCards.push({ from: [x, z], startedAt: world.time });
      }
      return;
    }
    case "scenario_created":
    case "scenario_updated": {
      const { id, label, assessment, risk, evidenceIds } = event.scenario;
      const view: ScenarioView = { id, label, weight: assessment, evidence: evidenceIds?.length ?? 0, risk: risk ?? null };
      const known = story.scenarios.some((item) => item.id === id);
      story.scenarios = known ? story.scenarios.map((item) => (item.id === id ? view : item)) : [...story.scenarios, view];
      if (event.type === "scenario_updated") story.scenarioShiftAt = world.time;
      return;
    }
    default:
      return;
  }
}

/**
 * Leaves the agent's failed work beside it at the station, once per failure streak. It sits to the side
 * nearer the front of the deck, so the agent and the station don't hide it in the overview.
 */
function leaveFailedCard(world: World, agent: AgentRuntime) {
  if (world.failedCards.some((card) => card.agentId === agent.id && card.clearedAt === null)) return;
  const mod = agent.zone ? world.modules[agent.zone] : undefined;
  const toward = mod ? mod.position : ([0, 0] as const);
  const dx = toward[0] - agent.position[0];
  const dz = toward[1] - agent.position[1];
  const length = Math.hypot(dx, dz) || 1;
  let [sx, sz] = [-dz / length, dx / length];
  if (sz < 0) [sx, sz] = [-sx, -sz];
  world.failedCards.push({
    agentId: agent.id,
    zone: agent.zone,
    position: [agent.position[0] + sx * 0.9, agent.position[1] + sz * 0.9],
    failedAt: world.time,
    clearedAt: null,
  });
}

const TOGETHER = new Set<AgentState>(["collaborating", "working", "evaluating"]);

/** Where streams meet the Intent Core's shell, measured from its axis. */
const CORE_SURFACE = 1.3;

/**
 * Agents working together: at least one collaborating, with everyone active at the same place. At a station
 * they share a hologram between them; at the Core the Core itself is the shared structure, so the hub is the
 * point on its shell facing them.
 */
export function collaborations(world: World): Collaboration[] {
  const places = new Map<string, AgentId[]>();
  for (const id of AGENT_ORDER) {
    const agent = world.agents[id];
    if (!TOGETHER.has(agent.state) || agent.moving) continue;
    if (agent.zone === null && Math.hypot(agent.position[0], agent.position[1]) > CORE_RADIUS + 2.5) continue;
    const key = agent.zone ?? "core";
    places.set(key, [...(places.get(key) ?? []), id]);
  }
  const groups: Collaboration[] = [];
  for (const [place, ids] of places) {
    if (ids.length < 2 || !ids.some((id) => world.agents[id].state === "collaborating")) continue;
    let x = 0;
    let z = 0;
    for (const id of ids) {
      x += world.agents[id].position[0] / ids.length;
      z += world.agents[id].position[1] / ids.length;
    }
    if (place === "core") {
      const radius = Math.hypot(x, z) || 1;
      x = (x / radius) * CORE_SURFACE;
      z = (z / radius) * CORE_SURFACE;
    }
    groups.push({ agents: ids, hub: [x, z], atCore: place === "core" });
  }
  return groups;
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

/** If the module was re-laid out while the agent works there, the agent walks to its new spot, around the Core. */
function followModule(world: World, agent: AgentRuntime, zone: ModuleId, dt: number) {
  const spot = moduleSpot(world, zone, agent.id);
  if (!spot) return;
  if (Math.hypot(spot[0] - agent.position[0], spot[1] - agent.position[1]) < 0.02) {
    agent.route = [];
    return;
  }
  const goal = agent.route.at(-1);
  if (!goal || Math.hypot(goal[0] - spot[0], goal[1] - spot[1]) > 0.02) agent.route = planRoute(agent.position, spot);
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
      budget = 0;
    }
  }
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
      world.catches.push({ agentId: artifact.to, kind: artifact.kind, from: artifact.from, at: world.time });
      report({ type: "artifact_handoff_completed", artifactId: artifact.id, kind: artifact.kind, from: artifact.from, to: artifact.to });
    }
  }
  const answerLife = ANSWER_FLIGHT_SECONDS + ANSWER_GLOW_SECONDS;
  if (world.answerCards.some((card) => world.time - card.startedAt > answerLife)) world.answerCards = world.answerCards.filter((card) => world.time - card.startedAt <= answerLife);
  if (world.catches.some((c) => world.time - c.at > CATCH_SECONDS)) world.catches = world.catches.filter((c) => world.time - c.at <= CATCH_SECONDS);
  if (world.failedCards.some((card) => card.clearedAt !== null && world.time - card.clearedAt > CARD_FADE_SECONDS)) {
    world.failedCards = world.failedCards.filter((card) => card.clearedAt === null || world.time - card.clearedAt <= CARD_FADE_SECONDS);
  }
  stepModules(world);
}

export function coreState(world: World): CoreState {
  const story = world.story;
  if (story.failedAt !== null) return "error";
  if (story.answeredAt !== null) return "completed";
  if (story.waitingAt !== null) return "waiting";
  if (story.synthesisAt !== null) return "converging";
  if (story.challengeOpen) return "uncertain";
  if (story.planAt !== null) return world.time - story.planAt < 3 ? "delegating" : "processing";
  if (world.agents.nova.state === "working") return "planning";
  if (world.agents.nova.state === "moving" || world.agents.nova.state === "assigned") return "interpreting";
  if (story.objectiveAt !== null) return "listening";
  return "dormant";
}

/** The paths on the Possibility Engine, or null before any are laid out. */
export function scenarioViews(world: World): readonly ScenarioView[] | null {
  return world.story.scenarios.length > 0 ? world.story.scenarios : null;
}

/** The path the team currently rates highest, if one stands out. */
export function leadingScenario(world: World): string | null {
  const [first, second] = [...world.story.scenarios].sort((a, b) => b.weight - a.weight);
  return first && (!second || first.weight - second.weight >= 0.04) ? first.id : null;
}

/** Who is waiting on the user for an answer, if anyone. */
export function askingAgent(world: World): AgentId | null {
  return world.story.openInputs[0]?.askedBy ?? null;
}

export function moduleHeadline(world: World, id: ModuleId): ModuleHeadline | null {
  return world.modules[id]?.headline ?? null;
}
