import type { WorkspaceEvent } from "@/events/schema";
import type { AgentId, ModuleId, World } from "./types";

/**
 * The camera director: picks a shot for the story's big moments only (user choice 2026-10-07: gentle,
 * automatic, only for big moments). Shots come from real events, last a few seconds and then hand back to
 * the overview; routine work never moves the camera. A stronger moment may cut in on a weaker one, and no
 * new shot starts while the user has a question open, so the panel beside the asker stays put.
 */

export type ShotKind =
  | "focus_core"
  | "delegation"
  | "follow_agent"
  | "pull_back_for_morph"
  | "focus_module"
  | "follow_focus_agent"
  | "reveal_handoff"
  | "reveal_scenarios"
  | "focus_recommendation";

export type ShotSubject =
  | { kind: "core" }
  | { kind: "overview" }
  | { kind: "agent"; agentId: AgentId }
  | { kind: "pair"; agents: [AgentId, AgentId] }
  | { kind: "module"; moduleId: ModuleId }
  | { kind: "scenarios" };

export interface Shot {
  kind: ShotKind;
  subject: ShotSubject;
  startedAt: number;
  /** When the shot hands back to the overview; null holds it until something stronger comes. */
  until: number | null;
  priority: number;
}

export interface CameraDirection {
  shot: Shot | null;
  /** Whether the first agent setting off has been followed this run. */
  followed: boolean;
  /** Every shot this run, for tests and the steps list. */
  history: { kind: ShotKind; at: number }[];
}

export const createCameraDirection = (): CameraDirection => ({ shot: null, followed: false, history: [] });

/** How close each shot sits, relative to the overview distance; < 1 is closer, > 1 wider. */
export const SHOT_ZOOM: Record<ShotKind, number> = {
  focus_core: 0.74,
  delegation: 1.04,
  follow_agent: 0.62,
  pull_back_for_morph: 1.06,
  focus_module: 0.58,
  follow_focus_agent: 0.6,
  reveal_handoff: 0.64,
  reveal_scenarios: 0.64,
  focus_recommendation: 0.82,
};

const isAgent = (world: World, id: string): id is AgentId => id in world.agents;

function propose(world: World, kind: ShotKind, subject: ShotSubject, seconds: number | null, priority: number) {
  const direction = world.camera;
  const now = world.time;
  if (world.story.openInputs.length > 0) return;
  const current = direction.shot && (direction.shot.until === null || direction.shot.until > now) ? direction.shot : null;
  if (current && current.priority > priority) return;
  if (current && current.kind === kind && JSON.stringify(current.subject) === JSON.stringify(subject)) {
    if (current.until !== null) current.until = seconds === null ? null : Math.max(current.until, now + seconds);
    return;
  }
  direction.shot = { kind, subject, startedAt: now, until: seconds === null ? null : now + seconds, priority };
  direction.history.push({ kind, at: now });
}

/** The world's camera reaction to one event. Called from `reactToEvent`, after the world has updated. */
export function directCamera(world: World, event: WorkspaceEvent): void {
  const story = world.story;
  switch (event.type) {
    case "objective_received":
      return propose(world, "focus_core", { kind: "core" }, 4, 1);
    case "plan_created":
      return propose(world, "delegation", { kind: "overview" }, 3.5, 1);
    case "agent_move_started": {
      if (world.camera.followed || story.planAt === null || event.travel !== "moving" || event.target.kind !== "module" || !isAgent(world, event.agentId)) return;
      world.camera.followed = true;
      return propose(world, "follow_agent", { kind: "agent", agentId: event.agentId }, 3, 2);
    }
    case "workspace_morph_started":
      if (story.planAt === null || world.time - story.planAt < 2) return;
      return propose(world, "pull_back_for_morph", { kind: "overview" }, 4, 3);
    case "camera_focus_requested": {
      const target = event.target;
      if (target.kind === "module") return propose(world, "focus_module", { kind: "module", moduleId: target.moduleId }, 4, 3);
      if (target.kind === "agent" && isAgent(world, target.agentId)) return propose(world, "follow_focus_agent", { kind: "agent", agentId: target.agentId }, 4, 3);
      return;
    }
    case "retry_requested":
      if (!isAgent(world, event.by) || !isAgent(world, event.agentId) || event.by === event.agentId) return;
      return propose(world, "reveal_handoff", { kind: "pair", agents: [event.by, event.agentId] }, 4, 4);
    case "scenario_created":
      if (story.scenarios.length !== 1) return;
      return propose(world, "reveal_scenarios", { kind: "scenarios" }, 5, 5);
    case "scenario_updated":
      return propose(world, "reveal_scenarios", { kind: "scenarios" }, 3.5, 5);
    case "recommendation_updated":
      if (event.recommendation.status !== "final") return;
      return propose(world, "focus_recommendation", { kind: "core" }, null, 6);
    default:
      return;
  }
}

/** Where the current shot looks, on the deck floor, or null for the overview. */
/** How high the camera aims for each shot; the paths' labels sit high above their branches. */
const AIM_HEIGHT: Partial<Record<ShotKind, number>> = { reveal_scenarios: 2.2 };

export function shotFocus(world: World): { point: [number, number]; zoom: number; height: number; kind: ShotKind } | null {
  const focus = shotPoint(world);
  return focus ? { ...focus, height: AIM_HEIGHT[focus.kind] ?? 1.3 } : null;
}

function shotPoint(world: World): { point: [number, number]; zoom: number; kind: ShotKind } | null {
  const shot = world.camera.shot;
  if (!shot || (shot.until !== null && world.time >= shot.until)) return null;
  const zoom = SHOT_ZOOM[shot.kind];
  const subject = shot.subject;
  switch (subject.kind) {
    case "overview":
      return { point: [0, -2.5], zoom, kind: shot.kind };
    case "core":
      return { point: [0, 0], zoom, kind: shot.kind };
    case "agent": {
      const [x, z] = world.agents[subject.agentId].position;
      return { point: [x, z], zoom, kind: shot.kind };
    }
    case "pair": {
      const [a, b] = subject.agents.map((id) => world.agents[id].position);
      return { point: [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2], zoom, kind: shot.kind };
    }
    case "module": {
      const mod = world.modules[subject.moduleId];
      return mod ? { point: [mod.position[0], mod.position[1]], zoom, kind: shot.kind } : null;
    }
    case "scenarios": {
      const id = world.moduleOrder.find((key) => world.modules[key]!.spec.surface === "scenarios" && world.modules[key]!.removedAt === null);
      const mod = id ? world.modules[id] : undefined;
      return mod ? { point: [mod.position[0], mod.position[1]], zoom, kind: shot.kind } : null;
    }
  }
}
