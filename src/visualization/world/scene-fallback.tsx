"use client";

import { Component, useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { World } from "./sim/types";
import { SNAPSHOT_INTERVAL } from "./snapshot";

/** Catches a crash inside the 3D view so the panels and the run keep going. */
export class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface FallbackDriverProps {
  paused: boolean;
  speed: number;
  advance: (realSeconds: number, speed: number) => World;
  onSnapshot: (world: World) => void;
  /** Shared with the 3D view, so it picks up where this left off. */
  worldRef: RefObject<World>;
}

/** Without the 3D view, steps the run on animation frames and reports snapshots at the same rate the scene does. */
export function FallbackDriver({ paused, speed, advance, onSnapshot, worldRef }: FallbackDriverProps) {
  const latest = useRef({ paused, speed, advance, onSnapshot });
  useEffect(() => {
    latest.current = { paused, speed, advance, onSnapshot };
  }, [paused, speed, advance, onSnapshot]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let sinceSnapshot = 0;
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const current = latest.current;
      if (!current.paused) worldRef.current = current.advance(delta, current.speed);
      sinceSnapshot += delta;
      if (sinceSnapshot >= SNAPSHOT_INTERVAL) {
        sinceSnapshot = 0;
        current.onSnapshot(worldRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [worldRef]);
  return null;
}
