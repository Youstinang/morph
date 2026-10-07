import { describe, expect, it } from "vitest";
import { createOpenAiProvider } from "./openai";

const KEY = "sk-test-0123456789abcdefghij";
const request = { system: "sys", prompt: "question", schemaName: "plan", jsonSchema: { type: "object" }, maxOutputTokens: 500 };

function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const chat = (content: string | null, extra: Record<string, unknown> = {}) =>
  Response.json({ choices: [{ finish_reason: "stop", message: { content }, ...extra }], usage: { prompt_tokens: 1000, completion_tokens: 2000 } });

describe("OpenAI provider", () => {
  it("asks for strict JSON-schema output with the token budget, and returns the parsed reply and its cost", async () => {
    const { fn, calls } = fakeFetch(() => chat('{"a":1}'));
    const provider = createOpenAiProvider({ apiKey: KEY, model: "gpt-5.6-luna", fetch: fn });
    const result = await provider.generateStructured(request);
    expect(result).toEqual({ ok: true, value: { a: 1 }, usage: { inputTokens: 1000, outputTokens: 2000, estimatedUsd: 0.0026 } });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      max_completion_tokens: 500,
      response_format: { type: "json_schema", json_schema: { name: "plan", strict: true, schema: { type: "object" } } },
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "question" }],
    });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("turns every failure into a short reason that never contains the key or the raw response", async () => {
    const cases: [() => Response | Promise<Response>, RegExp][] = [
      [() => new Response(`bad key ${KEY}`, { status: 401 }), /refused the key/],
      [() => new Response("slow down", { status: 429 }), /busy or out of credit/],
      [() => new Response("oops", { status: 503 }), /having problems/],
      [() => new Response("not json", { status: 200 }), /unreadable/],
      [() => chat("{broken"), /valid JSON/],
      [() => chat(null, { message: { refusal: "no" } }), /declined/],
      [() => chat("{}", { finish_reason: "length" }), /cut off/],
      [() => chat(""), /empty/],
      [() => Promise.reject(new TypeError("fetch failed")), /couldn't reach/],
    ];
    for (const [respond, reason] of cases) {
      const provider = createOpenAiProvider({ apiKey: KEY, model: "gpt-5.6-luna", fetch: fakeFetch(respond).fn });
      const result = await provider.generateStructured(request);
      expect(result.ok).toBe(false);
      const text = JSON.stringify(result);
      expect(text).toMatch(reason);
      expect(text).not.toContain(KEY);
    }
  });

  it("gives up after its timeout, and reports a cancellation as such", async () => {
    const hang = fakeFetch(
      (init) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason as Error))),
    ).fn;
    const slow = createOpenAiProvider({ apiKey: KEY, model: "gpt-5.6-luna", fetch: hang, timeoutMs: 20 });
    expect(await slow.generateText(request)).toMatchObject({ ok: false, reason: "the AI took too long to answer" });
    const controller = new AbortController();
    const pending = createOpenAiProvider({ apiKey: KEY, model: "gpt-5.6-luna", fetch: hang }).generateText({ ...request, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, reason: "the request was cancelled" });
  });
});
