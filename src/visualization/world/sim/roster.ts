import type { AgentId, Vec2 } from "./types";

export type HairStyle = "bob" | "spiky" | "braid" | "topknot" | "hood" | "bun";
export type PropKind = "orb" | "tablet" | "chart" | "gauntlet" | "blade" | "sphere";

export interface FaceStyle {
  iris: string;
  brows: string;
  lips: string;
  /** Brow tilt in radians; positive reads determined, negative reads gentle. */
  browTilt: number;
  /** Mouth curve; positive smiles, negative frowns. */
  smile: number;
  liner: boolean;
  freckles: boolean;
  glasses: boolean;
}

export interface CharacterLook {
  face: FaceStyle;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  coat: string;
  coatLength: "long" | "short" | "cape";
  inner: string;
  pants: string;
  boots: string;
  accent: string;
  prop: PropKind;
  build: "slim" | "broad";
  height: number;
  backpack: boolean;
  beard: boolean;
}

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  summary: string;
  look: CharacterLook;
}

export const AGENT_ORDER: readonly AgentId[] = [
  "nova",
  "orion",
  "sage",
  "brix",
  "vex",
  "lume",
];

export const AGENTS: Record<AgentId, AgentProfile> = {
  nova: {
    id: "nova",
    name: "Nova",
    role: "Planner",
    summary: "Splits your question into tasks and keeps the team on track",
    look: {
      face: { iris: "#ffb648", brows: "#1a2033", lips: "#a8584f", browTilt: 0.12, smile: 0.35, liner: true, freckles: false, glasses: false },
      skin: "#e7c3a4",
      hair: "#1c2848",
      hairStyle: "bob",
      coat: "#2b2019",
      coatLength: "long",
      inner: "#d8cdb8",
      pants: "#1d1915",
      boots: "#17120e",
      accent: "#ffb648",
      prop: "orb",
      build: "slim",
      height: 1,
      backpack: false,
      beard: false,
    },
  },
  orion: {
    id: "orion",
    name: "Orion",
    role: "Researcher",
    summary: "Finds sources and brings back facts",
    look: {
      face: { iris: "#5cc0ff", brows: "#b8bec8", lips: "#a06a5c", browTilt: 0.05, smile: 0.15, liner: false, freckles: false, glasses: true },
      skin: "#e4c0a2",
      hair: "#dfe3ea",
      hairStyle: "spiky",
      coat: "#1c2738",
      coatLength: "long",
      inner: "#2c3a52",
      pants: "#151b26",
      boots: "#10141c",
      accent: "#4fb4ff",
      prop: "tablet",
      build: "slim",
      height: 1.04,
      backpack: true,
      beard: false,
    },
  },
  sage: {
    id: "sage",
    name: "Sage",
    role: "Analyst",
    summary: "Turns the facts into numbers and patterns",
    look: {
      face: { iris: "#3ef0a2", brows: "#a8325c", lips: "#b0545a", browTilt: 0.2, smile: 0.25, liner: true, freckles: true, glasses: false },
      skin: "#e8bd9d",
      hair: "#e2457f",
      hairStyle: "braid",
      coat: "#2e2b23",
      coatLength: "short",
      inner: "#3c3a30",
      pants: "#26241d",
      boots: "#191712",
      accent: "#3ef0a2",
      prop: "chart",
      build: "slim",
      height: 0.96,
      backpack: false,
      beard: false,
    },
  },
  brix: {
    id: "brix",
    name: "Brix",
    role: "Builder",
    summary: "Sets up the stations the team works at",
    look: {
      face: { iris: "#ffa040", brows: "#140e0a", lips: "#7a4a38", browTilt: 0.25, smile: 0.5, liner: false, freckles: false, glasses: false },
      skin: "#b6825f",
      hair: "#18120d",
      hairStyle: "topknot",
      coat: "#3b2f22",
      coatLength: "short",
      inner: "#4a3a28",
      pants: "#2a231a",
      boots: "#1a150f",
      accent: "#ff9a30",
      prop: "gauntlet",
      build: "broad",
      height: 1.07,
      backpack: true,
      beard: true,
    },
  },
  vex: {
    id: "vex",
    name: "Vex",
    role: "Critic",
    summary: "Questions weak claims and tests what could go wrong",
    look: {
      face: { iris: "#ff3d4f", brows: "#3a0c12", lips: "#6e1622", browTilt: 0.35, smile: -0.1, liner: true, freckles: false, glasses: false },
      skin: "#e6c0ae",
      hair: "#7c1622",
      hairStyle: "hood",
      coat: "#1b1517",
      coatLength: "long",
      inner: "#2c1c20",
      pants: "#151012",
      boots: "#0f0b0c",
      accent: "#ff3d4f",
      prop: "blade",
      build: "slim",
      height: 1,
      backpack: false,
      beard: false,
    },
  },
  lume: {
    id: "lume",
    name: "Lume",
    role: "Synthesizer",
    summary: "Compares the options and shapes the answer",
    look: {
      face: { iris: "#b88cff", brows: "#2a1f4e", lips: "#a8566a", browTilt: -0.05, smile: 0.3, liner: true, freckles: false, glasses: false },
      skin: "#ebc7b4",
      hair: "#3a2b6c",
      hairStyle: "bun",
      coat: "#d6cfc1",
      coatLength: "cape",
      inner: "#3b2f5e",
      pants: "#2a2440",
      boots: "#1a1628",
      accent: "#a874ff",
      prop: "sphere",
      build: "slim",
      height: 1.01,
      backpack: false,
      beard: false,
    },
  },
};

export const CORE_RADIUS = 2.4;
export const HOME_RADIUS = 3.6;

export function homePosition(id: AgentId): Vec2 {
  const index = AGENT_ORDER.indexOf(id);
  const angle = ((-75 + index * 30) * Math.PI) / 180;
  return [HOME_RADIUS * Math.sin(angle), HOME_RADIUS * Math.cos(angle)];
}

export function coreSpot(id: AgentId): Vec2 {
  const index = AGENT_ORDER.indexOf(id);
  const angle = ((-50 + index * 20) * Math.PI) / 180;
  return [2.3 * Math.sin(angle), 2.3 * Math.cos(angle)];
}
