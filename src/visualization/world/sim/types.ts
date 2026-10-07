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
}

export type ModuleStatus = "reserved" | "materializing" | "active" | "idle" | "collapsed" | "dissolving";

export type ModuleChange =
  | { op: "create"; spec: ModuleSpec; visible?: boolean }
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

export interface LogEntry {
  id: number;
  time: number;
  agent: AgentId | "user" | "system";
  text: string;
  /** A story beat worth narrating, as opposed to a routine step. */
  beat: boolean;
}

export interface ScenarioWeights {
  direct: number;
  partnership: number;
  delay: number;
}

/** What the world has been told about the run so far; drives the Core, the options display and the budget cue. */
export interface StoryView {
  objectiveAt: number | null;
  planningAt: number | null;
  planAt: number | null;
  challengeOpen: boolean;
  synthesisAt: number | null;
  answeredAt: number | null;
  budgetPending: boolean;
  scenarios: ScenarioWeights | null;
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
  story: StoryView;
}
