import type { CSSProperties } from "react";

/** Screen space (px) the HUD reserves on each side; the 3D scene is framed inside what remains. */
export interface HudInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The deck is wide and shallow, so the scene keeps the full width: the header sits above it and every
 * text card sits in bands below it (team row, then the findings or answer band, then the caption), where
 * the floor would otherwise be empty. Keep these sizes in sync with `lab.css`.
 */
export const COMPACT_MAX = 900;

const EDGE = 24;
const GAP = 20;
const HEADER = 72;
const BOTTOM_EDGE = 24;
const TEAM_ROW = 44;
const BAND_GAP = 10;
const INFO_BAND = 156;
const CAPTION = 44;
const BOTTOM_BANDS = BOTTOM_EDGE + TEAM_ROW + BAND_GAP + INFO_BAND + BAND_GAP + CAPTION + BAND_GAP;

export function hudInsets(width: number): HudInsets {
  if (width <= COMPACT_MAX) return { top: 240, right: 12, bottom: 168, left: 12 };
  return { top: HEADER + GAP, right: EDGE, bottom: BOTTOM_BANDS, left: EDGE };
}

export const HUD_CSS_VARS = {
  "--hud-edge": `${EDGE}px`,
  "--hud-bottom-edge": `${BOTTOM_EDGE}px`,
  "--hud-team-row": `${TEAM_ROW}px`,
  "--hud-band-gap": `${BAND_GAP}px`,
  "--hud-info-band": `${INFO_BAND}px`,
} as CSSProperties;
