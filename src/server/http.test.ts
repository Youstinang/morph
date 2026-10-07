import { describe, expect, it } from "vitest";
import { clientId, foreignRequest, readJson } from "./http";

const request = (headers: Record<string, string>) => new Request("http://morph.example/api/plan", { method: "POST", headers });

describe("client addresses", () => {
  it("ignores address headers unless a trusted proxy set them", () => {
    const forged = request({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" });
    expect(clientId(forged, false)).toBe("local");
    expect(clientId(forged, true)).toBe("5.6.7.8");
    expect(clientId(request({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }), true)).toBe("9.9.9.9");
    expect(clientId(request({}), true)).toBe("local");
  });
});

describe("same-origin JSON", () => {
  const json = { "content-type": "application/json" };

  it("accepts JSON from the page itself, or from tools that send no origin", () => {
    expect(foreignRequest(request(json))).toBeNull();
    expect(foreignRequest(request({ "content-type": "application/json; charset=utf-8" }))).toBeNull();
    expect(foreignRequest(request({ ...json, origin: "http://morph.example", host: "morph.example", "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  it("refuses other content types, other sites and unreadable origins", () => {
    expect(foreignRequest(request({}))?.status).toBe(415);
    expect(foreignRequest(request({ "content-type": "text/plain" }))?.status).toBe(415);
    expect(foreignRequest(request({ "content-type": "application/jsonp" }))?.status).toBe(415);
    expect(foreignRequest(request({ ...json, "sec-fetch-site": "same-site" }))?.status).toBe(403);
    expect(foreignRequest(request({ ...json, origin: "http://elsewhere.example", host: "morph.example" }))?.status).toBe(403);
    expect(foreignRequest(request({ ...json, origin: "null", host: "morph.example" }))?.status).toBe(403);
  });
});

describe("reading bodies", () => {
  const streamed = (chunks: number, size: number) => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= chunks) return controller.close();
        pulled += 1;
        controller.enqueue(new Uint8Array(size).fill(97));
      },
    });
    return { request: new Request("http://morph.example/api/plan", { method: "POST", body, duplex: "half" } as RequestInit), pulled: () => pulled };
  };

  it("reads small JSON, and refuses what isn't JSON", async () => {
    const post = (body: string) => new Request("http://morph.example/api/plan", { method: "POST", body });
    expect(await readJson(post('{"objective":"Should we expand?"}'), 1000)).toEqual({ ok: true, body: { objective: "Should we expand?" } });
    expect(await readJson(post("{nope"), 1000)).toEqual({ ok: false, error: "unreadable" });
    expect(await readJson(post(`"${"é".repeat(600)}"`), 1000)).toEqual({ ok: false, error: "too_large" });
  });

  it("stops reading an undeclared huge body at the limit", async () => {
    const huge = streamed(1000, 64 * 1024);
    expect(await readJson(huge.request, 4000)).toEqual({ ok: false, error: "too_large" });
    expect(huge.pulled()).toBeLessThan(5);
  });
});
