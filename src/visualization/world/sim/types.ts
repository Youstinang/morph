export type Vec2 = readonly [x: number, z: number];

export { AGENT_STATES, type AgentState } from "@/state/domain";
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
  | { op: "resize"; id: ModuleId; size: number };

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
  | { kind: "emit"; signal: string; log?: string }
  | {
      kind: "handoff";
      to: AgentId;
      artifact: ArtifactKind;
      signal: string;
      task: string;
    };

export interface AgentRuntime {
  id: AgentId;
  position: [number, number];
  facing: number;
  state: AgentState;
  task: string;
  progress: number;
  moving: boolean;
  zone: ModuleId | null;
  route: [number, number][];
  actionIndex: number;
  actionElapsed: number;
  actionStarted: boolean;
  hasWorked: boolean;
}

export interface ArtifactFlight {
  id: number;
  kind: ArtifactKind;
  from: AgentId;
  to: AgentId;
  start: [number, number];
  startedAt: number;
  duration: number;
  signal: string;
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

export interface World {
  time: number;
  cycle: number;
  agents: Record<AgentId, AgentRuntime>;
  modules: Record<ModuleId, ModuleRuntime>;
  /** Creation order; also the stable order within each layout neighborhood. */
  moduleOrder: ModuleId[];
  /** Bumped whenever modules are added, removed or re-laid out. */
  layoutVersion: number;
  signals: Map<string, number>;
  artifacts: ArtifactFlight[];
  log: LogEntry[];
  nextId: number;
  endedAt: number | null;
}
