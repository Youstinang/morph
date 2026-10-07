"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The viewer's operating-system "reduce motion" setting, kept live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * Calm mode for the 3D scene: modules fade between places instead of travelling, the camera cuts instead
 * of swinging, and decorative drift stops. Agents still walk, because their movement is the state.
 */
export const ReducedMotionContext = createContext(false);
export const useReducedMotion = () => useContext(ReducedMotionContext);
