import { describe, expect, it } from "vitest";
import type { StepRequester } from "@/orchestration/live-question";
import { SAMPLE_PLAN } from "@/state/fixtures/sample-plan";
import { AI_KNOWLEDGE_LABEL, LIVE_LIMITS, type AgentStep, type StepResponse } from "@/state/live-work";
import type { PlanResponse } from "@/state/plan";
import { coreState } from "@/visualization/world/sim/world";
import { createLabSession, type LabRun } from "./lab-session";

const DT = 1 / 60;
const QUESTION = "Should our bakery deliver through apps?";
const usage = { calls: 1, inputTokens: 300, outputTokens: 120, estimatedUsd: 0.0002 };
const PLANNED: PlanResponse = { ok: true, plan: SAMPLE_PLAN, usage, runId: "run-test-0001" };

const reply = (step: AgentStep): StepResponse => {
  if (step.kind === "research") {
    return { ok: true, kind: "research", usage, result: { finding: `Finding ${step.task + 1} from general knowledge.`, headline: `Headline ${step.task + 1}`, detail: "In short", kind: "fact" } };
  }
  if (step.kind === "critique") return { ok: true, kind: "critique", usage, result: { target: "a1", headline: "Not so sure", note: "Listing on an app may need paperwork first." } };
  return { ok: true, kind: "synthesis", usage, result: { statement: "Try one app for a month", reason: "Demand looks real, but the listing needs checking.", confidence: "low", basis: ["f1", "f2"] } };
};

/**
 * A fake server: each step answers after `delay` seconds of run time, so overlapping work is visible.
 * `script` can replace a reply (by call number) to simulate failures.
 */
