"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { SkeletonHelper, type Bone, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AGENT_ORDER } from "@/visualization/world/sim/roster";
import type { AgentId } from "@/visualization/world/sim/types";

function Model({ id, x, showBones }: { id: AgentId; x: number; showBones: boolean }) {
  const { scene } = useGLTF(`/models/${id}.glb`);
  const model = useMemo(() => clone(scene), [scene]);
  const helper = useMemo(() => {
    const h = new SkeletonHelper(model);
    (h.material as { depthTest: boolean }).depthTest = false;
    return h;
  }, [model]);
  const bones = useMemo(() => {
    const map: Record<string, Bone> = {};
    model.traverse((o: Object3D) => {
      if ((o as Bone).isBone) map[o.name] = o as Bone;
    });
    return map;
  }, [model]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 5;
    const s = Math.sin(t);
    bones.thighL?.rotation.set(-s * 0.4, 0, 0);
    bones.thighR?.rotation.set(s * 0.4, 0, 0);
    bones.shinL?.rotation.set(Math.max(0, Math.sin(t + 1.4)) * 0.6, 0, 0);
    bones.shinR?.rotation.set(Math.max(0, Math.sin(t + 1.4 + Math.PI)) * 0.6, 0, 0);
    bones.upperArmL?.rotation.set(s * 0.25, 0, 0);
    bones.upperArmR?.rotation.set(-0.45 + Math.sin(t * 0.3) * 0.15, 0, 0);
    bones.forearmR?.rotation.set(-0.5, 0, 0);
    bones.head?.rotation.set(0, Math.sin(t * 0.2) * 0.5, 0);
  });

  return (
    <>
      <group position={[x, 0, 0]} scale={1.8}>
        <primitive object={model} />
      </group>
      {showBones && <primitive object={helper} />}
    </>
  );
}

const STATION_MODELS = ["hologram-core", "operator-console", "war-table"] as const;

function StationModel({ name, x }: { name: string; x: number }) {
  const { scene } = useGLTF(`/models/stations/${name}.glb`);
  return <primitive object={scene} position={[x, 0, 0]} scale={1.4} />;
}

export default function ModelLineup() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const showBones = params?.has("bones") ?? false;
  const only = AGENT_ORDER.find((id) => id === params?.get("only"));
  const stations = params?.has("stations") ?? false;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#07060d" }}>
      <Canvas camera={{ position: stations ? [0, 3.2, 7.5] : only ? [0.6, 1.3, 3.4] : [0, 1.4, 6.5], fov: 40 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 6]} intensity={2.6} />
        <directionalLight position={[-4, 3, -3]} intensity={1.2} color="#ff2fa8" />
        <Suspense fallback={null}>
          {stations && STATION_MODELS.map((name, i) => <StationModel key={name} name={name} x={(i - 1) * 3.4} />)}
          {!stations && (only ? [only] : AGENT_ORDER).map((id, i, ids) => (
            <Model key={id} id={id} x={ids.length === 1 ? 0 : (i - 2.5) * 1.15} showBones={showBones} />
          ))}
        </Suspense>
        <OrbitControls target={[0, 0.95, 0]} />
      </Canvas>
    </div>
  );
}
