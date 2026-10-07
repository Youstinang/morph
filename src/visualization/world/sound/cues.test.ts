import { describe, expect, it } from "vitest";
import type { WorkspaceEvent } from "@/events/schema";
import { ANY_CUE_GAP_MS, createCuePlanner, SAME_CUE_GAP_MS } from "./cues";

const event = (type: string) => ({ type }) as WorkspaceEvent;

describe("sound cues", () => {
  it("only key moments make a sound", () => {
    const planner = createCuePlanner();
    expect(planner.plan(event("agent_move_started"), 0)).toBeNull();
    expect(planner.plan(event("model_call_completed"), 1000)).toBeNull();
    expect(planner.plan(event("objective_received"), 2000)).toBe("core");
    expect(planner.plan(event("assumption_challenged"), 3000)).toBe("challenge");
    expect(planner.plan(event("recommendation_updated"), 4000)).toBe("converge");
  });

  it("a burst of the same moment sounds once, and cues never stack", () => {
    const planner = createCuePlanner();
    expect(planner.plan(event("module_created"), 0)).toBe("materialize");
    expect(planner.plan(event("module_created"), SAME_CUE_GAP_MS - 1)).toBeNull();
    expect(planner.plan(event("module_created"), SAME_CUE_GAP_MS)).toBe("materialize");
    expect(planner.plan(event("task_assigned"), SAME_CUE_GAP_MS + ANY_CUE_GAP_MS - 1)).toBeNull();
    expect(planner.plan(event("task_assigned"), SAME_CUE_GAP_MS + ANY_CUE_GAP_MS)).toBe("dispatch");
  });
});
