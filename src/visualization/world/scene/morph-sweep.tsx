import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, type Mesh } from "three";
import { useReducedMotion } from "../motion";
import { CORE_RADIUS } from "../sim/roster";
import type { World } from "../sim/types";
import { geo } from "./geometry";

const SWEEP_SECONDS = 1.8;
const SWEEP_REACH = 12.5;

/** When a reshuffle is announced, a ring of light runs out from the Core across the deck to the stations. */
export function MorphSweep({ worldRef }: { worldRef: RefObject<World> }) {
  const reduced = useReducedMotion();
  const ring = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#9fe8ff",
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const mesh = ring.current;
    if (!mesh) return;
    const morph = worldRef.current.morph;
    const since = morph ? worldRef.current.time - morph.startedAt : Infinity;
    const active = !reduced && since >= 0 && since < SWEEP_SECONDS;
    mesh.visible = active;
    if (!active) return;
    const k = since / SWEEP_SECONDS;
    const eased = 1 - (1 - k) ** 2;
    mesh.scale.setScalar(CORE_RADIUS + (SWEEP_REACH - CORE_RADIUS) * eased);
    material.opacity = 0.55 * (1 - k);
  });

  return <mesh ref={ring} visible={false} material={material} geometry={geo.ring(0.97, 1)} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} />;
}
