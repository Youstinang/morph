import { describe, expect, it } from "vitest";
import { SAMPLE_PLAN } from "@/state/fixtures/sample-plan";
import { createPlanHandler } from "./plan-handler";
import type { AiProvider, ProviderResult } from "./providers/types";
import { createRateLimiter } from "./rate-limit";

const usage = { inputTokens: 100, outputTokens: 200, estimatedUsd: 0.001 };

function setup(reply: ProviderResult<unknown> = { ok: true, value: SAMPLE_PLAN, usage }, configured = true) {
  let modelCalls = 0;
  const provider: AiProvider = {
    name: "fake",
    async generateStructured() {
      modelCalls += 1;
      return reply;
    },
    async generateText() {
      return { ok: false, reason: "unused", usage: null };
    },
  };
  const handle = createPlanHandler({
    provider: () => (configured ? provider : null),
    limiter: createRateLimiter({ perClient: { limit: 2, windowMs: 60_000 }, global: { limit: 100, windowMs: 60_000 } }),
    trustProxy: true,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    handle(
      new Request("http://x/api/plan", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json", ...headers },
      }),
    );
  return { post, calls: () => modelCalls };
}

describe("/api/plan handler", () => {
  it("returns a validated plan and its usage", async () => {
    const { post } = setup();
    const response = await post({ objective: "Should our bakery deliver through apps?" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, plan: SAMPLE_PLAN, usage: { calls: 1, ...usage } });
  });

  it("refuses bad requests before any model call", async () => {
    const { post, calls } = setup();
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ objective: "short" })).status).toBe(400);
    expect((await post({ objective: "x".repeat(301) })).status).toBe(400);
    expect((await post({ objective: "Should we deliver?", extra: "<script>" })).status).toBe(400);
    expect((await post({ objective: "y".repeat(5000) })).status).toBe(413);
    expect(calls()).toBe(0);
  });

  it("rate-limits each client without calling the model", async () => {
    const { post, calls } = setup();
    const ask = () => post({ objective: "Should our bakery deliver through apps?" }, { "x-forwarded-for": "1.2.3.4" });
    await ask();
    await ask();
    const limited = await ask();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(calls()).toBe(2);
    expect((await post({ objective: "Should our bakery deliver through apps?" }, { "x-forwarded-for": "5.6.7.8" })).status).toBe(200);
  });

  it("refuses requests that aren't JSON from MORPH's own page before any model call", async () => {
    const { post, calls } = setup();
    const objective = { objective: "Should our bakery deliver through apps?" };
    expect((await post(objective, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post(objective, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post(objective, { origin: "https://evil.example", host: "morph.example" })).status).toBe(403);
    expect((await post(objective, { origin: "https://morph.example", host: "morph.example", "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect(calls()).toBe(1);
  });

  it("says when live AI isn't set up, and passes planner failures on as short reasons", async () => {
    expect((await setup(undefined, false).post({ objective: "Should our bakery deliver?" })).status).toBe(503);
    const failing = setup({ ok: false, reason: "the AI service is busy or out of credit", usage: null });
    const response = await failing.post({ objective: "Should our bakery deliver?" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, reason: "the AI service is busy or out of credit" });
  });
});

describe("rate limiter", () => {
  it("frees a slot once the window passes, and caps the whole server", () => {
    let t = 0;
    const limiter = createRateLimiter({ perClient: { limit: 1, windowMs: 1000 }, global: { limit: 2, windowMs: 10_000 }, now: () => t });
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 1 });
    t = 1000;
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b")).toEqual({ ok: false, retryAfterSeconds: 9 });
  });
});
