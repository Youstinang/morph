import { describe, expect, it } from "vitest";
import { lowerQuality, nextQuality, QUALITY_ORDER } from "./quality";

describe("picture quality", () => {
  it("steps down one preset at a time and stops at Performance", () => {
    expect(lowerQuality("high")).toBe("balanced");
    expect(lowerQuality("balanced")).toBe("performance");
    expect(lowerQuality("performance")).toBe("performance");
  });

  it("cycles through every preset when the user clicks", () => {
    const seen = [QUALITY_ORDER[0]!];
    for (let i = 0; i < QUALITY_ORDER.length; i++) seen.push(nextQuality(seen.at(-1)!));
    expect(seen).toEqual(["high", "balanced", "performance", "high"]);
  });
});
