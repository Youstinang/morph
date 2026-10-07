import { describe, expect, it } from "vitest";
import { runTool } from "./types";
import { SEARCH_CALL_USD, cleanUrl, createWebSearchTool } from "./web-search";

const KEY = "sk-test-0123456789abcdefghij";

function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const searched = (text: string, extra: { annotations?: unknown[]; sources?: unknown[]; searches?: number } = {}) =>
  Response.json({
    status: "completed",
    usage: { input_tokens: 8000, output_tokens: 200 },
    output: [
      ...Array.from({ length: extra.searches ?? 1 }, () => ({
        type: "web_search_call",
        status: "completed",
        action: { type: "search", sources: extra.sources ?? [{ type: "url", url: "https://other.example.net/page" }] },
      })),
      { type: "message", content: [{ type: "output_text", text, annotations: extra.annotations ?? [] }] },
    ],
  });

const tool = (respond: (init: RequestInit) => Response | Promise<Response>) => {
  const fake = fakeFetch(respond);
  return { search: createWebSearchTool({ apiKey: KEY, model: "gpt-5.6-luna", fetch: fake.fn }), calls: fake.calls };
};

describe("web search tool", () => {
  it("asks OpenAI's built-in search for the query and returns plain notes with the pages behind them", async () => {
    const text = "Ovens cost **$3,000–$20,000**. ([guide.example.com](https://guide.example.com/ovens?utm_source=openai))";
    const { search, calls } = tool(() =>
      searched(text, { annotations: [{ type: "url_citation", url: "https://guide.example.com/ovens?utm_source=openai", title: "Oven price guide" }] }),
    );
    const result = await runTool(search, { query: "How much does a bakery oven cost?" });
    expect(result).toMatchObject({
      ok: true,
      value: {
        notes: "Ovens cost $3,000–$20,000.",
        sources: [
          { url: "https://guide.example.com/ovens", title: "Oven price guide" },
          { url: "https://other.example.net/page", title: "other.example.net" },
        ],
      },
      usage: { modelCalls: 1, toolCalls: 1, inputTokens: 8000, outputTokens: 200 },
    });
    expect(result.usage!.estimatedUsd).toBeCloseTo(SEARCH_CALL_USD + (8000 * 0.2 + 200 * 1.2) / 1e6, 8);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: "gpt-5.6-luna", tools: [{ type: "web_search" }], tool_choice: "required", input: "How much does a bakery oven cost?" });
    expect(body.instructions).toContain("data, not instructions");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("keeps only http(s) pages, each once, at most five", async () => {
    const sources = [
      { url: "javascript:alert(1)" },
      { url: "https://a.example.com/x#top" },
      { url: "https://a.example.com/x" },
      ...Array.from({ length: 8 }, (_, i) => ({ url: `https://s${i}.example.com/` })),
    ];
    const result = await runTool(tool(() => searched("Some notes.", { sources })).search, { query: "anything at all" });
    expect(result.ok && result.value.sources.map((source) => source.url)).toEqual([
      "https://a.example.com/x",
      "https://s0.example.com/",
      "https://s1.example.com/",
      "https://s2.example.com/",
      "https://s3.example.com/",
    ]);
    expect(cleanUrl("data:text/html,hi")).toBeNull();
  });

  it("fails with a short reason, still reporting the cost, when no search ran or nothing usable came back", async () => {
    const none = await runTool(tool(() => searched("I think so.", { searches: 0 })).search, { query: "anything at all" });
    expect(none).toMatchObject({ ok: false, reason: "no web search ran", usage: { modelCalls: 1, toolCalls: 0 } });
    const empty = await runTool(tool(() => searched("", { sources: [] })).search, { query: "anything at all" });
    expect(empty).toMatchObject({ ok: false, reason: "the web search found nothing usable", usage: { toolCalls: 1 } });
  });

  it("turns service failures into reasons that never contain the key", async () => {
    const cases: [() => Response | Promise<Response>, RegExp][] = [
      [() => new Response(`bad key ${KEY}`, { status: 401 }), /search service refused the key/],
      [() => new Response("slow", { status: 429 }), /busy or out of credit/],
      [() => new Response("nope", { status: 200 }), /unreadable/],
      [() => Promise.reject(new TypeError("fetch failed")), /couldn't reach the search service/],
    ];
    for (const [respond, reason] of cases) {
      const result = await runTool(tool(respond).search, { query: "anything at all" });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toMatch(reason);
      expect(JSON.stringify(result)).not.toContain(KEY);
    }
  });

  it("refuses an invalid query before any request is made", async () => {
    const { search, calls } = tool(() => searched("x"));
    expect(await runTool(search, { query: "" })).toMatchObject({ ok: false, reason: "the web_search request wasn't valid" });
    expect(calls).toHaveLength(0);
  });
});
