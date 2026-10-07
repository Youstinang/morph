import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackDriver, SceneBoundary } from "./scene-fallback";
import type { World } from "./sim/types";

let frames: FrameRequestCallback[] = [];
let now = 0;

function step(ms: number) {
  now += ms;
  const due = frames;
  frames = [];
  for (const callback of due) callback(now);
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("without the 3D view", () => {
  it("keeps the run moving and reports snapshots", () => {
    const world = { time: 0 } as World;
    const advance = vi.fn(() => world);
    const onSnapshot = vi.fn();
    const ref = { current: world };
    render(<FallbackDriver paused={false} speed={2} advance={advance} onSnapshot={onSnapshot} worldRef={ref} />);
    for (let i = 0; i < 10; i++) step(50);
    expect(advance).toHaveBeenCalledTimes(10);
    expect(advance).toHaveBeenLastCalledWith(0.05, 2);
    expect(onSnapshot).toHaveBeenCalledTimes(3);
  });

  it("doesn't move a paused run and stops when it unmounts", () => {
    const world = { time: 0 } as World;
    const advance = vi.fn(() => world);
    const view = render(
      <FallbackDriver paused advance={advance} speed={1} onSnapshot={() => {}} worldRef={{ current: world }} />,
    );
    step(50);
    expect(advance).not.toHaveBeenCalled();
    view.unmount();
    expect(frames).toHaveLength(0);
  });

  it("reports a crash in the 3D view instead of taking the page down", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onFail = vi.fn();
    const Broken = () => {
      throw new Error("no GPU");
    };
    act(() => {
      render(
        <div>
          <SceneBoundary onFail={onFail}>
            <Broken />
          </SceneBoundary>
          <p>panels</p>
        </div>,
      );
    });
    expect(onFail).toHaveBeenCalledOnce();
    expect(screen.getByText("panels")).toBeTruthy();
  });
});
