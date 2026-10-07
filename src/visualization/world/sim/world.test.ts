import { describe, expect, it } from "vitest";
import type { EventDraft, WorkspaceEvent } from "@/events/schema";
import { UAE_TIMELINE } from "@/state/fixtures/uae-market";
import { AGENT_ORDER, CORE_RADIUS, homePosition } from "./roster";
import { MODULE_CATALOG, SCRIPT } from "./script";
import { LOOP_RESTART_DELAY, createDemoSession, type DemoSession } from "./session";
import type { AgentId, AgentState } from "./types";
import { coreState, createWorld, planRoute, reactToEvent, scenarioWeights } from "./world";

const DT = 1 / 60;

function runUntil(session: DemoSession, predicate: (s: DemoSession) => boolean, maxSeconds = 120) {
  const seen = new Map<AgentId, Set<AgentState>>(AGENT_ORDER.map((id) => [id, new Set<AgentState>()]));
  for (let i = 0; i < maxSeconds / DT; i += 1) {
    session.step(DT);
    for (const id of AGENT_ORDER) seen.get(id)?.add(session.world.agents[id].state);
    if (predicate(session)) break;
  }
  return { session, seen };
}
const signal = (s: DemoSession, name: string) => s.runner.signals.get(name);
const ended = (s: DemoSession) => s.runner.endedAt !== null;
const cycleEvents = (s: DemoSession) => s.bus.history().filter((event) => event.cycle === s.world.cycle);

describe("lab agent simulation", () => {
  it("plays the flagship story in order within a minute and a half", () => {
    const { session } = runUntil(createDemoSession(), ended);
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
    expect(session.runner.endedAt!).toBeLessThan(90);
  });

  it("drives every agent through real movement and work states", () => {
    const { seen } = runUntil(createDemoSession(), ended);
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
    const a = runUntil(createDemoSession(), (s) => s.world.time > 40).session;
    const b = runUntil(createDemoSession(), (s) => s.world.time > 40).session;
    expect(a.bus.history()).toEqual(b.bus.history());
    expect(a.world.agents.orion.position).toEqual(b.world.agents.orion.position);
  });

  it("waits for the budget and accepts an early user confirmation", () => {
    const { session } = runUntil(createDemoSession(), (s) => signal(s, "budget-request") !== undefined);
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
    const { session } = runUntil(createDemoSession(), (s) => signal(s, "budget") !== undefined);
    const answer = cycleEvents(session).find((event) => event.type === "human_input_received")!;
    expect(answer).toMatchObject({ source: "demo", answeredBy: "autoplay" });
  });

  it("materializes modules only when the plan or the builder creates them", () => {
    const session = createDemoSession();
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
      for (const action of SCRIPT[id]) {
        if (action.kind === "moveTo" && "zone" in action.target) expect(known.has(action.target.zone)).toBe(true);
        if (action.kind === "hold" && action.zone) expect(known.has(action.zone)).toBe(true);
        if (action.kind === "emit") expect(UAE_TIMELINE[action.signal]).toBeDefined();
      }
    }
  });

  it("only sends agents to modules that exist, and keeps the demo layout stable", () => {
    const session = createDemoSession();
    const positions = new Map<string, string>();
    for (let i = 0; i < 70 / DT; i += 1) {
      session.step(DT);
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
    const { session } = runUntil(createDemoSession(), (s) => ended(s) && s.world.time > s.runner.endedAt! + LOOP_RESTART_DELAY - 0.1);
    expect(session.world.cycle).toBe(0);
    expect(session.world.moduleOrder).toHaveLength(0);
  });

  it("reports core states and scenario weights from events", () => {
    const session = createDemoSession();
    expect(coreState(session.world)).toBe("dormant");
    expect(scenarioWeights(session.world)).toBeNull();
    runUntil(session, (s) => signal(s, "recommendation") !== undefined);
    expect(coreState(session.world)).toBe("completed");
    const weights = scenarioWeights(session.world)!;
    expect(weights.partnership).toBeGreaterThan(weights.direct);
    expect(weights.partnership).toBeGreaterThan(weights.delay);
  });

  it("routes walks around the Intent Core", () => {
    const route = planRoute([-6, 3], [6, -3]);
    expect(route).toHaveLength(2);
    const [wx, wz] = route[0]!;
    expect(Math.hypot(wx, wz)).toBeGreaterThan(CORE_RADIUS);
    expect(planRoute([-6, 3], [-10, -1.5])).toHaveLength(1);
  });

  it("restarts the loop after the recommendation settles", () => {
    const { session } = runUntil(createDemoSession(), (s) => s.world.cycle === 1);
    expect(session.world.cycle).toBe(1);
    expect(session.runner.signals.size).toBe(0);
    expect(session.bus.history().at(-1)).toMatchObject({ type: "run_started", cycle: 1 });
  });

  it("turns agents resting at home to face out from the Core", () => {
    const { session } = runUntil(createDemoSession(), (s) => ended(s) && s.world.time > s.runner.endedAt! + 4);
    for (const id of AGENT_ORDER) {
      const [hx, hz] = homePosition(id);
      const agent = session.world.agents[id];
      if (Math.hypot(agent.position[0] - hx, agent.position[1] - hz) < 0.3) {
        expect(agent.facing).toBeCloseTo(Math.atan2(hx, hz), 5);
      }
    }
  });
});

