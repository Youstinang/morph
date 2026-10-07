import { describe, expect, it } from "vitest";
import { SAMPLE_PLAN } from "@/state/fixtures/sample-plan";
import type { PlanResponse } from "@/state/plan";
import type { PlanRequester } from "@/orchestration/live-question";
import { moduleSpot } from "@/visualization/world/sim/modules";
import { coreState } from "@/visualization/world/sim/world";
import { createLabSession, type LabRun } from "./lab-session";

const DT = 1 / 60;
const usage = { calls: 1, inputTokens: 300, outputTokens: 700, estimatedUsd: 0.0009 };

/** Steps the session, letting the pending plan request settle between frames. */
async function run(session: LabRun, seconds: number, until?: (s: LabRun) => boolean) {
  for (let i = 0; i < seconds / DT; i += 1) {
    session.run.step(DT);
    await Promise.resolve();
    if (until?.(session)) return;
  }
}

function requester(answer: PlanResponse) {
  const asked: { objective: string; signal: AbortSignal }[] = [];
  const fn: PlanRequester = async (objective, signal) => {
    asked.push({ objective, signal });
    return answer;
  };
  return { fn, asked };
}

const cycleEvents = (s: LabRun) => s.bus.history().filter((event) => event.cycle === s.world.cycle);

describe("live question", () => {
  it("plans the user's question, opens its stations, sends the agents, then honestly waits", async () => {
    const { fn, asked } = requester({ ok: true, plan: SAMPLE_PLAN, usage });
    const session = createLabSession({ requestPlan: fn });
    await run(session, 5);
    session.startLive("Should our bakery deliver through apps?");
    expect(session.mode).toBe("real");
    expect(session.world.moduleOrder).toEqual([]);
    await run(session, 30, (s) => s.run.live?.phase === "waiting");

    expect(asked.map((a) => a.objective)).toEqual(["Should our bakery deliver through apps?"]);
    expect(session.run.live?.phase).toBe("waiting");
    const ws = session.store.getState().workspace;
    expect(ws).toMatchObject({ mode: "real", objective: { text: "Should our bakery deliver through apps?" } });
    expect(ws.moduleOrder).toHaveLength(3);
    expect(ws.assumptions).toHaveLength(1);
    expect(ws.humanInputs[0]).toMatchObject({ status: "pending" });
    expect(ws.evidence).toEqual([]);
    expect(ws.cost).toMatchObject({ modelCalls: 1, inputTokens: 300, outputTokens: 700 });
    expect(ws.agents.orion).toMatchObject({ state: "waiting", task: "checking who orders bakery delivery" });
    expect(ws.agents.brix!.state).toBe("idle");

    const world = session.world;
    expect(world.moduleOrder).toEqual(ws.moduleOrder);
    for (const [agent, mod] of [["orion", 0], ["sage", 1], ["vex", 2]] as const) {
      const spot = moduleSpot(world, ws.moduleOrder[mod]!, agent)!;
      expect(Math.hypot(world.agents[agent].position[0] - spot[0], world.agents[agent].position[1] - spot[1])).toBeLessThan(0.05);
    }
    expect(coreState(world)).toBe("waiting");

    const events = cycleEvents(session);
    expect(events.filter((e) => e.type === "operation_rejected")).toEqual([]);
    expect(events.find((e) => e.type === "objective_received")?.operation?.source.kind).toBe("user");
    expect(events.filter((e) => e.type === "module_created").every((e) => e.operation?.source.kind === "model")).toBe(true);
    const order = events.map((e) => e.type);
    expect(order.indexOf("planning_started")).toBeGreaterThan(order.indexOf("agent_arrived"));
    expect(order.indexOf("module_created")).toBeGreaterThan(order.indexOf("model_call_completed"));
    expect(events.at(-1)).toMatchObject({ type: "run_waiting" });
  });

  it("shows a failed plan as a failure and sends Nova back", async () => {
    const session = createLabSession({ requestPlan: requester({ ok: false, reason: "the AI service is busy or out of credit." }).fn });
    session.startLive("Should our bakery deliver through apps?");
    await run(session, 10, (s) => s.run.live?.phase === "failed");
    expect(session.run.live?.phase).toBe("failed");
    expect(coreState(session.world)).toBe("error");
    expect(cycleEvents(session).find((e) => e.type === "run_failed")?.summary).toBe("Live AI couldn't make a plan: the AI service is busy or out of credit.");
    expect(session.world.moduleOrder).toEqual([]);
    await run(session, 6);
    expect(session.world.agents.nova.state).toBe("idle");
  });

  it("refuses a malformed plan that slipped past the server", async () => {
    const bad = { ok: true, plan: { ...SAMPLE_PLAN, modules: [] }, usage } as unknown as PlanResponse;
    const session = createLabSession({ requestPlan: requester(bad).fn });
    session.startLive("Should our bakery deliver through apps?");
    await run(session, 10, (s) => s.run.live?.phase === "failed");
    expect(session.run.live?.phase).toBe("failed");
    expect(session.store.getState().workspace.moduleOrder).toEqual([]);
  });

  it("cancels the request when the user goes back to the demo, and the demo plays again", async () => {
    const never: PlanRequester = (_, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, reason: "cancelled" })));
    let signal: AbortSignal | null = null;
    const session = createLabSession({
      requestPlan: (objective, s) => {
        signal = s;
        return never(objective, s);
      },
    });
    session.startLive("Should our bakery deliver through apps?");
    await run(session, 3);
    expect(signal!.aborted).toBe(false);
    session.restart();
    expect(signal!.aborted).toBe(true);
    expect(session.mode).toBe("demo");
    expect(session.run.live).toBeNull();
    await run(session, 12);
    expect(session.store.getState().workspace).toMatchObject({ mode: "demo", objective: { text: expect.stringMatching(/UAE/) } });
    expect(cycleEvents(session).some((e) => e.type === "run_failed")).toBe(false);
  });
});
