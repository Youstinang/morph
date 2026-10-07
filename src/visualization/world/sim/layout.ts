import type { ModuleGroup, ModuleId, Vec2 } from "./types";

/** Footprint radius of a size-1 module (its floor ring), and the clear gap kept between footprints. */
export const BASE_REACH = 2.25;
export const MODULE_GAP = 0.7;
/** Search floor for crowding. Readable (≥ 0.4) capacity: research 4, analysis 4, decision 3. */
const MIN_LAYOUT_SCALE = 0.1;
const RADIUS_STEP = 0.25;

/**
 * A neighborhood of the deck. Bearings are degrees around the Core, measured from straight back (−z)
 * toward +x. `min`/`max` bound module centres; `frame` is the arc the overview camera always keeps in view.
 */
export interface Sector {
  center: number;
  min: number;
  max: number;
  radius: number;
  maxRadius: number;
  /** Preferred spacing between neighbours when there is room. */
  step: number;
  frame: readonly [from: number, to: number];
}

export const SECTOR_ORDER: readonly ModuleGroup[] = ["research", "analysis", "decision"];

export const SECTORS: Record<ModuleGroup, Sector> = {
  research: { center: -34, min: -76, max: 4, radius: 9.9, maxRadius: 11.2, step: 38, frame: [-72, 4] },
  analysis: { center: 56, min: 34, max: 76, radius: 10.4, maxRadius: 11.2, step: 30, frame: [41, 71] },
  decision: { center: 109, min: 108, max: 140, radius: 7.9, maxRadius: 9.5, step: 36, frame: [109, 109] },
};

export interface LayoutItem {
  id: ModuleId;
  group: ModuleGroup;
  /** Footprint radius before crowding, i.e. BASE_REACH × size × emphasis × collapse. */
  reach: number;
}

export interface Placement {
  position: Vec2;
  bearing: number;
  /** ≤ 1 when the neighborhood is too crowded to fit every module at full size. */
  scale: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function pointAt(radius: number, bearing: number): Vec2 {
  return [radius * Math.sin(bearing), -radius * Math.cos(bearing)];
}

function chordAngle(chord: number, radius: number): number {
  return 2 * Math.asin(Math.min(1, chord / (2 * radius)));
}

interface Fit {
  steps: number[];
  lead: number;
  trail: number;
}

/** Minimum spacing at a radius and crowding scale; lead/trail keep oversized edge modules off the neighbours. */
function measure(reaches: number[], radius: number, scale: number): Fit {
  const steps: number[] = [];
  for (let i = 0; i < reaches.length - 1; i += 1) {
    steps.push(chordAngle(scale * (reaches[i]! + reaches[i + 1]!) + MODULE_GAP, radius));
  }
  const edge = (reach: number) => chordAngle(Math.max(0, scale * reach - BASE_REACH), radius);
  return { steps, lead: edge(reaches[0]!), trail: edge(reaches[reaches.length - 1]!) };
}

const total = (fit: Fit) => fit.steps.reduce((sum, step) => sum + step, 0) + fit.lead + fit.trail;

function layoutSector(sector: Sector, items: LayoutItem[]): Map<ModuleId, Placement> {
  const placements = new Map<ModuleId, Placement>();
  if (items.length === 0) return placements;
  const reaches = items.map((item) => item.reach);
  const width = rad(sector.max - sector.min);

  let radius = sector.radius;
  let scale = 1;
  let fit = measure(reaches, radius, scale);
  while (total(fit) > width && radius < sector.maxRadius) {
    radius = Math.min(sector.maxRadius, radius + RADIUS_STEP);
    fit = measure(reaches, radius, scale);
  }
  if (total(fit) > width) {
    let low = MIN_LAYOUT_SCALE;
    let high = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2;
      if (total(measure(reaches, radius, mid)) <= width) low = mid;
      else high = mid;
    }
    scale = low;
    fit = measure(reaches, radius, scale);
  }

  const minimum = fit.steps.reduce((sum, step) => sum + step, 0);
  const room = width - fit.lead - fit.trail;
  const preferred = rad(sector.step) * fit.steps.length;
  const span = Math.max(minimum, Math.min(preferred, room));
  const extra = fit.steps.length > 0 ? (span - minimum) / fit.steps.length : 0;
  const earliest = rad(sector.min) + fit.lead;
  const latest = rad(sector.max) - fit.trail - span;
  let bearing = Math.min(Math.max(rad(sector.center) - span / 2, earliest), Math.max(earliest, latest));

  items.forEach((item, i) => {
    if (i > 0) bearing += fit.steps[i - 1]! + extra;
    placements.set(item.id, { position: pointAt(radius, bearing), bearing, scale });
  });
  return placements;
}

/**
 * Places modules neighborhood by neighborhood. Each group keeps its members in the given order, centred on
 * the group's anchor, so adding or removing a module only moves its own group. Crowded groups first move
 * outward, then shrink; footprints never overlap.
 */
export function layoutModules(items: readonly LayoutItem[]): Map<ModuleId, Placement> {
  const result = new Map<ModuleId, Placement>();
  for (const group of SECTOR_ORDER) {
    const members = items.filter((item) => item.group === group);
    for (const [id, placement] of layoutSector(SECTORS[group], members)) result.set(id, placement);
  }
  return result;
}

/** Floor points the overview must always show: every neighborhood's framed arc at its base radius. */
export function sectorFramePoints(): Vec2[] {
  const points: Vec2[] = [];
  for (const group of SECTOR_ORDER) {
    const sector = SECTORS[group];
    const [from, to] = sector.frame;
    const samples = from === to ? 1 : 4;
    for (let i = 0; i < samples; i += 1) {
      const bearing = rad(samples === 1 ? from : from + ((to - from) * i) / (samples - 1));
      points.push(pointAt(sector.radius, bearing));
    }
  }
  return points;
}
