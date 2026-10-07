import { describe, expect, it } from "vitest";
import { clientId, foreignRequest } from "./http";

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
