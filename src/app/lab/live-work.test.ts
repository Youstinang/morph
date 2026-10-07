import { describe, expect, it } from "vitest";
import type { AnswerRequester, StepRequester } from "@/orchestration/live-question";
import type { InputValue } from "@/state/input-controls";
import { SAMPLE_PLAN } from "@/state/fixtures/sample-plan";
import { AI_KNOWLEDGE_LABEL, AI_SUMMARY_LABEL, LIVE_LIMITS, type AgentStep, type AnswerRequest, type StepResponse } from "@/state/live-work";
import type { PlanResponse } from "@/state/plan";
import { coreState } from "@/visualization/world/sim/world";
import { changeLines } from "@/state/selectors";
import { createLabSession, type LabRun } from "./lab-session";

const DT = 1 / 60;
const QUESTION = "Should our bakery deliver through apps?";
const usage = { calls: 1, inputTokens: 300, outputTokens: 120, estimatedUsd: 0.0002 };
const PLANNED: PlanResponse = { ok: true, plan: SAMPLE_PLAN, usage, runId: "run-test-0001" };

const reply = (step: AgentStep): StepResponse => {
  if (step.kind === "research") {
    return { ok: true, kind: "research", usage, result: { finding: `Finding ${step.task + 1} from general knowledge.`, headline: `Headline ${step.task + 1}`, detail: "In short", kind: "fact" } };
  }
  if (step.kind === "combine") return { ok: true, kind: "combine", usage, result: { insight: "Demand is there, but fees decide whether it pays.", headline: "Fees decide it" } };
  if (step.kind === "critique") return { ok: true, kind: "critique", usage, result: { target: "a1", headline: "Not so sure", note: "Listing on an app may need paperwork first." } };
  if (step.kind === "recheck") {
    return { ok: true, kind: "recheck", usage, result: { verdict: "revised", finding: "Finding 1, revised after a second look.", headline: "Revised", detail: "Second look", kind: "risk" } };
  }
  if (step.kind === "paths") {
    return {
      ok: true,
      kind: "paths",
      usage,
      result: {
        paths: [
          { label: "Try one app", assessment: 0.62, why: "Demand is there and the kitchen has room.", risk: "Fees may eat the margin.", basis: ["f1", "f2"] },
          { label: "Wait a season", assessment: 0.3, why: "Keeps things simple while demand settles.", risk: "Rivals win the app customers.", basis: ["f3"] },
        ],
      },
    };
  }
  return { ok: true, kind: "synthesis", usage, result: { statement: "Try one app for a month", reason: "Demand looks real, but the listing needs checking.", confidence: "low", basis: ["f1", "f2"] } };
};

/**
 * A fake server: each step answers after `delay` seconds of run time, so overlapping work is visible.
 * `script` can replace a reply (by call number) to simulate failures.
 */
