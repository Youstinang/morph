/**
 * A small task scheduler for one run: dependencies, bounded concurrency, a per-attempt timeout, bounded
 * retries and a cap on how many attempts the whole run may start. Work is asynchronous, but the scheduler
 * only changes state inside `step(now)`, on the run clock, so everything it reports happens in run order
 * and tests with fake work are deterministic. It never loops on its own.
 */

export type TaskOutcome<R> = { ok: true; value: R } | { ok: false; reason: string; final?: boolean };

export interface TaskSpec<R> {
  id: string;
  dependsOn?: readonly string[];
  /**
   * When the dependencies are good enough: "all" succeeded (the default), "any" succeeded, or all merely
   * "settled". Otherwise the task is skipped.
   */
  needs?: "all" | "any" | "settled";
  /** Extra condition to start, such as the agent having arrived. Checked every step. */
  ready?: () => boolean;
  run: (signal: AbortSignal, attempt: number) => Promise<TaskOutcome<R>>;
}

export interface SchedulerLimits {
  concurrency: number;
  timeoutSeconds: number;
  retries: number;
  retryDelaySeconds: number;
  /** Most attempts the run may start in total. */
  maxAttempts: number;
}

export type TaskStatus = "pending" | "running" | "retry_wait" | "succeeded" | "failed" | "skipped";

export type SchedulerEvent<R> =
  | { type: "started"; id: string; attempt: number }
  | { type: "succeeded"; id: string; attempt: number; value: R }
  | { type: "failed"; id: string; attempt: number; reason: string; willRetry: boolean }
  | { type: "skipped"; id: string; reason: string };

export interface Scheduler<R> {
  add(task: TaskSpec<R>): void;
  step(now: number): SchedulerEvent<R>[];
  status(id: string): TaskStatus | undefined;
  /** True once every task has succeeded, failed or been skipped. */
  readonly settled: boolean;
  readonly attemptsStarted: number;
  cancel(): void;
}

interface Entry<R> {
  spec: TaskSpec<R>;
  status: TaskStatus;
  attempt: number;
  startedAt: number;
  retryAt: number;
  controller: AbortController | null;
  outcome: TaskOutcome<R> | null;
}

const DONE = new Set<TaskStatus>(["succeeded", "failed", "skipped"]);

export function createScheduler<R>(limits: SchedulerLimits): Scheduler<R> {
  const entries = new Map<string, Entry<R>>();
  let attemptsStarted = 0;
  let cancelled = false;

  const running = () => [...entries.values()].filter((entry) => entry.status === "running").length;

  function launch(entry: Entry<R>, now: number, events: SchedulerEvent<R>[]) {
    entry.attempt += 1;
    attemptsStarted += 1;
    entry.status = "running";
    entry.startedAt = now;
    entry.outcome = null;
    const controller = new AbortController();
    entry.controller = controller;
    const attempt = entry.attempt;
    events.push({ type: "started", id: entry.spec.id, attempt });
    entry.spec.run(controller.signal, attempt).then(
      (outcome) => {
        if (entry.controller === controller) entry.outcome = outcome;
      },
      () => {
        if (entry.controller === controller) entry.outcome = { ok: false, reason: "the task stopped unexpectedly" };
      },
    );
  }

  function finish(entry: Entry<R>, outcome: TaskOutcome<R>, now: number, events: SchedulerEvent<R>[]) {
    entry.controller = null;
    if (outcome.ok) {
      entry.status = "succeeded";
      events.push({ type: "succeeded", id: entry.spec.id, attempt: entry.attempt, value: outcome.value });
      return;
    }
    const willRetry = !outcome.final && entry.attempt <= limits.retries && attemptsStarted < limits.maxAttempts;
    entry.status = willRetry ? "retry_wait" : "failed";
    entry.retryAt = now + limits.retryDelaySeconds;
    events.push({ type: "failed", id: entry.spec.id, attempt: entry.attempt, reason: outcome.reason, willRetry });
  }

  function dependencyVerdict(entry: Entry<R>): "wait" | "go" | string {
    const deps = (entry.spec.dependsOn ?? []).map((id) => entries.get(id));
    if (deps.some((dep) => !dep || !DONE.has(dep.status))) return "wait";
    const succeeded = deps.filter((dep) => dep!.status === "succeeded").length;
    const needs = entry.spec.needs ?? "all";
    if (needs === "all" && succeeded < deps.length) return "a task it needed didn't finish";
    if (needs === "any" && deps.length > 0 && succeeded === 0) return "none of the tasks it needed finished";
    return "go";
  }

  return {
    add(task) {
      if (entries.has(task.id)) throw new Error(`task ${task.id} was added twice`);
      entries.set(task.id, { spec: task, status: "pending", attempt: 0, startedAt: 0, retryAt: 0, controller: null, outcome: null });
    },
    step(now) {
      const events: SchedulerEvent<R>[] = [];
      if (cancelled) return events;
      for (const entry of entries.values()) {
        if (entry.status !== "running") continue;
        if (entry.outcome) finish(entry, entry.outcome, now, events);
        else if (now - entry.startedAt >= limits.timeoutSeconds) {
          entry.controller?.abort();
          finish(entry, { ok: false, reason: "it took too long" }, now, events);
        }
      }
      // Settling one task can unblock or skip others, so repeat until nothing changes this step.
      for (let changed = true; changed; ) {
        changed = false;
        for (const entry of entries.values()) {
          if (entry.status === "pending") {
            const verdict = dependencyVerdict(entry);
            if (verdict === "wait") continue;
            if (verdict !== "go") {
              entry.status = "skipped";
              events.push({ type: "skipped", id: entry.spec.id, reason: verdict });
              changed = true;
              continue;
            }
            if (attemptsStarted >= limits.maxAttempts) {
              entry.status = "skipped";
              events.push({ type: "skipped", id: entry.spec.id, reason: "the run reached its step limit" });
              changed = true;
              continue;
            }
            if (running() >= limits.concurrency || !(entry.spec.ready?.() ?? true)) continue;
            launch(entry, now, events);
            changed = true;
          } else if (entry.status === "retry_wait" && now >= entry.retryAt && running() < limits.concurrency) {
            launch(entry, now, events);
            changed = true;
          }
        }
      }
      return events;
    },
    status: (id) => entries.get(id)?.status,
    get settled() {
      return [...entries.values()].every((entry) => DONE.has(entry.status));
    },
    get attemptsStarted() {
      return attemptsStarted;
    },
    cancel() {
      cancelled = true;
      for (const entry of entries.values()) entry.controller?.abort();
    },
  };
}