describe("event-driven world", () => {
  it("never moves an agent without an assignment, and reports each arrival", () => {
    const session = createDemoSession();
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
      session.step(DT);
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
    const { session } = runUntil(createDemoSession(), (s) => cycleEvents(s).some((e) => e.type === "agent_arrived" && e.agentId === "nova"));
    const nova = cycleEvents(session).filter((e) => "agentId" in e && e.agentId === "nova").map((e) => [e.type, e.source]);
    expect(nova.slice(0, 3)).toEqual([
      ["agent_assigned", "demo"],
      ["agent_move_started", "world"],
      ["agent_arrived", "world"],
    ]);
  });

  it("acts out whatever events it is given, without the story runner", () => {
    const world = createWorld();
    const reports: string[] = [];
    let seq = 0;
    const feed = (draft: EventDraft) =>
      reactToEvent(world, { ...draft, seq: ++seq, at: 0, cycle: 0, source: "demo" } as WorkspaceEvent, (r) => reports.push(r.type));
    feed({ type: "module_created", module: { id: "valuation", title: "Valuation", kind: "valuation", group: "analysis" } });
    feed({ type: "module_updated", moduleId: "valuation", headline: "Fair price found", detail: "Within range" });
    feed({ type: "agent_assigned", agentId: "sage", target: { kind: "module", moduleId: "valuation" }, task: "pricing", travel: "moving" });
    expect(world.modules.valuation).toMatchObject({ visible: true, headline: { headline: "Fair price found" } });
    expect(world.modules.valuation!.spec.station).toBe("console");
    expect(world.agents.sage).toMatchObject({ state: "assigned", task: "pricing" });
    expect(world.agents.sage.route.length).toBeGreaterThan(0);
    feed({ type: "assumption_challenged", assumptionId: "a", by: "vex", note: "Prove it." });
    expect(coreState(world)).toBe("uncertain");
    feed({ type: "agent_assigned", agentId: "ghost", target: { kind: "home" }, task: "haunting", travel: "moving" });
    expect(Object.keys(world.agents)).not.toContain("ghost");
  });

  it("narrates the story moments the approved HUD narrated", () => {
    const { session } = runUntil(createDemoSession(), (s) => signal(s, "recommendation") !== undefined);
    const summaries = cycleEvents(session).flatMap((event) => (event.summary ? [event.summary] : []));
    expect(summaries[0]).toBe("You asked the team a question.");
    expect(summaries).toContain("You set the launch budget: USD 500,000.");
    expect(summaries.at(-1)).toBe("The answer: start with a local partner.");
    expect(summaries).toHaveLength(new Set(summaries).size);
  });
});
