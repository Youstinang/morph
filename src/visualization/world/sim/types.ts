export type Vec2 = readonly [x: number, z: number];

export { AGENT_STATES, type AgentState } from "@/state/domain";
import type { AgentTarget, Travel } from "@/events/schema";
import type { AgentState } from "@/state/domain";

export type AgentId = "nova" | "orion" | "sage" | "brix" | "vex" | "lume";

/** Modules are configured at runtime, so their ids are open strings rather than a fixed union. */
export type ModuleId = string;

/** Deck neighborhood a module joins; domain-neutral so any objective can use it. */
export type ModuleGroup = "research" | "analysis" | "decision";

/** Registered workstation model a module renders with. */
export type ModuleStation = "console" | "table" | "hologram" | "platform";

/** Child visualization surface shown above the station. */
export type ModuleSurface = "panel" | "scenarios";

export type ModuleEmphasis = "normal" | "emphasized" | "muted";

export interface ModuleSpec {
  id: ModuleId;
  title: string;
  group: ModuleGroup;
  station: ModuleStation;
  surface: ModuleSurface;
  color: string;
}

export interface ModuleHeadline {
  headline: string;
  detail: string;
}

export interface ModuleRuntime {
  spec: ModuleSpec;
  /** False while the slot is reserved but the module has not materialized yet. */
  visible: boolean;
  appearedAt: number;
  removedAt: number | null;
  emphasis: ModuleEmphasis;
  collapsed: boolean;
  /** Requested size, 0.7–1.15. */
  size: number;
  activity: number;
  evidence: number;
  /** What the floating panel says; set by `module_updated` events. */
  headline: ModuleHeadline | null;
  /** Layout result: target floor position, bearing from the Core, and the crowding scale. */
  position: Vec2;
  bearing: number;
  layoutScale: number;
  /** Footprint scale at rest after the last layout: size × emphasis × collapse × crowding. */
  restScale: number;
  /** Set when the layout moves or resizes the module; it travels from here to `position`. */
  transit: ModuleTransit | null;
  /** The module that took this one's slot; it dissolves in place, out of the layout. */
  replacedBy: ModuleId | null;
}

/**
 * A layout move. Neighbours glide along the arc around the Core; a module that changes neighborhood
 * is lifted and carried over the others, so it never crosses the Core or another station.
 */
export interface ModuleTransit {
  from: Vec2;
  fromBearing: number;
  startedAt: number;
  duration: number;
  lifted: boolean;
  /** Carry height (0–1) at the start, so a redirected carry stays in the air. */
  fromHeight: number;
  /** Footprint and crowding scale at the start; they change in step with the travel. */
  fromScale: number;
  fromCrowd: number;
}

/** Where a module is drawn right now. */
export interface ModulePose {
  position: Vec2;
  bearing: number;
  /** Height above the deck while carried, and the matching shrink (1 = full size). */
  lift: number;
  carry: number;
  /** Footprint scale (size × emphasis × collapse × crowding) and crowding scale, before carrying. */
  scale: number;
  crowd: number;
  /** 0 → 1 over the move; 1 when at rest. */
  progress: number;
}

/** A coordinated reshuffle announced by `workspace_morph_started`; ends at `workspace_morph_completed`. */
export interface WorldMorph {
  startedAt: number;
  endedAt: number | null;
  reason: string;
}

export type ModuleStatus = "reserved" | "materializing" | "moving" | "active" | "idle" | "collapsed" | "dissolving";

export type ModuleChange =
  | { op: "create"; spec: ModuleSpec; visible?: boolean; replaces?: ModuleId }
  | { op: "reveal"; id: ModuleId }
  | { op: "remove"; id: ModuleId }
  | { op: "emphasize"; id: ModuleId; emphasis: ModuleEmphasis }
  | { op: "collapse"; id: ModuleId; collapsed: boolean }
  | { op: "resize"; id: ModuleId; size: number }
  | { op: "move"; id: ModuleId; group: ModuleGroup }
  | { op: "retitle"; id: ModuleId; title: string };

export type CoreState =
  | "dormant"
  | "listening"
  | "interpreting"
  | "planning"
  | "delegating"
  | "processing"
  | "uncertain"
  | "converging"
  | "completed"
  | "waiting"
  | "error";

