import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineDashedMaterial,
  MathUtils,
  MeshBasicMaterial,
  type Group,
  type Mesh,
} from "three";
import { AGENTS, AGENT_ORDER } from "../sim/roster";
import type { AgentId, AgentState, World } from "../sim/types";
import { AgentModel, preloadAgentModels, type BodyMotion } from "./agent-model";
import { geo } from "./geometry";
import { poseFor, type Pose } from "./poses";

preloadAgentModels();

export const CHARACTER_SCALE = 1.35;
const ACTIVE_STATES: ReadonlySet<AgentState> = new Set([
  "working",
  "evaluating",
  "collaborating",
  "handoff",
  "retrying",
]);
export const STATE_COLORS: Partial<Record<AgentState, string>> = {
  failed: "#ff5a5f",
  blocked: "#ff5a5f",
  retrying: "#ffc27a",
  waiting: "#8d9aaa",
};

interface CharacterProps {
  id: AgentId;
  worldRef: RefObject<World>;
  selected: boolean;
  onSelect: (id: AgentId) => void;
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function Character({ id, worldRef, selected, onSelect }: CharacterProps) {
  const profile = AGENTS[id];
  const look = profile.look;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const marker = useRef<Mesh>(null);

  const ringMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: look.accent,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
        depthWrite: false,
      }),
    [look.accent],
  );
  const route = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    const material = new LineDashedMaterial({
      color: look.accent,
      dashSize: 0.28,
      gapSize: 0.22,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
    });
    const line = new Line(geometry, material);
    line.frustumCulled = false;
    return line;
  }, [look.accent]);

  useEffect(
    () => () => {
      ringMaterial.dispose();
      route.geometry.dispose();
      (route.material as LineDashedMaterial).dispose();
    },
    [ringMaterial, route],
  );

  const anim = useRef<BodyMotion & { facing: number }>({
    phase: 0,
    walk: 0,
    facing: Number.NaN,
    active: false,
    appear: 0,
    pose: poseFor("idle", 0, false),
  });
  const baseColor = useMemo(() => new Color(look.accent), [look.accent]);
  const tint = useMemo(() => new Color(), []);

  useFrame((frame, delta) => {
    const world = worldRef.current;
    const agent = world.agents[id];
    const a = anim.current;
    const dt = Math.min(delta, 0.05);
    const t = frame.clock.elapsedTime;
    if (!root.current || !body.current) return;

    root.current.position.set(agent.position[0], 0, agent.position[1]);
    if (Number.isNaN(a.facing)) a.facing = agent.facing;
    a.facing += wrapAngle(agent.facing - a.facing) * (1 - Math.exp(-dt * 9));
    root.current.rotation.y = a.facing;

    const index = AGENT_ORDER.indexOf(id);
    const appear = MathUtils.smoothstep(world.time, 0.25 + index * 0.18, 1.35 + index * 0.18);
    body.current.position.y = -2.1 * (1 - appear) ** 2;

    a.walk = MathUtils.damp(a.walk, agent.moving ? 1 : 0, 9, dt);
    if (a.walk > 0.01) a.phase += dt * 8.4;

    const target = poseFor(agent.state, t + index, agent.moving);
    const p = a.pose;
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      p[key] = MathUtils.damp(p[key], target[key], 7, dt);
    }
    const active = ACTIVE_STATES.has(agent.state);
    a.active = active;
    a.appear = appear;

    if (ring.current) {
      const pulse = agent.state === "assigned" ? 1 + (Math.sin(t * 14) * 0.5 + 0.5) * 0.35 : 1;
      ring.current.scale.setScalar((selected ? 1.3 : 1) * pulse * Math.max(appear, 0.01));
      const stateColor = STATE_COLORS[agent.state];
      tint.copy(baseColor);
      if (stateColor) tint.set(stateColor);
      ringMaterial.color.lerp(tint, 1 - Math.exp(-dt * 8));
      ringMaterial.opacity = selected ? 1 : active ? 0.9 : 0.55;
    }

    const positions = route.geometry.getAttribute("position") as BufferAttribute;
    const showRoute = agent.route.length > 0 && (agent.state === "assigned" || agent.moving);
    route.visible = showRoute;
    if (marker.current) marker.current.visible = showRoute;
    if (showRoute) {
      const points = [agent.position, ...agent.route];
      for (let i = 0; i < 3; i += 1) {
        const point = points[Math.min(i, points.length - 1)]!;
        positions.setXYZ(i, point[0], 0.03, point[1]);
      }
      positions.needsUpdate = true;
      route.computeLineDistances();
      const end = points[points.length - 1]!;
      marker.current?.position.set(end[0], 0.025, end[1]);
      marker.current?.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(id);
  };

  return (
    <>
      <primitive object={route} />
      <mesh ref={marker} geometry={geo.ring(0.32, 0.4)} material={ringMaterial} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
      <group ref={root} onClick={handleClick} scale={CHARACTER_SCALE}>
        <mesh ref={ring} geometry={geo.ring(0.42, 0.47)} material={ringMaterial} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <circleGeometry args={[0.42, 40]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        <group ref={body}>
          <Suspense fallback={null}>
            <AgentModel id={id} motion={anim} />
          </Suspense>
        </group>
      </group>
    </>
  );
}
