import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraft, WorkspaceEvent } from "@/events/schema";
import { UAE_TIMELINE } from "@/state/fixtures/uae-market";
import { TEAM_ORDER } from "@/state/team";
import { DEMO_SCRIPT } from "./demo/script";
import { FIXED_STEP, createRunController, type RunController } from "./run-controller";

/**
 * A stand-in for the 3D world: every walk takes `travel` seconds and every handoff half a second, reported
 * back as the world would. It shows the demo runtime needs only the world's reports, not the renderer.
 */
function standIn(run: RunController, travel = 1) {
  const due: { at: number; draft: EventDraft }[] = [];
  run.bus.subscribe((event) => {
    if (event.cycle !== run.cycle) return;
    if (event.type === "agent_assigned") {
      run.bus.publish({ type: "agent_move_started", agentId: event.agentId, target: event.target, travel: event.travel }, "world");
      due.push({ at: event.at + travel, draft: { type: "agent_arrived", agentId: event.agentId, target: event.target } });
    }
    if (event.type === "artifact_handoff_started") {
      const { artifactId, kind, from, to } = event;
      due.push({ at: event.at + 0.5, draft: { type: "artifact_handoff_completed", artifactId, kind, from, to } });
    }
  });
  run.attach({
    onCycle: () => (due.length = 0),
    afterStep: () => {
      for (const item of due.filter((d) => d.at <= run.time + 1e-9)) {
        due.splice(due.indexOf(item), 1);
        run.bus.publish(item.draft, "world");
      }
    },
  });
  return run;
}

const headless = () => standIn(createRunController());
const cycleEvents = (run: RunController) => run.bus.history().filter((event) => event.cycle === run.cycle);
/** An event without its position in one particular session, for comparing runs. */
const content = (event: WorkspaceEvent) => ({ ...event, seq: 0, cycle: 0 });

function playUntil(run: RunController, done: (run: RunController) => boolean, frame = FIXED_STEP, speed = 1, maxSeconds = 120) {
  for (let i = 0; i < maxSeconds / frame && !done(run); i += 1) run.advance(frame, speed);
  return run;
}

afterEach(() => vi.unstubAllGlobals());

