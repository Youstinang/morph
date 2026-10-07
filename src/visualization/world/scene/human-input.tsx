import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, Color, MeshBasicMaterial, Vector3, type Group, type Mesh } from "three";
import { useReducedMotion } from "../motion";
import { AGENTS } from "../sim/roster";
import type { World } from "../sim/types";
import { ANSWER_FLIGHT_SECONDS, ANSWER_GLOW_SECONDS, askingAgent } from "../sim/world";
import { CHARACTER_SCALE } from "./character";
import { DataCard, cardMaterials, disposeCardMaterials, paintCard } from "./data-card";
import { geo } from "./geometry";

/** The user's color in the world: a warm white, apart from every agent's accent. */
export const USER_COLOR = "#fff1cf";
const POOL = 2;
const CORE_CENTER_Y = 2.3;
const CORE_SHELL = 1.3;
const PANEL_GAP_TOP = 150;
const PANEL_GAP_BOTTOM = 170;

const glow = () => new MeshBasicMaterial({ color: USER_COLOR, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

/**
 * Keeps the question panel (a DOM element, so its controls stay accessible) beside whoever asked: it
 * projects the asker's chest to the screen each frame and writes the point as CSS variables. The panel
 * sits to the asker's right, or left when they stand near the right edge.
 */
export function InputAnchor({ worldRef, anchor }: { worldRef: RefObject<World>; anchor: RefObject<HTMLElement | null> }) {
  const size = useThree((state) => state.size);
  const point = useRef(new Vector3());
  useFrame(({ camera }) => {
    const element = anchor.current;
    if (!element) return;
    const world = worldRef.current;
    const asker = askingAgent(world);
    if (!asker) return;
    const agent = world.agents[asker];
    point.current.set(agent.position[0], 1.55 * AGENTS[asker].look.height * CHARACTER_SCALE, agent.position[1]).project(camera);
    const x = (point.current.x * 0.5 + 0.5) * size.width;
    const y = (-point.current.y * 0.5 + 0.5) * size.height;
    const clamped = Math.min(Math.max(y, PANEL_GAP_TOP), Math.max(PANEL_GAP_TOP, size.height - PANEL_GAP_BOTTOM));
    element.style.setProperty("--ax", `${x.toFixed(1)}px`);
    element.style.setProperty("--ay", `${clamped.toFixed(1)}px`);
    element.dataset.side = x > size.width * 0.58 ? "left" : "right";
    element.dataset.placed = "true";
  });
  return null;
}

/**
 * The question in the world: while the team waits on the user, a soft ring glows at the asker's feet. When
 * the user answers, a warm-white card leaves the asker's panel side and flies into the Core, which glows
 * where it lands. Calm: the ring holds still and the card appears at the Core without flying.
 */
export function HumanInput({ worldRef }: { worldRef: RefObject<World> }) {
  const calm = useReducedMotion();
  const cue = useRef<Mesh>(null);
  const cards = useRef<(Group | null)[]>([]);
  const glows = useRef<(Mesh | null)[]>([]);
  const cueMaterial = useMemo(() => glow(), []);
  const cardPaint = useMemo(() => Array.from({ length: POOL }, () => cardMaterials()), []);
  const glowMaterials = useMemo(() => Array.from({ length: POOL }, () => glow()), []);
  const color = useMemo(() => new Color(USER_COLOR), []);
  useEffect(
    () => () => {
      cueMaterial.dispose();
      cardPaint.forEach(disposeCardMaterials);
      glowMaterials.forEach((material) => material.dispose());
    },
    [cueMaterial, cardPaint, glowMaterials],
  );

  useFrame(({ camera, clock }) => {
    const world = worldRef.current;
    const asker = askingAgent(world);
    if (cue.current) {
      cue.current.visible = asker !== null;
      if (asker) {
        const [x, z] = world.agents[asker].position;
        cue.current.position.set(x, 0.03, z);
        const beat = calm ? 0.5 : 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4);
        cueMaterial.opacity = 0.35 + 0.35 * beat;
        cue.current.scale.setScalar(calm ? 1 : 1 + 0.06 * beat);
      }
    }
    for (let i = 0; i < POOL; i += 1) {
      const card = world.answerCards[i];
      const slot = cards.current[i];
      const ring = glows.current[i];
      if (!slot || !ring) continue;
      slot.visible = false;
      ring.visible = false;
      if (!card) continue;
      const age = world.time - card.startedAt;
      const length = Math.hypot(card.from[0], card.from[1]) || 1;
      const end = [(card.from[0] / length) * CORE_SHELL, CORE_CENTER_Y, (card.from[1] / length) * CORE_SHELL] as const;
      const flight = calm ? 1 : Math.min(age / ANSWER_FLIGHT_SECONDS, 1);
      if (flight < 1) {
        const eased = flight * flight * (3 - 2 * flight);
        slot.visible = true;
        slot.position.set(
          card.from[0] + (end[0] - card.from[0]) * eased,
          2.2 + (end[1] - 2.2) * eased + Math.sin(Math.PI * flight) * 0.8,
          card.from[1] + (end[2] - card.from[1]) * eased,
        );
        slot.quaternion.copy(camera.quaternion);
        paintCard(cardPaint[i]!, color, Math.min(age / 0.25, 1), 1.6);
        continue;
      }
      const landed = calm ? age : age - ANSWER_FLIGHT_SECONDS;
      const fade = Math.max(0, 1 - landed / ANSWER_GLOW_SECONDS);
      if (fade <= 0) continue;
      ring.visible = true;
      ring.position.set(0, CORE_CENTER_Y, 0);
      ring.scale.setScalar(calm ? 1 : 1 + landed * 0.35);
      glowMaterials[i]!.opacity = 0.7 * fade;
    }
  });

  return (
    <>
      <mesh ref={cue} rotation-x={-Math.PI / 2} geometry={geo.ring(0.78, 0.92)} material={cueMaterial} visible={false} />
      {cardPaint.map((materials, i) => (
        <group key={`card-${i}`} ref={(node) => void (cards.current[i] = node)} visible={false} scale={0.8}>
          <DataCard materials={materials} />
        </group>
      ))}
      {glowMaterials.map((material, i) => (
        <mesh key={`glow-${i}`} ref={(node) => void (glows.current[i] = node)} rotation-x={-Math.PI / 2} geometry={geo.ring(1.45, 1.6)} material={material} visible={false} />
      ))}
    </>
  );
}
