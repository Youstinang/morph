import type { Change, Why, Workspace } from "./domain";
import type { MorphOperation } from "./operations";

/** How many explained changes the record keeps; older ones drop off first. */
export const MAX_CHANGES = 60;

const GROUP_WORDS = { research: "research", analysis: "analysis", decision: "the decision area" } as const;

/** The operation's "Why did MORPH change?" reason, if it gave one (a path update's own `why` is the path's text). */
export function changeReason(operation: MorphOperation): Why | null {
  return typeof operation.why === "object" && operation.why !== null ? operation.why : null;
}

/** Why a reason can't be recorded: it must point only at evidence and assumptions the record has. */
export function invalidReason(why: Why, workspace: Workspace): string | null {
  const missing = (why.evidenceIds ?? []).find((id) => !workspace.evidence.some((item) => item.id === id));
  if (missing) return `the reason cites evidence ${missing}, which does not exist`;
  if (why.assumptionId && !workspace.assumptions.some((item) => item.id === why.assumptionId)) {
    return `the reason cites assumption ${why.assumptionId}, which does not exist`;
  }
  return null;
}

/** What the operation changed, in plain words, from the record before and after it. Null for minor changes. */
export function describeChange(operation: MorphOperation, before: Workspace, after: Workspace): string | null {
  const title = (id: string) => after.modules[id]?.title ?? before.modules[id]?.title ?? "a station";
  switch (operation.operation) {
    case "add_module":
      if (operation.replaces) return `Replaced "${title(operation.replaces)}" with "${operation.module.title}"`;
      return operation.reserve ? `Planned the "${operation.module.title}" station for later` : `Opened the "${operation.module.title}" station`;
    case "move_module":
      return `Moved "${title(operation.moduleId)}" to ${GROUP_WORDS[operation.group]}`;
    case "resize_module":
      return `Resized "${title(operation.moduleId)}"`;
    case "emphasize_module":
      return `Gave "${title(operation.moduleId)}" more weight`;
    case "deemphasize_module":
      return `Gave "${title(operation.moduleId)}" less weight`;
    case "remove_module":
      return `Closed "${title(operation.moduleId)}"`;
    case "remove_evidence": {
      const old = before.evidence.find((item) => item.id === operation.evidenceId);
      const kind = old?.kind === "risk" ? "doubt" : "finding";
      return operation.supersededBy ? `Replaced a ${kind} with a newer one` : `Set a ${kind} aside`;
    }
    case "update_recommendation": {
      const next = operation.recommendation;
      if (next.status === "final") return `Gave the answer: "${next.statement ?? next.leaning}"`;
      return before.recommendation ? `Changed the leaning to "${next.leaning}"` : `Started leaning toward "${next.leaning}"`;
    }
    case "add_scenario":
      return `Added the path "${operation.scenario.label}"`;
    case "update_scenario": {
      const label = after.scenarios.find((item) => item.id === operation.scenarioId)?.label ?? "a path";
      return `Re-weighed the path "${label}"`;
    }
    case "update_assumption":
      return operation.status === "confirmed" ? "Confirmed an assumption" : "Rejected an assumption";
    default:
      return null;
  }
}

const STATION_CHANGE = /^(Opened the|Planned the|Closed) "(.+)"( station)?( for later)?$/;
const quoted = (titles: string[]) => (titles.length === 1 ? titles[0]! : `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`);

/**
 * Stations opened, planned or closed one after another for the same reason, by the same author, read as one
 * change. It matches the phrasing `describeChange` writes above.
 */
export function mergeStationChanges(changes: readonly Change[], author: (change: Change) => string): Change[] {
  const merged: { change: Change; titles: string[]; verb: string; noun: string; later: string }[] = [];
  for (const change of changes) {
    const match = STATION_CHANGE.exec(change.change);
    const last = merged.at(-1);
    const same = match && last && last.verb === match[1] && last.later === (match[4] ?? "");
    if (same && last.change.why.reason === change.why.reason && author(last.change) === author(change)) {
      last.titles.push(`"${match[2]}"`);
      continue;
    }
    merged.push({ change, titles: match ? [`"${match[2]}"`] : [], verb: match?.[1] ?? "", noun: match?.[3] ? " stations" : "", later: match?.[4] ?? "" });
  }
  return merged.map(({ change, titles, verb, noun, later }) =>
    titles.length > 1 ? { ...change, change: `${verb} ${quoted(titles)}${noun}${later}` } : change,
  );
}

/** The record with this operation's explained change appended, if it gave a reason and changed something that matters. */
export function recordChange(operation: MorphOperation, before: Workspace, after: Workspace): Workspace {
  const why = changeReason(operation);
  const change = why && describeChange(operation, before, after);
  if (!why || !change) return after;
  const entry: Change = { operationId: operation.id, operation: operation.operation, change: change.slice(0, 200), why, by: operation.source, at: after.time };
  return { ...after, changes: [...after.changes, entry].slice(-MAX_CHANGES) };
}