describe("deterministic demo runtime", () => {
  it("plays the whole recorded story with no 3D world and no network", () => {
    const fetch = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetch);
    const run = playUntil(headless(), (r) => r.demo.endedAt !== null);

    expect(run.demo.endedAt).not.toBeNull();
    expect(run.demo.endedAt!).toBeLessThan(90);
    for (const signal of ["objective", "plan", "discovery", "challenge", "retry-done", "shift", "recommendation"]) {
      expect(run.demo.signals.has(signal)).toBe(true);
    }
    const ws = run.store.getState().workspace;
    expect(ws).toMatchObject({ mode: "demo", objective: { status: "answered" }, recommendation: { status: "final" } });
    expect(ws.cost).toMatchObject({ modelCalls: 0, toolCalls: 0, estimatedUsd: 0 });
    for (const id of TEAM_ORDER) expect(ws.agents[id]!.state).toBe("idle");

    const events = cycleEvents(run);
    expect(events.filter((e) => e.type === "operation_rejected")).toEqual([]);
    expect(new Set(events.map((e) => e.source))).toEqual(new Set(["demo", "user", "world"]));
    expect(events.some((e) => e.operation?.source.kind === "model" || e.type === "model_call_completed")).toBe(false);
    expect(run.bus.stats()).toMatchObject({ rejected: 0, listenerErrors: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("holds at the first walk until the world reports an arrival, rather than faking progress", () => {
    const run = createRunController();
    playUntil(run, (r) => r.time >= 10);
    const types = cycleEvents(run).map((e) => e.type);
    expect(types).toContain("agent_assigned");
    expect(types).not.toContain("agent_arrived");
    expect(types).not.toContain("planning_started");
    expect(run.store.getState().workspace.agents.nova!.state).toBe("assigned");
  });

  it("produces the same story at any frame rate and playback speed", () => {
    const until = 40;
    const story = (run: RunController) => cycleEvents(run).filter((e) => e.at <= until).map(content);
    const reference = story(playUntil(headless(), (r) => r.time >= until + 1));
    expect(reference.length).toBeGreaterThan(100);

    let jitter = 0;
    const jittery = headless();
    while (jittery.time < until + 1) jittery.advance([0.004, 0.031, 0.017, 0.009, 0.052][jitter++ % 5]!);

    expect(story(playUntil(headless(), (r) => r.time >= until + 1, 1 / 30))).toEqual(reference);
    expect(story(playUntil(headless(), (r) => r.time >= until + 1, 1 / 144))).toEqual(reference);
    expect(story(playUntil(headless(), (r) => r.time >= until + 1, 1 / 60, 2))).toEqual(reference);
    expect(story(jittery)).toEqual(reference);
  });

  it("counts at most a tenth of a second for a stalled frame", () => {
    const run = headless();
    const steps = run.advance(5);
    expect(steps).toBeLessThanOrEqual(6);
    expect(run.time).toBeLessThan(0.11);
    expect(run.advance(-1)).toBe(0);
  });

  it("replays the identical story after a restart and after the loop", () => {
    const run = headless();
    /** Ids carry the run number (`c0-…`, `c1-…`), so each run's ids are its own. */
    const replayable = (r: RunController) =>
      JSON.stringify(cycleEvents(playUntil(r, (x) => x.time >= 30)).filter((e) => e.at <= 30).map(content)).replace(/\bc\d+-/g, "c#-");
    const first = replayable(run);
    run.restart();
    expect(run.cycle).toBe(1);
    expect(run.store.getState().workspace.objective).toBeNull();
    expect(replayable(run)).toBe(first);

    playUntil(run, (r) => r.cycle === 2, FIXED_STEP, 1, 200);
    expect(replayable(run)).toBe(first);
  });

  it("keeps the script and the timeline in step", () => {
    const emitted = new Set<string>();
    for (const id of TEAM_ORDER) {
      for (const action of DEMO_SCRIPT[id]) {
        if (action.kind === "emit" || action.kind === "handoff") emitted.add(action.signal);
        if (action.kind === "handoff") expect(TEAM_ORDER).toContain(action.to);
      }
    }
    for (const signal of Object.keys(UAE_TIMELINE)) {
      if (signal !== "objective" && signal !== "budget") expect(emitted).toContain(signal);
    }
  });

  it("fails a live question plainly when no planner is connected", async () => {
    const run = standIn(createRunController());
    run.startLive("Should our bakery deliver through apps?");
    for (let i = 0; i < 120 && run.live?.phase !== "failed"; i += 1) {
      run.step(FIXED_STEP);
      await Promise.resolve();
    }
    expect(run.mode).toBe("real");
    expect(run.live?.phase).toBe("failed");
    expect(cycleEvents(run).find((e) => e.type === "run_failed")).toMatchObject({ reason: "live AI isn't connected here" });
  });
});

describe("waiting for the user's first question", () => {
  it("keeps the deck empty and quiet until a question is asked, and the demo stays one click away", async () => {
    const plan = vi.fn(async () => ({ ok: false as const, reason: "unused" }));
    const run = standIn(createRunController({ requestPlan: plan, start: "waiting" }));
    expect(run.waiting).toBe(true);
    expect(run.store.getState().workspace.objective).toBeNull();
    for (let i = 0; i < 120 / FIXED_STEP; i += 1) run.step(FIXED_STEP);
    expect(run.bus.history()).toHaveLength(0);
    expect(run.answerInput("anything", 1)).toBe(false);

    run.startLive("Should our bakery deliver through apps?");
    expect(run.waiting).toBe(false);
    expect(run.mode).toBe("real");
    for (let i = 0; i < 5 / FIXED_STEP; i += 1) run.step(FIXED_STEP);
    await vi.waitFor(() => expect(plan).toHaveBeenCalledOnce());

    run.restart();
    expect(run.mode).toBe("demo");
    for (let i = 0; i < 2 / FIXED_STEP; i += 1) run.step(FIXED_STEP);
    expect(cycleEvents(run).some((event) => event.type === "objective_received")).toBe(true);
  });
});
