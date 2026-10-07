import type { AgentState } from "../sim/types";

export interface Pose {
  armLx: number;
  armLz: number;
  elbowL: number;
  armRx: number;
  armRz: number;
  elbowR: number;
  spineX: number;
  headX: number;
  headY: number;
}

const REST: Pose = {
  armLx: 0.05,
  armLz: 0.1,
  elbowL: -0.18,
  armRx: 0.05,
  armRz: -0.1,
  elbowR: -0.18,
  spineX: 0,
  headX: 0,
  headY: 0,
};

/** Target joint angles for a state; `t` is seconds, used for small purposeful oscillations. */
export function poseFor(state: AgentState, t: number, moving: boolean): Pose {
  if (moving) {
    if (state === "retrying") return { ...REST, spineX: 0.12, headX: 0.05 };
    return { ...REST, spineX: 0.06 };
  }
  switch (state) {
    case "assigned":
      return { ...REST, armRx: -0.5, elbowR: -1.1, armRz: -0.2, headX: -0.12, spineX: -0.04 };
    case "working":
      return {
        ...REST,
        armLx: -1.0 + Math.sin(t * 5.2) * 0.12,
        armLz: 0.18,
        elbowL: -0.75,
        armRx: -1.15 + Math.sin(t * 5.2 + 1.7) * 0.12,
        armRz: -0.18,
        elbowR: -0.6,
        spineX: 0.1,
        headX: 0.12,
        headY: Math.sin(t * 0.9) * 0.18,
      };
    case "retrying":
      return {
        ...REST,
        armLx: -1.05 + Math.sin(t * 8) * 0.16,
        elbowL: -0.8,
        armRx: -1.2 + Math.sin(t * 8 + 1.4) * 0.16,
        elbowR: -0.65,
        spineX: 0.14,
        headX: 0.14,
      };
    case "evaluating":
      return {
        ...REST,
        armRx: -1.45,
        armRz: -0.05,
        elbowR: -0.08,
        armLx: 0.1,
        armLz: 0.38,
        elbowL: -1.3,
        spineX: 0.04,
        headX: 0.06,
        headY: Math.sin(t * 1.6) * 0.25,
      };
    case "collaborating":
      return {
        ...REST,
        armLx: -0.8 + Math.sin(t * 2) * 0.1,
        armLz: 0.3,
        elbowL: -0.5,
        armRx: -0.75 + Math.sin(t * 2 + 2) * 0.1,
        armRz: -0.3,
        elbowR: -0.55,
        headY: Math.sin(t * 0.8) * 0.3,
      };
    case "handoff":
      return { ...REST, armRx: -1.4, armRz: -0.12, elbowR: -0.12, spineX: 0.08, headX: 0.05 };
    case "waiting":
      return {
        ...REST,
        armLx: -0.55,
        armLz: -0.32,
        elbowL: -1.75,
        armRx: -0.5,
        armRz: 0.32,
        elbowR: -1.75,
        headY: Math.sin(t * 0.7) * 0.35,
      };
    case "blocked":
      return { ...REST, armLx: -0.5, armLz: -0.3, elbowL: -1.7, armRx: -0.5, armRz: 0.3, elbowR: -1.7, headX: 0.25 };
    case "failed":
      return { ...REST, armLx: 0.12, armRx: 0.12, elbowL: -0.05, elbowR: -0.05, spineX: 0.28, headX: 0.5 };
    case "completed":
      return { ...REST, armRx: -2.4, armRz: -0.25, elbowR: -0.5, headX: -0.15, spineX: -0.06 };
    case "idle":
    case "moving":
    case "returning":
      return { ...REST, headY: Math.sin(t * 0.5) * 0.12 };
  }
}
