import { DEMO_MODULES, type DemoModuleId } from "@/state/fixtures/uae-market";
import type { ModuleSpec } from "./types";

/** How each demo module looks: the workstation that matches its kind of work, its surface and its color. */
const PRESENTATION: Record<DemoModuleId, Pick<ModuleSpec, "station" | "surface" | "color">> = {
  market: { station: "console", surface: "panel", color: "#8fd0ff" },
  competition: { station: "table", surface: "panel", color: "#8fd0ff" },
  regulation: { station: "console", surface: "panel", color: "#8fd0ff" },
  economics: { station: "hologram", surface: "panel", color: "#ffc27a" },
  risk: { station: "table", surface: "panel", color: "#ff8f6b" },
  possibility: { station: "platform", surface: "scenarios", color: "#b98cff" },
};

const FALLBACK: Pick<ModuleSpec, "station" | "surface" | "color"> = { station: "console", surface: "panel", color: "#8fd0ff" };

/** Maps a module kind to its registered workstation; unknown kinds get a plain console. */
export function presentationFor(kind: string): Pick<ModuleSpec, "station" | "surface" | "color"> {
  return PRESENTATION[kind as DemoModuleId] ?? FALLBACK;
}

export const MODULE_CATALOG = Object.fromEntries(
  (Object.keys(DEMO_MODULES) as DemoModuleId[]).map((id) => [id, { id, ...DEMO_MODULES[id], ...PRESENTATION[id] }]),
) as Record<DemoModuleId, ModuleSpec>;
