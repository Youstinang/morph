"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WorkspaceProvider } from "@/state/react";
import { AgentTags, type TagRegistry } from "./agent-tags";
import { HUD_CSS_VARS } from "./hud-layout";
import { LabHud } from "./lab-hud";
import { ReducedMotionContext, usePrefersReducedMotion } from "./motion";
import { lowerQuality, nextQuality, webglAvailable, type Quality } from "./quality";
import { FallbackDriver, SceneBoundary } from "./scene-fallback";
import { useSound } from "./sound/use-sound";
import type { LabSession } from "./sim/session";
import type { AgentId, World } from "./sim/types";
import { takeSnapshot, type LabSnapshot } from "./snapshot";
import "./lab.css";

const LabScene = dynamic(() => import("./lab-scene"), {
  ssr: false,
  loading: () => <div className="lab-loading">Initializing chamber…</div>,
});

const SPEEDS = [1, 2] as const;

type ViewProblem = "crashed" | "lost";

const PROBLEM_WORDS: Record<ViewProblem | "unsupported", string> = {
  unsupported: "This browser can't draw the 3D deck, so MORPH is showing the work in the panels only.",
  crashed: "The 3D deck hit an error and was switched off. The work goes on in the panels.",
  lost: "The graphics card reset, so the 3D deck was switched off. The work goes on in the panels.",
};

let webglSupport: boolean | undefined;
const neverChanges = () => () => {};
const readWebglSupport = () => (webglSupport ??= webglAvailable());

/**
 * full: the demo plus "Ask a question". demo: the offline story only. showcase: the story in a 16:9 frame
 * for recording, without toolbar or panel buttons; Space pauses, R restarts, S toggles sound.
 */
export type ExperienceVariant = "full" | "demo" | "showcase";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function LabExperience({ createSession, variant = "full" }: { createSession: () => LabSession; variant?: ExperienceVariant }) {
  const [session] = useState(createSession);
  const worldRef = useRef<World>(session.world);
  const tags = useRef<TagRegistry>({});
  const inputAnchor = useRef<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<LabSnapshot>(() => takeSnapshot(session.world, session.bus.history()));
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<Quality>("high");
  const [qualityChosen, setQualityChosen] = useState(false);
  const canDraw = useSyncExternalStore(neverChanges, readWebglSupport, () => true);
  const [problem, setProblem] = useState<ViewProblem | null>(null);
  const [viewKey, setViewKey] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const sound = useSound(session.bus);

  const handleSnapshot = useCallback(
    (world: World) => setSnapshot(takeSnapshot(world, session.bus.history())),
    [session],
  );
  const advance = useCallback((realSeconds: number, speed: number) => session.advance(realSeconds, speed), [session]);
  const lowerOnSlow = useCallback(() => {
    if (!qualityChosen) setQuality(lowerQuality);
  }, [qualityChosen]);
  const crashed = useCallback(() => setProblem("crashed"), []);
  const contextLost = useCallback(() => setProblem("lost"), []);
  const retryView = useCallback(() => {
    setProblem(null);
    setViewKey((key) => key + 1);
  }, []);
  const restart = useCallback(() => {
    session.restart();
    worldRef.current = session.world;
    handleSnapshot(session.world);
    setPaused(false);
  }, [session, handleSnapshot]);
  const toggleSound = sound.toggle;
  useEffect(() => {
    if (variant !== "showcase") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (event.key === "r" || event.key === "R") restart();
      else if (event.key === "s" || event.key === "S") toggleSound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, restart, toggleSound]);
  const ask = useCallback(
    (objective: string) => {
      session.startLive(objective);
      worldRef.current = session.world;
      setSelected(null);
      handleSnapshot(session.world);
      setPaused(false);
    },
    [session, handleSnapshot],
  );

  return (
    <WorkspaceProvider store={session.store}>
      <ReducedMotionContext.Provider value={reducedMotion}>
        <main
          className={`lab-root ${labels ? "" : "lab-root--no-labels"} ${variant === "showcase" ? "lab-root--showcase" : ""}`}
          style={HUD_CSS_VARS}
        >
          <div className="lab-canvas">
            {canDraw && problem === null ? (
              <SceneBoundary key={viewKey} onFail={crashed}>
                <LabScene
                  worldRef={worldRef}
                  paused={paused}
                  speed={SPEEDS[speedIndex] ?? 1}
                  advance={advance}
                  onSnapshot={handleSnapshot}
                  selected={selected}
                  onSelect={setSelected}
                  quality={quality}
                  tags={tags}
                  inputAnchor={inputAnchor}
                  directed={autoCamera && !reducedMotion}
                  onSlow={lowerOnSlow}
                  onContextLost={contextLost}
                />
              </SceneBoundary>
            ) : (
              <>
                <FallbackDriver
                  paused={paused}
                  speed={SPEEDS[speedIndex] ?? 1}
                  advance={advance}
                  onSnapshot={handleSnapshot}
                  worldRef={worldRef}
                />
                <div className="lab-fallback" role="status">
                  <p>{PROBLEM_WORDS[problem ?? "unsupported"]}</p>
                  {problem && (
                    <button type="button" className="lab-btn" onClick={retryView}>
                      Try the 3D deck again
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {canDraw && problem === null && <AgentTags registry={tags} selected={selected} />}
          <LabHud
            snapshot={snapshot}
            paused={paused}
            speed={SPEEDS[speedIndex] ?? 1}
            labels={labels}
            quality={quality}
            qualityLowered={!qualityChosen && quality !== "high"}
            autoCamera={autoCamera && !reducedMotion}
            onToggleCamera={reducedMotion ? null : () => setAutoCamera((value) => !value)}
            selected={selected}
            onTogglePause={() => setPaused((value) => !value)}
            onRestart={restart}
            onSpeed={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
            onToggleLabels={() => setLabels((value) => !value)}
            sound={sound.on}
            onToggleSound={sound.toggle}
            onToggleQuality={() => {
              setQualityChosen(true);
              setQuality(nextQuality);
            }}
            onSelect={setSelected}
            onAsk={ask}
            onBackToDemo={restart}
            canAsk={variant === "full"}
            startAsking={session.waiting}
            clean={variant === "showcase"}
            inputAnchor={inputAnchor}
            onAnswer={(requestId, value) => {
              session.answerInput(requestId, value);
              handleSnapshot(session.world);
            }}
            onSkip={(requestId) => {
              session.skipInput(requestId);
              handleSnapshot(session.world);
            }}
            onEngageInput={() => session.holdInput()}
          />
        </main>
      </ReducedMotionContext.Provider>
    </WorkspaceProvider>
  );
}