function fakeServer(delay: number | ((step: AgentStep) => number) = 2, script: (step: AgentStep, call: number) => StepResponse | null = () => null) {
  const waiting: { due: number; resolve: () => void }[] = [];
  const calls: AgentStep[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let clock = () => 0;
  const requestStep: StepRequester = (_runId, step, signal) =>
    new Promise((resolve) => {
      calls.push(step);
      const answer = script(step, calls.length) ?? reply(step);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const finish = (value: StepResponse) => {
        inFlight -= 1;
        resolve(value);
      };
      signal.addEventListener("abort", () => finish({ ok: false, reason: "cancelled" }));
      waiting.push({ due: clock() + (typeof delay === "number" ? delay : delay(step)), resolve: () => finish(answer) });
    });
  return {
    requestStep,
    calls,
    maxInFlight: () => maxInFlight,
    bind: (session: LabRun) => (clock = () => session.run.time),
    tick(now: number) {
      for (const item of waiting.filter((w) => w.due <= now)) {
        waiting.splice(waiting.indexOf(item), 1);
        item.resolve();
      }
    },
  };
}

function setup(server = fakeServer()) {
  const session = createLabSession({ requestPlan: async () => PLANNED, requestStep: server.requestStep });
  server.bind(session);
  session.startLive(QUESTION);
  return { session, server };
}

async function play(session: LabRun, server: ReturnType<typeof fakeServer>, seconds: number, until?: (s: LabRun) => boolean, each?: () => void) {
  for (let i = 0; i < seconds / DT; i += 1) {
    session.run.step(DT);
    server.tick(session.run.time);
    for (let k = 0; k < 6; k += 1) await Promise.resolve();
    each?.();
    if (until?.(session)) return;
  }
}

const cycleEvents = (s: LabRun) => s.bus.history().filter((event) => event.cycle === s.world.cycle);
const ws = (s: LabRun) => s.store.getState().workspace;

describe("live question: the team works", () => {
  it("researches, challenges and answers, two agents at a time, then everyone goes home", async () => {
    const { session, server } = setup();
    let maxWorking = 0;
    await play(session, server, 120, (s) => s.run.live?.phase === "answered" && Object.values(ws(s).agents).every((a) => a.state === "idle"), () => {
      const working = ["orion", "sage", "vex"].filter((id) => ws(session).agents[id]!.state === "working").length;
      maxWorking = Math.max(maxWorking, working);
    });

    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind)).toEqual(["research", "research", "research", "critique", "synthesis"]);
    expect(server.maxInFlight()).toBeLessThanOrEqual(LIVE_LIMITS.concurrency);
    expect(maxWorking).toBe(2);

    const record = ws(session);
    expect(record.evidence).toHaveLength(3);
    for (const item of record.evidence) expect(item.source).toEqual({ kind: "model", label: AI_KNOWLEDGE_LABEL, verified: false });
    expect(record.evidence.map((item) => item.foundBy).sort()).toEqual(["orion", "sage", "vex"]);
    expect(record.modules[record.moduleOrder[0]!]!.summary).toEqual({ headline: "Headline 1", detail: "In short" });
    expect(record.assumptions[0]).toMatchObject({ status: "challenged", challenge: { by: "vex", note: "Listing on an app may need paperwork first." } });
    expect(record.recommendation).toMatchObject({ status: "final", statement: "Try one app for a month", confidence: "low" });
    const byTask = (n: number) => record.evidence.find((item) => item.statement.includes(`Finding ${n} `))!.id;
    expect(record.recommendation!.evidenceIds).toEqual([byTask(1), byTask(2)]);
    expect(record.objective?.status).toBe("answered");
    expect(record.cost.modelCalls).toBe(6);
    for (const agent of Object.values(record.agents)) expect(agent.state).toBe("idle");
    expect(coreState(session.world)).toBe("completed");

    const events = cycleEvents(session);
    expect(events.filter((e) => e.type === "operation_rejected")).toEqual([]);
    expect(events.filter((e) => e.type === "evidence_discovered").every((e) => e.operation?.source.kind === "model")).toBe(true);
    const order = events.map((e) => e.type);
    expect(order.indexOf("synthesis_started")).toBeGreaterThan(order.lastIndexOf("evidence_discovered"));
    expect(order.indexOf("assumption_challenged")).toBeLessThan(order.indexOf("synthesis_started"));
    expect(events.find((e) => e.type === "recommendation_updated")?.summary).toBe("Tentative answer: Try one app for a month");
  });

  it("shows a failed task and its retry, and keeps going", async () => {
    let failed = false;
    const server = fakeServer(2, (step) => {
      if (failed || step.kind !== "research" || step.task !== 0) return null;
      failed = true;
      return { ok: false, reason: "the AI service is busy or out of credit", usage };
    });
    const { session } = setup(server);
    const orion = new Set<string>();
    await play(session, server, 120, (s) => s.run.live?.phase === "answered", () => orion.add(ws(session).agents.orion!.state));
    expect(orion.has("failed")).toBe(true);
    expect(orion.has("retrying")).toBe(true);
    expect(server.calls.filter((step) => step.kind === "research" && step.task === 0)).toHaveLength(2);
    expect(ws(session).evidence).toHaveLength(3);
    expect(session.run.live?.phase).toBe("answered");
  });

  it("still sends Vex to review when his own research finishes last", async () => {
    const server = fakeServer((step) => (step.kind === "research" && step.task === 2 ? 9 : 1));
    const { session } = setup(server);
    await play(session, server, 120, (s) => s.run.live?.phase === "answered");
    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind).slice(-2)).toEqual(["critique", "synthesis"]);
  });

  it("stops honestly when the question reaches its limit, and sends the team home", async () => {
    const server = fakeServer(1, (step) => (step.kind === "synthesis" ? { ok: false, reason: "this question reached its spending limit", stop: true } : null));
    const { session } = setup(server);
    await play(session, server, 120, (s) => s.run.live?.phase === "waiting" && Object.values(ws(s).agents).every((a) => a.state === "idle"));
    expect(session.run.live?.phase).toBe("waiting");
    expect(server.calls.filter((step) => step.kind === "synthesis")).toHaveLength(1);
    expect(ws(session).recommendation).toBeNull();
    expect(cycleEvents(session).find((e) => e.type === "run_waiting")).toMatchObject({ summary: "The team stopped: this question reached its spending limit." });
    expect(coreState(session.world)).toBe("waiting");
    for (const agent of Object.values(ws(session).agents)) expect(agent.state).toBe("idle");
  });

  it("skips the review and the answer when no research succeeds", async () => {
    const server = fakeServer(1, (step) => (step.kind === "research" ? { ok: false, reason: "the AI's reply didn't pass MORPH's checks", usage } : null));
    const { session } = setup(server);
    await play(session, server, 120, (s) => s.run.live?.phase === "waiting");
    expect(server.calls.every((step) => step.kind === "research")).toBe(true);
    expect(server.calls).toHaveLength(6);
    expect(ws(session).evidence).toEqual([]);
    expect(cycleEvents(session).some((e) => e.type === "synthesis_started")).toBe(false);
  });

  it("cancels the work in flight when the user goes back to the demo", async () => {
    const server = fakeServer(30);
    const { session } = setup(server);
    await play(session, server, 30, () => server.calls.length >= 2);
    expect(server.calls.length).toBe(2);
    session.restart();
    await play(session, server, 1);
    expect(session.run.live).toBeNull();
    expect(server.maxInFlight()).toBe(2);
    await play(session, server, 40);
    expect(server.calls.length).toBe(2);
    expect(ws(session).mode).toBe("demo");
  });
});