function fakeServer(delay: number | ((step: AgentStep) => number) = 2, script: (step: AgentStep, call: number) => StepResponse | null = () => null) {
  const waiting: { due: number; resolve: () => void }[] = [];
  const calls: AgentStep[] = [];
  const answers: AnswerRequest[] = [];
  const requestAnswer: AnswerRequester = async (request) => {
    answers.push(request);
    return { ok: true };
  };
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
    requestAnswer,
    answers,
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

/** How each test's user replies to Nova's question, as soon as it shows; null leaves it open. */
const replying = new WeakMap<LabRun, InputValue | "skip" | null>();

function setup(server = fakeServer(), reply: InputValue | "skip" | null = 40, planned: PlanResponse = PLANNED) {
  const session = createLabSession({ requestPlan: async () => planned, requestStep: server.requestStep, requestAnswer: server.requestAnswer });
  server.bind(session);
  replying.set(session, reply);
  session.startLive(QUESTION);
  return { session, server };
}

const pendingQuestion = (s: LabRun) => s.store.getState().workspace.humanInputs.find((item) => item.status === "pending") ?? null;

async function play(session: LabRun, server: ReturnType<typeof fakeServer>, seconds: number, until?: (s: LabRun) => boolean, each?: () => void) {
  for (let i = 0; i < seconds / DT; i += 1) {
    const reply = replying.get(session);
    const open = pendingQuestion(session);
    if (open && reply !== null && reply !== undefined) {
      if (reply === "skip") session.skipInput(open.id);
      else session.answerInput(open.id, reply);
    }
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
  it("shows each web search, fills the station's sources, and records sourced findings as unverified tool results", async () => {
    const page = { url: "https://example.com/fees", title: "App fees guide" };
    const server = fakeServer(2, (step) => {
      if (step.kind !== "research") return null;
      const base = { finding: `Finding ${step.task + 1} from the web.`, headline: "Fees", detail: "Per order", kind: "fact" as const };
      if (step.task === 1) return { ok: true, kind: "research", usage, result: { ...base, sources: [], searchNote: "the web search found nothing usable" } };
      return { ok: true, kind: "research", usage, result: { ...base, sources: step.task === 0 ? [page, { url: "https://b.example.org/", title: "B" }] : [page] } };
    });
    const { session } = setup(server, 40, { ...PLANNED, webSearch: true });
    await play(session, server, 120, (s) => s.run.live?.phase === "answered");
    const events = cycleEvents(session);
    const started = events.filter((event) => event.type === "tool_started");
    expect(started.map((event) => event.type === "tool_started" && `${event.agentId}:${event.tool}`).sort()).toEqual(["orion:web_search", "sage:web_search", "vex:web_search"]);
    expect(events.filter((event) => event.type === "tool_completed")).toHaveLength(2);
    expect(events.find((event) => event.type === "tool_failed")).toMatchObject({ reason: "the web search found nothing usable" });
    expect(events.filter((event) => event.type === "sources_checked").map((event) => event.type === "sources_checked" && event.total).sort()).toEqual([1, 2]);

    const record = ws(session);
    expect(Object.fromEntries(record.toolCalls.map((call) => [call.agentId, call.status]))).toEqual({ orion: "succeeded", sage: "failed", vex: "succeeded" });
    expect(record.cost.toolCalls).toBe(3);
    const first = record.evidence.find((item) => item.statement === "Finding 1 from the web.")!;
    expect(first.source).toEqual({ kind: "tool", label: "Web search, summarized by AI: App fees guide", url: page.url, verified: false });
    expect(record.evidence.find((item) => item.statement === "Finding 2 from the web.")!.source).toMatchObject({ kind: "model", label: AI_KNOWLEDGE_LABEL });
    expect(record.evidence.every((item) => item.source.kind === "user" || !item.source.verified)).toBe(true);
    expect(session.world.modules[record.moduleOrder[0]!]!.evidence).toBe(2);

    const explained = changeLines(record.changes, record.evidence, record.assumptions);
    expect(explained.map((line) => line.change)).toEqual([
      'Gave the answer: "Try one app for a month"',
      'Opened the "Possible paths" station',
      'Opened the "Operating risks" station',
      'Opened the "App costs" station',
      'Opened the "Customer demand" station',
    ]);
    expect(explained[0]).toMatchObject({ by: "Lume", basis: expect.arrayContaining([{ text: "Finding 1 from the web.", site: "example.com" }]) });
    expect(explained[4]).toMatchObject({ by: "Nova", reason: SAMPLE_PLAN.modules[0]!.why });
  });

  it("researches, challenges and answers, as many at once as allowed, then everyone goes home", async () => {
    const { session, server } = setup();
    let maxWorking = 0;
    await play(session, server, 120, (s) => s.run.live?.phase === "answered" && Object.values(ws(s).agents).every((a) => a.state === "idle"), () => {
      const working = ["orion", "sage", "vex"].filter((id) => ws(session).agents[id]!.state === "working").length;
      maxWorking = Math.max(maxWorking, working);
    });

    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind)).toEqual(["research", "research", "research", "combine", "critique", "paths", "synthesis"]);
    expect(server.maxInFlight()).toBeLessThanOrEqual(LIVE_LIMITS.concurrency);
    expect(maxWorking).toBeGreaterThanOrEqual(2);
    expect(maxWorking).toBeLessThanOrEqual(LIVE_LIMITS.concurrency);

    const record = ws(session);
    expect(record.evidence).toHaveLength(5);
    const model = record.evidence.filter((item) => item.foundBy !== "user");
    for (const item of model) {
      const label = item.statement.startsWith("Finding") ? AI_KNOWLEDGE_LABEL : AI_SUMMARY_LABEL;
      expect(item.source).toEqual({ kind: "model", label, verified: false });
    }
    expect(model.map((item) => item.foundBy).sort()).toEqual(["orion", "sage", "sage", "vex"]);
    const yours = record.evidence.find((item) => item.foundBy === "user")!;
    expect(yours).toMatchObject({ statement: "How many extra orders a day can the kitchen handle: 40 orders.", source: { kind: "user", verified: true } });
    expect(record.evidence.find((item) => item.statement.startsWith("Demand is there"))).toMatchObject({ foundBy: "sage", moduleId: null });
    expect(record.modules[record.moduleOrder[0]!]!.summary).toEqual({ headline: "Headline 1", detail: "In short" });
    expect(record.assumptions[0]).toMatchObject({ status: "challenged", challenge: { by: "vex", note: "Listing on an app may need paperwork first." } });
    expect(record.recommendation).toMatchObject({ status: "final", statement: "Try one app for a month", confidence: "low" });
    const byTask = (n: number) => record.evidence.find((item) => item.statement.includes(`Finding ${n} `))!.id;
    expect(record.recommendation!.evidenceIds).toEqual([byTask(1), byTask(2), yours.id]);
    expect(server.answers).toEqual([{ runId: "run-test-0001", question: 0, reply: { kind: "answer", value: 40 } }]);
    expect(record.objective?.status).toBe("answered");
    expect(record.cost.modelCalls).toBe(8);
    const station = Object.values(record.modules).find((item) => item.kind === "possibility")!;
    expect(station).toMatchObject({ title: "Possible paths", group: "decision", summary: { headline: "Best fit: Try one app", detail: "Lume's rough weighing, not a prediction" } });
    expect(record.scenarios.map((path) => [path.label, path.assessment])).toEqual([["Try one app", 0.62], ["Wait a season", 0.3]]);
    expect(record.scenarios[0]).toMatchObject({ why: "Demand is there and the kitchen has room.", risk: "Fees may eat the margin.", evidenceIds: [byTask(1), byTask(2)] });
    expect(record.scenarios[1]!.evidenceIds).toEqual([byTask(3)]);
    expect(session.world.story.scenarios.map((path) => path.label)).toEqual(["Try one app", "Wait a season"]);
    for (const agent of Object.values(record.agents)) expect(agent.state).toBe("idle");
    expect(coreState(session.world)).toBe("completed");

    const events = cycleEvents(session);
    expect(events.filter((e) => e.type === "operation_rejected")).toEqual([]);
    const discovered = events.filter((e) => e.type === "evidence_discovered");
    expect(discovered.map((e) => e.operation?.source.kind).sort()).toEqual(["model", "model", "model", "model", "user"]);
    const order = events.map((e) => e.type);
    expect(order.indexOf("synthesis_started")).toBeGreaterThan(order.lastIndexOf("evidence_discovered"));
    expect(order.indexOf("assumption_challenged")).toBeLessThan(order.indexOf("synthesis_started"));
    expect(order.indexOf("assumption_challenged")).toBeLessThan(order.indexOf("scenario_created"));
    expect(order.indexOf("scenario_created")).toBeLessThan(order.indexOf("synthesis_started"));
    expect(events.find((e) => e.type === "scenario_created")).toMatchObject({ summary: 'Lume weighed 2 paths; "Try one app" fits best for now.', operation: { source: { kind: "model", agentId: "lume" } } });
    const lumeToPaths = events.find((e) => e.type === "agent_assigned" && e.agentId === "lume" && e.target.kind === "module");
    expect(lumeToPaths).toMatchObject({ target: { moduleId: station.id }, task: "going to weigh the possible paths" });
    expect(events.find((e) => e.type === "agent_work_started" && e.agentId === "lume" && e.moduleId === station.id)).toMatchObject({ activity: "evaluating" });
    expect(events.find((e) => e.type === "recommendation_updated")?.summary).toBe("Tentative answer: Try one app for a month");

    const handoffs = events.flatMap((e) => (e.type === "artifact_handoff_started" ? [`${e.from}>${e.to}:${e.kind}`] : []));
    expect(handoffs.sort()).toEqual(["orion>sage:evidence", "sage>vex:insight", "vex>sage:evidence"]);
    const landed = events.filter((e) => e.type === "artifact_handoff_completed").length;
    expect(landed).toBe(3);
    const combineStart = events.findIndex((e) => e.type === "agent_work_started" && e.agentId === "sage" && e.task === "putting the findings together");
    const toSage = events.filter((e, i) => e.type === "artifact_handoff_completed" && e.to === "sage" && i < combineStart);
    expect(toSage).toHaveLength(2);
    expect(events.some((e) => e.type === "retry_requested")).toBe(false);
  });

  it("lets Vex send a finding back: a flag flies to the researcher, who walks back and re-checks it", async () => {
    const server = fakeServer(1, (step) =>
      step.kind === "critique" ? { ok: true, kind: "critique", usage, result: { target: "f1", headline: "Too rosy", note: "Delivery demand may be seasonal." } } : null,
    );
    const { session } = setup(server);
    const orion: string[] = [];
    await play(session, server, 150, (s) => s.run.live?.phase === "answered", () => {
      const state = ws(session).agents.orion!.state;
      if (orion.at(-1) !== state) orion.push(state);
    });
    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind)).toEqual(["research", "research", "research", "combine", "critique", "recheck", "paths", "synthesis"]);

    const events = cycleEvents(session);
    expect(events.find((e) => e.type === "retry_requested")).toMatchObject({ by: "vex", agentId: "orion" });
    expect(events.find((e) => e.type === "artifact_handoff_started" && e.kind === "flag")).toMatchObject({ from: "vex", to: "orion" });
    const back = events.find((e) => e.type === "agent_assigned" && e.agentId === "orion" && e.travel === "retrying");
    expect(back).toMatchObject({ target: { kind: "module" }, task: "going back to double-check" });
    // Orion hands his finding over, heads home, is sent back, re-checks, and is done.
    const sequence = orion.join(" ");
    expect(sequence).toMatch(/working .*completed .*handoff .*returning .*idle .*retrying .*completed/);

    const record = ws(session);
    const revised = record.evidence.find((item) => item.statement === "Finding 1, revised after a second look.");
    expect(revised).toMatchObject({ foundBy: "orion", status: "accepted", source: { kind: "model", verified: false } });
    expect(record.evidence.find((item) => item.statement.startsWith("Finding 1 "))).toMatchObject({ status: "superseded", supersededBy: revised!.id });
    expect(record.evidence.find((item) => item.statement === "Delivery demand may be seasonal.")).toMatchObject({ foundBy: "vex", status: "superseded" });
    expect(record.recommendation!.evidenceIds[0]).toBe(revised!.id);
    expect(record.modules[record.moduleOrder[0]!]!.summary).toEqual({ headline: "Revised", detail: "Second look" });
    expect(events.filter((e) => e.type === "operation_rejected")).toEqual([]);
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
    expect(ws(session).evidence.filter((item) => item.foundBy !== "user")).toHaveLength(4);
    expect(session.run.live?.phase).toBe("answered");
  });

  it("still sends Vex to review when his own research finishes last", async () => {
    const server = fakeServer((step) => (step.kind === "research" && step.task === 2 ? 9 : 1));
    const { session } = setup(server);
    await play(session, server, 120, (s) => s.run.live?.phase === "answered");
    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind).slice(-3)).toEqual(["critique", "paths", "synthesis"]);
  });

  it("still answers when weighing the paths fails, without making any up", async () => {
    const server = fakeServer(1, (step) => (step.kind === "paths" ? { ok: false, reason: "the AI's reply didn't pass MORPH's checks", usage } : null));
    const { session } = setup(server);
    await play(session, server, 150, (s) => s.run.live?.phase === "answered");
    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.filter((step) => step.kind === "paths")).toHaveLength(LIVE_LIMITS.retries + 1);
    expect(server.calls.at(-1)?.kind).toBe("synthesis");
    expect(ws(session).scenarios).toEqual([]);
    expect(ws(session).recommendation?.status).toBe("final");
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
    expect(server.calls).toHaveLength(SAMPLE_PLAN.tasks.length * (LIVE_LIMITS.retries + 1));
    expect(ws(session).evidence.filter((item) => item.foundBy !== "user")).toEqual([]);
    expect(cycleEvents(session).some((e) => e.type === "synthesis_started")).toBe(false);
  });

  it("holds Vex's review until you answer Nova, without the wait counting against the team", async () => {
    const server = fakeServer(1);
    const { session } = setup(server, null);
    await play(session, server, 300);
    expect(server.calls.map((step) => step.kind)).toEqual(["research", "research", "research", "combine"]);
    expect(session.run.live?.phase).toBe("working");
    expect(ws(session).agents.vex).toMatchObject({ state: "waiting", task: "waiting for your answer to Nova" });
    expect(ws(session).agents.nova!.task).toBe("waiting for your answer");
    expect(session.world.story.openInputs).toEqual([{ requestId: pendingQuestion(session)!.id, askedBy: "nova" }]);

    const open = pendingQuestion(session)!;
    expect(open.control).toEqual({ type: "number", min: 0, max: 500, unit: "orders" });
    expect(session.answerInput(open.id, 9000)).toBe(false);
    expect(session.answerInput(open.id, "forty")).toBe(false);
    expect(pendingQuestion(session)?.id).toBe(open.id);
    expect(session.answerInput(open.id, 25)).toBe(true);
    expect(session.answerInput(open.id, 30)).toBe(false);
    expect(session.world.story.openInputs).toEqual([]);
    expect(session.world.answerCards).toHaveLength(1);

    await play(session, server, 120, (s) => s.run.live?.phase === "answered");
    expect(session.run.live?.phase).toBe("answered");
    expect(server.calls.map((step) => step.kind).slice(-3)).toEqual(["critique", "paths", "synthesis"]);
    expect(server.answers.map((item) => item.reply)).toEqual([{ kind: "answer", value: 25 }]);
    const answered = cycleEvents(session).find((e) => e.type === "human_input_received");
    expect(answered).toMatchObject({ source: "user", answeredBy: "user", answer: "25 orders" });
    expect(ws(session).humanInputs[0]).toMatchObject({ status: "answered", answer: "25 orders", value: 25 });
    expect(cycleEvents(session).filter((e) => e.type === "operation_rejected")).toEqual([]);
  });

  it("goes on without your answer when you skip, and says so", async () => {
    const server = fakeServer(1);
    const { session } = setup(server, "skip");
    await play(session, server, 120, (s) => s.run.live?.phase === "answered");
    expect(session.run.live?.phase).toBe("answered");
    expect(server.answers.map((item) => item.reply)).toEqual([{ kind: "skip" }]);
    expect(ws(session).humanInputs[0]).toMatchObject({ status: "skipped", answer: null });
    expect(ws(session).evidence.some((item) => item.foundBy === "user")).toBe(false);
    const skipped = cycleEvents(session).find((e) => e.type === "human_input_skipped");
    expect(skipped).toMatchObject({ source: "user", skippedBy: "user", summary: "You skipped Nova's question; the team goes on without it." });
    expect(session.world.answerCards).toHaveLength(0);
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
