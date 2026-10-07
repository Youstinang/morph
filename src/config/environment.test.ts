import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment";

describe("environment validation", () => {
  it("runs without provider credentials or optional configuration", () => {
    expect(parseEnvironment({})).toEqual({ NODE_ENV: "development" });
  });

  it.each(["development", "test", "production"])("accepts %s", (mode) => {
    expect(parseEnvironment({ NODE_ENV: mode }).NODE_ENV).toBe(mode);
  });

  it("does not forward unrelated or secret-bearing process variables", () => {
    expect(parseEnvironment({ NODE_ENV: "production", PRIVATE_TOKEN: "secret" }))
      .toEqual({ NODE_ENV: "production" });
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
