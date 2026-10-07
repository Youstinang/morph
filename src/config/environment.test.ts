import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment";

describe("environment validation", () => {
  it("runs without provider credentials or optional configuration", () => {
    expect(parseEnvironment({})).toEqual({ NODE_ENV: "development", MORPH_PLANNER_MODEL: "gpt-5.6-luna" });
  });

  it.each(["development", "test", "production"])("accepts %s", (mode) => {
    expect(parseEnvironment({ NODE_ENV: mode }).NODE_ENV).toBe(mode);
  });

  it("does not forward unrelated or secret-bearing process variables", () => {
    expect(parseEnvironment({ NODE_ENV: "production", PRIVATE_TOKEN: "secret" }))
      .toEqual({ NODE_ENV: "production", MORPH_PLANNER_MODEL: "gpt-5.6-luna" });
  });

  it("treats an empty AI key as missing and rejects a malformed one without disclosing it", () => {
    expect(parseEnvironment({ OPENAI_API_KEY: "" }).OPENAI_API_KEY).toBeUndefined();
    expect(() => parseEnvironment({ OPENAI_API_KEY: "short-key" })).toThrow("Invalid environment configuration: OPENAI_API_KEY");
    try {
      parseEnvironment({ OPENAI_API_KEY: "short-key" });
    } catch (error) {
      expect(String(error)).not.toContain("short-key");
    }
  });

  it("rejects invalid configuration without disclosing its value", () => {
    const sensitiveValue = "invalid-secret-value";
    expect(() => parseEnvironment({ NODE_ENV: sensitiveValue }))
      .toThrow("Invalid environment configuration: NODE_ENV");
    try {
      parseEnvironment({ NODE_ENV: sensitiveValue });
    } catch (error) {
      expect(String(error)).not.toContain(sensitiveValue);
    }
  });
});
