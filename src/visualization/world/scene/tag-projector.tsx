import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Vector3 } from "three";
import type { TagRegistry } from "../agent-tags";
import { STATE_WORDS } from "../copy";
import { AGENTS, AGENT_ORDER } from "../sim/roster";
import type { AgentId, AgentState, World } from "../sim/types";
import { CHARACTER_SCALE, STATE_COLORS } from "./character";

const TAG_GAP = 4;
/** Resting states use a neutral color so an agent's accent (e.g. Vex's red) doesn't read as an alarm. */
const CALM_STATES: ReadonlySet<AgentState> = new Set(["idle", "completed", "returning"]);
const CALM_COLOR = "#9fb0c2";

interface Placement {
  id: AgentId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nearer tags keep their anchor; farther tags that would overlap are lifted above them. */
function declutter(placements: Placement[]) {
  placements.sort((a, b) => b.y - a.y);
  for (let i = 1; i < placements.length; i += 1) {
    const tag = placements[i]!;
    for (let j = 0; j < i; j += 1) {
      const other = placements[j]!;
      const overlapsX = Math.abs(tag.x - other.x) < (tag.width + other.width) / 2 + TAG_GAP;
      const overlapsY = tag.y > other.y - other.height - TAG_GAP;
      if (overlapsX && overlapsY) {
        tag.y = other.y - other.height - TAG_GAP;
        j = -1;
      }
    }
  }
}

export function TagProjector({
  worldRef,
  registry,
}: {
  worldRef: RefObject<World>;
  registry: RefObject<TagRegistry>;
}) {
  const size = useThree((state) => state.size);
  const point = useRef(new Vector3());
  const last = useRef<Partial<Record<AgentId, AgentState>>>({});
  const placements = useRef<Placement[]>([]);
  const sizesRef = useRef<Partial<Record<AgentId, [number, number]>>>({});

  useFrame(({ camera }) => {
    const world = worldRef.current;
    const visible = placements.current;
    visible.length = 0;
    const sizes = sizesRef.current;
    for (const id of AGENT_ORDER) {
      const root = registry.current[id]?.root;
      if (root) sizes[id] = [root.offsetWidth, root.offsetHeight];
    }
    for (const id of AGENT_ORDER) {
      const tag = registry.current[id];
      if (!tag?.root) continue;
      const agent = world.agents[id];
      const height = 2.15 * AGENTS[id].look.height * CHARACTER_SCALE;
      point.current.set(agent.position[0], height, agent.position[1]).project(camera);
      const onScreen = point.current.z < 1 && world.time > 0.8;
      tag.root.style.opacity = onScreen ? "1" : "0";
      if (onScreen) {
        visible.push({
          id,
          x: (point.current.x * 0.5 + 0.5) * size.width,
          y: (-point.current.y * 0.5 + 0.5) * size.height,
          width: sizes[id]?.[0] ?? 0,
          height: sizes[id]?.[1] ?? 0,
        });
      }
      if (tag.state && last.current[id] !== agent.state) {
        last.current[id] = agent.state;
        tag.state.textContent = STATE_WORDS[agent.state];
        tag.state.style.color =
          STATE_COLORS[agent.state] ?? (CALM_STATES.has(agent.state) ? CALM_COLOR : AGENTS[id].look.accent);
      }
    }
    declutter(visible);
    for (const placement of visible) {
      const root = registry.current[placement.id]?.root;
      if (root) {
        root.style.transform = `translate3d(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }
  });
  return null;
}
