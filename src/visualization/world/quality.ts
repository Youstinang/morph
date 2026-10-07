/**
 * Picture quality presets. High is the default look; Balanced lowers resolution and drops floor reflections
 * and multisampling; Performance also drops the glow and vignette. MORPH steps down on its own when the
 * frame rate stays low, unless the user has picked a preset.
 */
export type Quality = "high" | "balanced" | "performance";

export const QUALITY_ORDER: readonly Quality[] = ["high", "balanced", "performance"];
export const QUALITY_WORDS: Record<Quality, string> = {
  high: "High",
  balanced: "Balanced",
  performance: "Performance",
};

export const nextQuality = (quality: Quality): Quality =>
  QUALITY_ORDER[(QUALITY_ORDER.indexOf(quality) + 1) % QUALITY_ORDER.length]!;
export const lowerQuality = (quality: Quality): Quality =>
  QUALITY_ORDER[Math.min(QUALITY_ORDER.indexOf(quality) + 1, QUALITY_ORDER.length - 1)]!;

/** Below this many frames per second, sustained, the picture steps down a preset. */
export const SLOW_FPS = 42;
/** Shaders compile and textures upload in the first seconds, so the frame rate isn't judged until then. */
export const WARM_UP_MS = 4000;

/** Whether this browser can make a WebGL 2 context at all; checked before the 3D view mounts. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}
