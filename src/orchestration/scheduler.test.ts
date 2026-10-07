import { describe, expect, it } from "vitest";
import { createScheduler, type SchedulerEvent, type SchedulerLimits, type TaskOutcome } from "./scheduler";

const LIMITS: SchedulerLimits = { concurrency: 2, timeoutSeconds: 30, retries: 1, retryDelaySeconds: 1, maxAttempts: 10 };

/** Work that settles only when the test says so. */
function manual() {
  const pending = new Map<string, { resolve: (o: TaskOutcome<string>) => void; signal: AbortSignal }>();
  const run = (id: string) => (signal: AbortSignal) =>
    new Promise<TaskOutcome<string>>((resolve) => pending.set(id, { resolve, signal }));
  const settle = async (id: string, outcome: TaskOutcome<string>) => {
    pending.get(id)!.resolve(outcome);
    pending.delete(id);
    await Promise.resolve();
  };
  return { run, settle, pending };
}

const types = (events: SchedulerEvent<string>[]) => events.map((e) => `${e.type}:${e.id}`);

describe("task scheduler", () => {
  it("runs at most `concurrency` tasks at once and starts the next when one finishes", async () => {
    const work = manual();
    const s = createScheduler<string>(LIMITS);
    for (const id of ["a", "b", "c"]) s.add({ id, run: work.run(id) });
    expect(types(s.step(0))).toEqual(["started:a", "started:b"]);
    expect(s.status("c")).toBe("pending");
    await work.settle("a", { ok: true, value: "A" });
    expect(s.step(1)).toEqual([
      { type: "succeeded", id: "a", attempt: 1, value: "A" },
      { type: "started", id: "c", attempt: 1 },
    ]);
  });

  it("waits for dependencies and for `ready`, and skips a task whose needs aren't met", async () => {
    const work = manual();
    let arrived = false;
    const s = createScheduler<string>(LIMITS);
    s.add({ id: "r1", run: work.run("r1") });
    s.add({ id: "r2", run: work.run("r2") });
    s.add({ id: "all", dependsOn: ["r1", "r2"], run: work.run("all") });
    s.add({ id: "any", dependsOn: ["r1", "r2"], needs: "any", ready: () => arrived, run: work.run("any") });
    s.add({ id: "after", dependsOn: ["any"], needs: "settled", run: work.run("after") });
    s.step(0);
    await work.settle("r1", { ok: false, reason: "nope", final: true });
    await work.settle("r2", { ok: true, value: "two" });
    expect(types(s.step(1))).toEqual(["failed:r1", "succeeded:r2", "skipped:all"]);
    expect(s.status("any")).toBe("pending");
    arrived = true;
    expect(types(s.step(2))).toEqual(["started:any"]);
    await work.settle("any", { ok: false, reason: "nope", final: true });
    expect(types(s.step(3))).toEqual(["failed:any", "started:after"]);
  });

  it("times out on the run clock, aborts the attempt, retries once, then gives up", async () => {
    const work = manual();
    const s = createScheduler<string>(LIMITS);
    s.add({ id: "slow", run: work.run("slow") });
    s.step(0);
    const first = work.pending.get("slow")!.signal;
    expect(s.step(29.9)).toEqual([]);
    expect(s.step(30)).toEqual([{ type: "failed", id: "slow", attempt: 1, reason: "it took too long", willRetry: true }]);
    expect(first.aborted).toBe(true);
    expect(s.step(30.5)).toEqual([]);
    expect(s.step(31)).toEqual([{ type: "started", id: "slow", attempt: 2 }]);
    await work.settle("slow", { ok: false, reason: "busy" });
    expect(s.step(32)).toEqual([{ type: "failed", id: "slow", attempt: 2, reason: "busy", willRetry: false }]);
    expect(s.settled).toBe(true);
  });

  it("ignores a late reply from an attempt that already timed out", async () => {
    const work = manual();
    const s = createScheduler<string>({ ...LIMITS, retries: 0 });
    s.add({ id: "late", run: work.run("late") });
    s.step(0);
    s.step(30);
    await work.settle("late", { ok: true, value: "too late" });
    expect(s.step(31)).toEqual([]);
    expect(s.status("late")).toBe("failed");
  });

  it("doesn't retry a final failure, and skips work once the attempt cap is reached", async () => {
    const work = manual();
    const s = createScheduler<string>({ ...LIMITS, concurrency: 1, maxAttempts: 2 });
    for (const id of ["a", "b", "c"]) s.add({ id, run: work.run(id) });
    s.step(0);
    await work.settle("a", { ok: false, reason: "limit reached", final: true });
    expect(s.step(1)).toEqual([
      { type: "failed", id: "a", attempt: 1, reason: "limit reached", willRetry: false },
      { type: "started", id: "b", attempt: 1 },
      { type: "skipped", id: "c", reason: "the run reached its step limit" },
    ]);
    await work.settle("b", { ok: true, value: "B" });
    expect(types(s.step(2))).toEqual(["succeeded:b"]);
    expect(s.attemptsStarted).toBe(2);
    expect(s.settled).toBe(true);
  });

  it("treats a thrown task as a failure, and cancel aborts running work and stops everything", async () => {
    const work = manual();
    const s = createScheduler<string>({ ...LIMITS, retries: 0 });
    s.add({ id: "boom", run: () => Promise.reject(new Error("x")) });
    s.add({ id: "slow", run: work.run("slow") });
    s.step(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.step(1)).toEqual([{ type: "failed", id: "boom", attempt: 1, reason: "the task stopped unexpectedly", willRetry: false }]);
    s.cancel();
    expect(work.pending.get("slow")!.signal.aborted).toBe(true);
    expect(s.step(100)).toEqual([]);
    expect(() => s.add({ id: "boom", run: work.run("again") })).toThrow();
  });
});
