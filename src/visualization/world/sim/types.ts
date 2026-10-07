export type Vec2 = readonly [x: number, z: number];

export const AGENT_STATES = [
  "idle",
  "assigned",
  "moving",
  "working",
  "waiting",
  "handoff",
  "collaborating",
  "evaluating",
  "blocked",
  "failed",
  "retrying",
  "completed",
  "returning",
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export type AgentId = "nova" | "orion" | "sage" | "brix" | "vex" | "lume";
export type ZoneId =
  | "market"
  | "competition"
  | "regulation"
  | "economics"
  | "risk"
  | "possibility";

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

export type Target = { zone: ZoneId } | { core: true } | { home: true };

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
      zone?: ZoneId;
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
  zone: ZoneId | null;
  route: [number, number][];
  actionIndex: number;
  actionElapsed: number;
  actionStarted: boolean;
  hasWorked: boolean;
}

export interface ZoneRuntime {
  id: ZoneId;
  visible: boolean;
  appearedAt: number;
  activity: number;
  evidence: number;
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
  zones: Record<ZoneId, ZoneRuntime>;
  signals: Map<string, number>;
  artifacts: ArtifactFlight[];
  log: LogEntry[];
  nextId: number;
  endedAt: number | null;
}
