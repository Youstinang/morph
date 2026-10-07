import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointsMaterial,
  type Group,
  type Mesh,
  type PointLight,
  type Points,
} from "three";
import type { CoreState, World } from "../sim/types";
import { coreState } from "../sim/world";
import { geo } from "./geometry";

interface CoreLook {
  color: string;
  energy: number;
  spin: number;
  spread: number;
  coherence: number;
}

export const LOOKS: Record<CoreState, CoreLook> = {
  dormant: { color: "#3b4a5c", energy: 0.25, spin: 0.08, spread: 0.85, coherence: 0.2 },
  listening: { color: "#8fd0ff", energy: 0.8, spin: 0.25, spread: 1, coherence: 0.45 },
  interpreting: { color: "#a9dcff", energy: 1.1, spin: 0.5, spread: 1.05, coherence: 0.6 },
  planning: { color: "#ffd18a", energy: 1.6, spin: 0.9, spread: 0.9, coherence: 0.9 },
  delegating: { color: "#ffe2b0", energy: 1.9, spin: 1.2, spread: 1.35, coherence: 0.5 },
  processing: { color: "#8fd0ff", energy: 1.2, spin: 0.6, spread: 1.15, coherence: 0.55 },
  uncertain: { color: "#c3a2ff", energy: 1.0, spin: 0.35, spread: 1.3, coherence: 0.15 },
  converging: { color: "#f2f6ff", energy: 2.4, spin: 1.6, spread: 0.75, coherence: 1 },
  completed: { color: "#bfe8c9", energy: 1.3, spin: 0.3, spread: 0.95, coherence: 0.95 },
  error: { color: "#ff6b6b", energy: 1, spin: 0.2, spread: 1.2, coherence: 0.1 },
};

const PARTICLES = 900;

export function IntentCore({ worldRef }: { worldRef: RefObject<World> }) {
  const group = useRef<Group>(null);
  const inner = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);
  const rings = useRef<Group>(null);
  const points = useRef<Points>(null);
  const light = useRef<PointLight>(null);
  const live = useRef({ energy: 0.25, spin: 0.1, spread: 0.85, coherence: 0.2, color: new Color("#3b4a5c") });

  const resources = useMemo(() => {
    const base = new Float32Array(PARTICLES * 3);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < PARTICLES; i += 1) {
      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = 1.05 + random() * 0.9;
      const k = Math.sqrt(1 - u * u);
      base[i * 3] = Math.cos(theta) * k * r;
      base[i * 3 + 1] = u * r;
      base[i * 3 + 2] = Math.sin(theta) * k * r;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(base.slice(), 3));
    return {
      base,
      geometry,
      points: new PointsMaterial({
        size: 0.045,
        color: "#8fd0ff",
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      inner: new MeshStandardMaterial({
        color: "#0d1218",
        emissive: new Color("#8fd0ff"),
        emissiveIntensity: 1,
        roughness: 0.25,
        metalness: 0.9,
        flatShading: true,
      }),
      wire: new MeshBasicMaterial({
        color: "#8fd0ff",
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        toneMapped: false,
        depthWrite: false,
      }),
      ring: new MeshBasicMaterial({ color: "#8fd0ff", toneMapped: false, transparent: true, opacity: 0.9 }),
      base_ring: new MeshBasicMaterial({ color: "#8fd0ff", transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }),
    };
  }, []);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.points.dispose();
      resources.inner.dispose();
      resources.wire.dispose();
      resources.ring.dispose();
      resources.base_ring.dispose();
    },
    [resources],
  );

  const targetColor = useMemo(() => new Color(), []);

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const look = LOOKS[coreState(world)];
    const l = live.current;
    const dt = Math.min(delta, 0.05);
    const t = frame.clock.elapsedTime;
    l.energy = MathUtils.damp(l.energy, look.energy, 2.5, dt);
    l.spin = MathUtils.damp(l.spin, look.spin, 2, dt);
    l.spread = MathUtils.damp(l.spread, look.spread, 2, dt);
    l.coherence = MathUtils.damp(l.coherence, look.coherence, 2, dt);
    targetColor.set(look.color);
    l.color.lerp(targetColor, 1 - Math.exp(-dt * 2.5));

    if (group.current) group.current.position.y = 2.3 + Math.sin(t * 0.9) * 0.08;
    const breathe = 1 + Math.sin(t * 1.4) * 0.04 * l.energy;
    if (inner.current) {
      inner.current.rotation.y += dt * l.spin;
      inner.current.rotation.x += dt * l.spin * 0.4;
      inner.current.scale.setScalar(0.55 * breathe);
    }
    if (shell.current) {
      shell.current.rotation.y -= dt * l.spin * 0.6;
      shell.current.scale.setScalar(1.05 * l.spread * (1 + Math.sin(t * 2.1) * 0.02));
    }
    if (rings.current) {
      rings.current.children.forEach((ring, i) => {
        ring.rotation.z += dt * l.spin * (0.6 + i * 0.35) * (i % 2 ? -1 : 1);
        ring.scale.setScalar(l.spread * (1.25 + i * 0.22));
      });
    }

    resources.inner.emissive.copy(l.color);
    resources.inner.emissiveIntensity = 0.25 + l.energy * 0.45;
    resources.wire.color.copy(l.color);
    resources.ring.color.copy(l.color);
    resources.points.color.copy(l.color);
    resources.base_ring.color.copy(l.color);
    resources.base_ring.opacity = 0.2 + l.energy * 0.2;
    if (light.current) {
      light.current.color.copy(l.color);
      light.current.intensity = 4 + l.energy * 6;
    }

    if (points.current) {
      const attribute = resources.geometry.getAttribute("position") as BufferAttribute;
      const array = attribute.array as Float32Array;
      const pull = 0.55 + (1 - l.coherence) * 0.45;
      const swirl = t * (0.15 + l.spin * 0.35);
      for (let i = 0; i < PARTICLES; i += 1) {
        const bx = resources.base[i * 3]!;
        const by = resources.base[i * 3 + 1]!;
        const bz = resources.base[i * 3 + 2]!;
        const angle = swirl * (1 + (i % 7) * 0.08);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const wobble = 1 + Math.sin(t * 1.7 + i) * 0.06 * (1 - l.coherence);
        const scale = pull * l.spread * wobble;
        array[i * 3] = (bx * c - bz * s) * scale;
        array[i * 3 + 1] = by * scale;
        array[i * 3 + 2] = (bx * s + bz * c) * scale;
      }
      attribute.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh geometry={geo.ring(1.9, 1.95)} material={resources.base_ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />
      <mesh geometry={geo.ring(1.2, 1.22)} material={resources.base_ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />
      <group ref={group} position={[0, 2.3, 0]}>
        <pointLight ref={light} distance={12} decay={1.6} intensity={6} />
        <mesh ref={inner} geometry={geo.ico(1, 1)} material={resources.inner} />
        <mesh ref={shell} geometry={geo.ico(1, 2)} material={resources.wire} />
        <group ref={rings}>
          {([[1.2, 0.2], [0.4, 1.1], [-0.7, 0.5]] as const).map(([rx, ry], i) => (
            <group key={i} rotation={[rx, ry, 0]}>
              <mesh geometry={geo.torus(1, 0.008, 96)} material={resources.ring} />
            </group>
          ))}
        </group>
        <points ref={points} geometry={resources.geometry} material={resources.points} />
      </group>
    </>
  );
}
