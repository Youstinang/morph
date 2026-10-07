import type { CSSProperties } from "react";

/** Screen space (px) the HUD reserves on each side; the 3D scene is framed inside what remains. */
export interface HudInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The deck is wide and shallow, so on most screens the HUD sits in bands above and below it
 * and the scene keeps the full width. Only very wide screens use side columns.
 * Keep these breakpoints in sync with the media queries in `lab.css`.
 */
export const COMPACT_MAX = 900;
export const RAILS_MIN = 1600;

const EDGE = 24;
const LEFT_RAIL = 224;
const RIGHT_RAIL = 300;
const GAP = 20;
const HEADER = 72;
const INFO_BAND = 132;
const BOTTOM_BANDS = 140;

export function hudInsets(width: number): HudInsets {
  if (width <= COMPACT_MAX) return { top: 240, right: 12, bottom: 168, left: 12 };
  if (width < RAILS_MIN) {
    return { top: HEADER + INFO_BAND + GAP, right: EDGE, bottom: BOTTOM_BANDS, left: EDGE };
  }
  return { top: 80, right: EDGE + RIGHT_RAIL + GAP, bottom: 92, left: EDGE + LEFT_RAIL + GAP };
}

export const HUD_CSS_VARS = {
  "--hud-edge": `${EDGE}px`,
  "--hud-left-rail": `${LEFT_RAIL}px`,
  "--hud-right-rail": `${RIGHT_RAIL}px`,
  "--hud-header": `${HEADER}px`,
  "--hud-info-band": `${INFO_BAND}px`,
} as CSSProperties;
