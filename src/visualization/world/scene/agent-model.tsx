import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import { PointLight, type Bone, type Mesh, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AGENT_ORDER, AGENTS } from "../sim/roster";
import type { AgentId } from "../sim/types";
import type { Pose } from "./poses";

/** Model-space height of a rigged agent before the roster's height factor. */
export const MODEL_HEIGHT = 1.85;

/**
 * The auto-rig weights are distance-based, so large rotations tear coats and held props.
 * Pose angles are scaled and clamped to the range that deforms cleanly.
 */
const ARM_GAIN = 0.6;
const ARM_RAISE_LIMIT = -1.0;
const ELBOW_GAIN = 0.6;
const LEG_GAIN = 0.7;
const REST_ARM_Z = 0.1;
const REST_ELBOW = -0.18;

const BONE_NAMES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upperArmL",
  "upperArmR",
  "forearmL",
  "forearmR",
  "handR",
  "thighL",
  "thighR",
  "shinL",
  "shinR",
] as const;
type BoneName = (typeof BONE_NAMES)[number];

export interface BodyMotion {
  phase: number;
  walk: number;
  active: boolean;
  appear: number;
  pose: Pose;
}

const modelUrl = (id: AgentId) => `/models/${id}.glb`;

export function preloadAgentModels() {
  for (const id of AGENT_ORDER) useGLTF.preload(modelUrl(id));
}

export function AgentModel({ id, motion }: { id: AgentId; motion: RefObject<BodyMotion> }) {
  const look = AGENTS[id].look;
  const { scene } = useGLTF(modelUrl(id));
  const model = useMemo(() => clone(scene), [scene]);
  const bones = useMemo(() => {
    const found: Partial<Record<BoneName, Bone>> = {};
    model.traverse((object: Object3D) => {
      if ((object as Bone).isBone && (BONE_NAMES as readonly string[]).includes(object.name)) {
        found[object.name as BoneName] = object as Bone;
      }
      if ((object as Mesh).isMesh) object.frustumCulled = false;
    });
    return found;
  }, [model]);
  const light = useMemo(() => new PointLight(look.accent, 0.6, 2.6, 2), [look.accent]);

  useEffect(() => {
    const hand = bones.handR;
    if (!hand) return;
    hand.add(light);
    return () => {
      hand.remove(light);
      light.dispose();
    };
  }, [bones, light]);

  useFrame(({ clock }) => {
    const { phase, walk: w, active, appear, pose: p } = motion.current;
    const t = clock.elapsedTime;
    const s = Math.sin(phase);
    const arm = (x: number) => Math.max(ARM_RAISE_LIMIT, x * ARM_GAIN);

    bones.thighL?.rotation.set(-s * 0.62 * LEG_GAIN * w, 0, 0);
    bones.thighR?.rotation.set(s * 0.62 * LEG_GAIN * w, 0, 0);
    bones.shinL?.rotation.set(Math.max(0, Math.sin(phase + 1.4)) * LEG_GAIN * w, 0, 0);
    bones.shinR?.rotation.set(Math.max(0, Math.sin(phase + 1.4 + Math.PI)) * LEG_GAIN * w, 0, 0);
    bones.hips?.rotation.set(0, s * 0.09 * w, 0);

    bones.upperArmL?.rotation.set(arm(p.armLx + s * 0.5 * w), 0, (p.armLz - REST_ARM_Z) * ARM_GAIN);
    bones.upperArmR?.rotation.set(arm(p.armRx - s * 0.5 * w), 0, (p.armRz + REST_ARM_Z) * ARM_GAIN);
    bones.forearmL?.rotation.set((p.elbowL - REST_ELBOW - 0.3 * w) * ELBOW_GAIN, 0, 0);
    bones.forearmR?.rotation.set((p.elbowR - REST_ELBOW - 0.3 * w) * ELBOW_GAIN, 0, 0);

    bones.spine?.rotation.set(p.spineX * 0.6 + Math.sin(t * 1.7) * 0.01, -s * 0.07 * w, 0);
    bones.chest?.rotation.set(p.spineX * 0.4, 0, 0);
    bones.head?.rotation.set(p.headX, p.headY, 0);

    model.position.y = Math.abs(Math.cos(phase)) * 0.025 * w;
    light.intensity = (active ? 2.2 : 0.6) * appear;
  });

  return <primitive object={model} scale={MODEL_HEIGHT * look.height} />;
}
