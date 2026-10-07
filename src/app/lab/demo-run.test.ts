import { describe, expect, it } from "vitest";
import { UAE_TIMELINE } from "@/state/fixtures/uae-market";
import { DEMO_SCRIPT } from "@/orchestration/demo/script";
import { LOOP_RESTART_DELAY } from "@/orchestration/run-controller";
import { MODULE_CATALOG } from "@/visualization/world/sim/presentation";
import { AGENT_ORDER, homePosition } from "@/visualization/world/sim/roster";
import type { AgentId, AgentState } from "@/visualization/world/sim/types";
import { coreState, scenarioWeights } from "@/visualization/world/sim/world";
import { createLabSession, type LabRun } from "./lab-session";

const DT = 1 / 60;

function runUntil(session: LabRun, predicate: (s: LabRun) => boolean, maxSeconds = 120) {
  const seen = new Map<AgentId, Set<AgentState>>(AGENT_ORDER.map((id) => [id, new Set<AgentState>()]));
  for (let i = 0; i < maxSeconds / DT; i += 1) {
    session.run.step(DT);
    for (const id of AGENT_ORDER) seen.get(id)?.add(session.world.agents[id].state);
    if (predicate(session)) break;
  }
  return { session, seen };
}
const signal = (s: LabRun, name: string) => s.run.demo.signals.get(name);
const ended = (s: LabRun) => s.run.demo.endedAt !== null;
const cycleEvents = (s: LabRun) => s.bus.history().filter((event) => event.cycle === s.world.cycle);

describe("deterministic demo run", () => {
  it("plays the flagship story in order within a minute and a half", () => {
    const { session } = runUntil(createLabSession(), ended);
    const order = [
      "objective",
      "planning",
      "plan",
      "pkg-market",
      "discovery",
      "zone:economics",
      "analysis",
      "challenge",
      "retry",
      "zone:possibility",
      "scenarios",
      "shift",
      "synthesis",
      "recommendation",
    ];
    const times = order.map((name) => signal(session, name));
    times.forEach((time) => expect(time).toBeDefined());
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(signal(session, "budget")!).toBeLessThan(signal(session, "challenge")!);
    expect(signal(session, "retry-done")!).toBeGreaterThan(signal(session, "retry")!);
    expect(signal(session, "retry-done")!).toBeLessThanOrEqual(signal(session, "shift")!);
    expect(session.run.demo.endedAt!).toBeLessThan(90);
  });

  it("drives every agent through real movement and work states", () => {
    const { seen } = runUntil(createLabSession(), ended);
    for (const id of AGENT_ORDER) {
      const states = seen.get(id)!;
      expect(states.has("moving") || states.has("returning")).toBe(true);
      expect(states.has("working") || states.has("evaluating") || states.has("collaborating")).toBe(true);
    }
    const orion = seen.get("orion")!;
    for (const state of ["assigned", "handoff", "failed", "retrying", "completed", "returning"] as const) {
      expect(orion.has(state)).toBe(true);
    }
    expect(seen.get("sage")!.has("waiting")).toBe(true);
    expect(seen.get("vex")!.has("handoff")).toBe(true);
  });

  it("is deterministic", () => {
    const a = runUntil(createLabSession(), (s) => s.world.time > 40).session;
    const b = runUntil(createLabSession(), (s) => s.world.time > 40).session;
    expect(a.bus.history()).toEqual(b.bus.history());
    expect(a.world.agents.orion.position).toEqual(b.world.agents.orion.position);
  });

  it("waits for the budget and accepts an early user confirmation", () => {
    const { session } = runUntil(createLabSession(), (s) => signal(s, "budget-request") !== undefined);
    expect(signal(session, "budget")).toBeUndefined();
    expect(session.world.agents.nova.state).toBe("waiting");
    expect(session.world.story.budgetPending).toBe(true);
    expect(session.answerBudget()).toBe(true);
    expect(session.answerBudget()).toBe(false);
    expect(signal(session, "budget")).toBe(session.world.time);
    const answer = cycleEvents(session).find((event) => event.type === "human_input_received")!;
    expect(answer).toMatchObject({ source: "user", answeredBy: "user" });
    expect(session.world.story.budgetPending).toBe(false);
  });

  it("auto-answers the budget in autoplay, marked as the demo rather than the user", () => {
    const { session } = runUntil(createLabSession(), (s) => signal(s, "budget") !== undefined);
    const answer = cycleEvents(session).find((event) => event.type === "human_input_received")!;
    expect(answer).toMatchObject({ source: "demo", answeredBy: "autoplay" });
  });

  it("materializes modules only when the plan or the builder creates them", () => {
    const session = createLabSession();
    expect(session.world.moduleOrder).toHaveLength(0);
    runUntil(session, (s) => signal(s, "plan") !== undefined);
    expect(session.world.moduleOrder).toEqual(["market", "competition", "regulation"]);
    expect(session.world.modules.market!.visible).toBe(true);
    runUntil(session, (s) => signal(s, "discovery") !== undefined);
    expect(session.world.modules.economics!.visible).toBe(false);
    runUntil(session, (s) => signal(s, "zone:risk") !== undefined);
    expect(session.world.modules.economics!.visible).toBe(true);
    expect(session.world.modules.risk!.visible).toBe(true);
  });

  it("keeps every module the script sends agents to in the module catalog and the timeline", () => {
    const known = new Set(Object.keys(MODULE_CATALOG));
    for (const id of AGENT_ORDER) {
      for (const action of DEMO_SCRIPT[id]) {
        if (action.kind === "moveTo" && "zone" in action.target) expect(known.has(action.target.zone)).toBe(true);
        if (action.kind === "hold" && action.zone) expect(known.has(action.zone)).toBe(true);
        if (action.kind === "emit") expect(UAE_TIMELINE[action.signal]).toBeDefined();
      }
    }
  });

  it("only sends agents to modules that exist, and keeps the demo layout stable", () => {
    const session = createLabSession();
    const positions = new Map<string, string>();
    for (let i = 0; i < 70 / DT; i += 1) {
      session.run.step(DT);
      const world = session.world;
      for (const id of AGENT_ORDER) {
        const zone = world.agents[id].zone;
        if (zone) expect(world.modules[zone]).toBeDefined();
      }
      for (const id of world.moduleOrder) {
        const key = world.modules[id]!.position.join(",");
        expect(positions.get(id) ?? key).toBe(key);
        positions.set(id, key);
      }
    }
  });

  it("dissolves every module before the loop restarts", () => {
    const { session } = runUntil(createLabSession(), (s) => ended(s) && s.world.time > s.run.demo.endedAt! + LOOP_RESTART_DELAY - 0.1);
    expect(session.world.cycle).toBe(0);
    expect(session.world.moduleOrder).toHaveLength(0);
  });

  it("reports core states and scenario weights from events", () => {
    const session = createLabSession();
    expect(coreState(session.world)).toBe("dormant");
    expect(scenarioWeights(session.world)).toBeNull();
    runUntil(session, (s) => signal(s, "recommendation") !== undefined);
    expect(coreState(session.world)).toBe("completed");
    const weights = scenarioWeights(session.world)!;
    expect(weights.partnership).toBeGreaterThan(weights.direct);
    expect(weights.partnership).toBeGreaterThan(weights.delay);
  });

  it("restarts the loop after the recommendation settles", () => {
    const { session } = runUntil(createLabSession(), (s) => s.world.cycle === 1);
    expect(session.world.cycle).toBe(1);
    expect(session.run.demo.signals.size).toBe(0);
    expect(session.bus.history().at(-1)).toMatchObject({ type: "run_started", cycle: 1 });
  });

  it("turns agents resting at home to face out from the Core", () => {
    const { session } = runUntil(createLabSession(), (s) => ended(s) && s.world.time > s.run.demo.endedAt! + 4);
    for (const id of AGENT_ORDER) {
      const [hx, hz] = homePosition(id);
      const agent = session.world.agents[id];
      if (Math.hypot(agent.position[0] - hx, agent.position[1] - hz) < 0.3) {
        expect(agent.facing).toBeCloseTo(Math.atan2(hx, hz), 5);
      }
    }
  });
});

