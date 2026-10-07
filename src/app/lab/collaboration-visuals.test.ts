import { describe, expect, it } from "vitest";
import type { AgentId } from "@/visualization/world/sim/types";
import { collaborations } from "@/visualization/world/sim/world";
import { createLabSession } from "./lab-session";

const DT = 1 / 60;

describe("handoff, collaboration and failure visuals follow real events", () => {
  it("records a catch for every landed card, a failed card until the work is done, and real collaboration groups", () => {
    const session = createLabSession();
    const groups = new Set<string>();
    const catches = new Set<string>();
    let failedCardSeen: { agentId: AgentId; zone: string | null } | null = null;
    let failedCardWhileRetrying = false;
    let failedCardCleared = false;
    for (let i = 0; i < 90 / DT && session.run.demo.endedAt === null; i += 1) {
      session.run.step(DT);
      const world = session.world;
      for (const c of world.catches) catches.add(`${c.from}>${c.agentId}:${c.kind}@${c.at.toFixed(2)}`);
      for (const group of collaborations(world)) {
        groups.add([...group.agents].sort().join("+"));
        for (const id of group.agents) expect(["collaborating", "working", "evaluating"]).toContain(world.agents[id].state);
        expect(group.agents.some((id) => world.agents[id].state === "collaborating")).toBe(true);
      }
      const card = world.failedCards[0];
      if (card) {
        failedCardSeen ??= { agentId: card.agentId, zone: card.zone };
        if (world.agents[card.agentId].state === "retrying") failedCardWhileRetrying = true;
        if (card.clearedAt !== null) failedCardCleared = true;
      }
    }

    const landed = session.bus.history().filter((e) => e.type === "artifact_handoff_completed" && e.cycle === session.world.cycle);
    expect(catches.size).toBe(landed.length);
    expect(landed.length).toBeGreaterThan(0);
    expect(failedCardSeen).toEqual({ agentId: "orion", zone: expect.any(String) });
    expect(failedCardWhileRetrying).toBe(true);
    expect(failedCardCleared).toBe(true);
    expect(groups).toContain("lume+nova");
    expect(groups).toContain("sage+vex");
  });

  it("forgets the visuals when the world is rebuilt for a new run", () => {
    const session = createLabSession();
    for (let i = 0; i < 25 / DT; i += 1) session.run.step(DT);
    session.restart();
    session.run.step(DT);
    expect(session.world.failedCards).toEqual([]);
    expect(session.world.catches).toEqual([]);
  });
});