export type ArtifactKind = "evidence" | "insight" | "flag";

export type Target = { zone: ModuleId } | { core: true } | { home: true };

export type Action =
  | { kind: "wait"; seconds: number }
  | { kind: "waitFor"; signal: string; task?: string }
  | {
      kind: "moveTo";
      target: Target;
      task: string;
      state?: "moving" | "returning" | "retrying";
    }
  | {
      kind: "hold";
      seconds: number;
      state: AgentState;
      task: string;
      zone?: ModuleId;
      evidence?: number;
    }
  | { kind: "emit"; signal: string }
  | {
      kind: "handoff";
      to: AgentId;
      artifact: ArtifactKind;
      signal: string;
      task: string;
    };

/** An agent as the world shows it: where it is, which way it faces and the state it acts out. */
export interface AgentRuntime {
  id: AgentId;
  position: [number, number];
  facing: number;
  state: AgentState;
  task: string;
  moving: boolean;
  zone: ModuleId | null;
  route: [number, number][];
  /** The current assignment, from `agent_assigned` until the world reports `agent_arrived`. */
  trip: { target: AgentTarget; travel: Travel; elapsed: number; started: boolean } | null;
  /** Agent this one faces while handing something over. */
  facingAgent: AgentId | null;
}

export interface ArtifactFlight {
  id: string;
  kind: ArtifactKind;
  from: AgentId;
  to: AgentId;
  start: [number, number];
  startedAt: number;
  duration: number;
}

/** An agent catching a landed data card; drives the catch pulse. */
export interface ArtifactCatch {
  agentId: AgentId;
  kind: ArtifactKind;
  from: AgentId;
  at: number;
}

/**
 * The card an agent was working on when its task failed. It stays at the station, cracked and grey, until
 * the agent finishes that work, then fades.
 */
export interface FailedCard {
  agentId: AgentId;
  zone: ModuleId | null;
  position: Vec2;
  failedAt: number;
  clearedAt: number | null;
}

/** Agents working together at one place, with the point their shared hologram floats over. */
export interface Collaboration {
  agents: AgentId[];
  hub: Vec2;
  atCore: boolean;
}

export interface LogEntry {
  id: number;
  time: number;
  agent: AgentId | "user" | "system";
  text: string;
  /** A story beat worth narrating, as opposed to a routine step. */
  beat: boolean;
}

/** One possible path as the Possibility Engine shows it. `weight` is the team's assessment, not a probability. */
export interface ScenarioView {
  id: string;
  label: string;
  weight: number;
  /** How many findings the path rests on, and its main risk. */
  evidence: number;
  risk: string | null;
}

/** The user's answer travelling from the asker's question panel into the Core. */
export interface AnswerCard {
  /** Where the asker stood when the answer came. */
  from: Vec2;
  startedAt: number;
}

/** What the world has been told about the run so far; drives the Core, the options display and the question cue. */
export interface StoryView {
  objectiveAt: number | null;
  planningAt: number | null;
  planAt: number | null;
  challengeOpen: boolean;
  synthesisAt: number | null;
  answeredAt: number | null;
  /** Questions waiting for the user, and who asked the oldest one; the question panel stands beside them. */
  openInputs: { requestId: string; askedBy: AgentId }[];
  /** The paths in the order they were laid out, and when their weights last shifted. */
  scenarios: ScenarioView[];
  scenarioShiftAt: number | null;
  /** The run is paused on something outside the team's reach, or has failed. */
  waitingAt: number | null;
  failedAt: number | null;
}

/** The world layer's state. It changes only in response to events and through its own animation. */
export interface World {
  time: number;
  cycle: number;
  agents: Record<AgentId, AgentRuntime>;
  modules: Record<ModuleId, ModuleRuntime>;
  /** Creation order; also the stable order within each layout neighborhood. */
  moduleOrder: ModuleId[];
  /** Bumped whenever modules are added, removed or re-laid out. */
  layoutVersion: number;
  artifacts: ArtifactFlight[];
  /** Recent catches, kept briefly for the catch pulse. */
  catches: ArtifactCatch[];
  failedCards: FailedCard[];
  answerCards: AnswerCard[];
  story: StoryView;
  /** The latest reshuffle, if any. */
  morph: WorldMorph | null;
}