describe("event-driven world on the demo run", () => {
  it("never moves an agent without an assignment, and reports each arrival", () => {
    const session = createLabSession();
    const moving = new Map<string, boolean>();
    const arrivals: string[] = [];
    const arrivedThisStep = new Set<string>();
    session.bus.subscribe((event) => {
      if (event.type === "agent_assigned") moving.set(event.agentId, true);
      if (event.type === "agent_arrived") {
        expect(moving.get(event.agentId)).toBe(true);
        moving.set(event.agentId, false);
        arrivedThisStep.add(event.agentId);
        arrivals.push(event.agentId);
      }
    });
    const last = new Map(AGENT_ORDER.map((id) => [id, [...session.world.agents[id].position].join()]));
    for (let i = 0; i < 70 / DT; i += 1) {
      arrivedThisStep.clear();
      session.run.step(DT);
      for (const id of AGENT_ORDER) {
        const now = session.world.agents[id].position.join();
        const working = session.world.agents[id].zone !== null;
        if (now !== last.get(id) && !working && !arrivedThisStep.has(id)) expect(moving.get(id)).toBe(true);
        last.set(id, now);
      }
    }
    for (const id of AGENT_ORDER) expect(arrivals).toContain(id);
  });

  it("starts the walk only after the assignment pause, and reports it", () => {
    const { session } = runUntil(createLabSession(), (s) => cycleEvents(s).some((e) => e.type === "agent_arrived" && e.agentId === "nova"));
    const nova = cycleEvents(session).filter((e) => "agentId" in e && e.agentId === "nova").map((e) => [e.type, e.source]);
    expect(nova.slice(0, 3)).toEqual([
      ["agent_assigned", "demo"],
      ["agent_move_started", "world"],
      ["agent_arrived", "world"],
    ]);
  });

  it("narrates the story moments the approved HUD narrated", () => {
    const { session } = runUntil(createLabSession(), (s) => signal(s, "recommendation") !== undefined);
    const summaries = cycleEvents(session).flatMap((event) => (event.summary ? [event.summary] : []));
    expect(summaries[0]).toBe("You asked the team a question.");
    expect(summaries).toContain("You set the launch budget: USD 500,000.");
    expect(summaries.at(-1)).toBe("The answer: start with a local partner.");
    expect(summaries).toHaveLength(new Set(summaries).size);
  });
});
