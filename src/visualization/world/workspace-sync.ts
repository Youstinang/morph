import { SCENARIO_LABELS, UAE_STORY, createUaeWorkspace, type ScenarioKey } from "@/state/fixtures/uae-market";
import type { AgentState } from "@/state/domain";
import type { WorkspaceStore } from "@/state/store";
import { applyStoryFact } from "@/state/story";
import { AGENT_ORDER } from "./sim/roster";
import type { World } from "./sim/types";
import { scenarioWeights } from "./sim/world";

/** States in which an agent is carrying out a task, as opposed to travelling, waiting or resting. */
const TASK_STATES = new Set<AgentState>(["working", "evaluating", "collaborating", "retrying", "handoff", "failed"]);
const PROGRESS_STEP = 0.05;

/**
 * Copies the prototype demo's facts into the canonical workspace store. The world keeps the motion; the
 * store receives agent states and tasks, modules, evidence, assumptions, human input, scenarios and the
 * recommendation. Phase 13's demo runtime replaces this bridge with the event timeline.
 */
export function createWorkspaceSync(store: WorkspaceStore) {
  let cycle = -1;
  let applied = new Set<string>();

  return function sync(world: World) {
    if (world.cycle !== cycle) {
      cycle = world.cycle;
      applied = new Set();
      store.getState().reset(createUaeWorkspace());
    }
    const s = store.getState();
    s.setTime(world.time);
    syncModules(store, world);
    syncAgents(store, world);

    const pending = [...world.signals.entries()].filter(([signal]) => !applied.has(signal)).sort((a, b) => a[1] - b[1]);
    for (const [signal] of pending) {
      applied.add(signal);
      for (const fact of UAE_STORY[signal] ?? []) applyStoryFact(store, fact);
    }

    const weights = scenarioWeights(world);
    if (weights) {
      s.setScenarios(
        (Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map((key) => ({ id: key, label: SCENARIO_LABELS[key], assessment: weights[key] })),
      );
    }
  };
}

function syncModules(store: WorkspaceStore, world: World) {
  const s = store.getState();
  for (const id of s.workspace.moduleOrder) {
    if (!world.modules[id]) s.removeModule(id);
  }
  for (const id of world.moduleOrder) {
    const mod = world.modules[id]!;
    const known = store.getState().workspace.modules[id];
    if (!known || (known.status === "reserved" && mod.visible)) {
      s.openModule({
        id,
        title: mod.spec.title,
        kind: id,
        group: mod.spec.group,
        emphasis: mod.emphasis,
        collapsed: mod.collapsed,
        size: mod.size,
        reserved: !mod.visible,
      });
    }
    s.updateModule(id, {
      emphasis: mod.emphasis,
      collapsed: mod.collapsed,
      size: mod.size,
      ...(mod.removedAt !== null ? { status: "closing" as const } : {}),
    });
  }
}

function syncAgents(store: WorkspaceStore, world: World) {
  for (const id of AGENT_ORDER) {
    const s = store.getState();
    const agent = world.agents[id];
    const before = s.workspace.agents[id]!;
    const moduleId = agent.zone && s.workspace.modules[agent.zone] ? agent.zone : null;
    s.updateAgent(id, {
      state: agent.state,
      task: agent.task,
      moduleId,
      progress: Math.min(1, Math.round(agent.progress / PROGRESS_STEP) * PROGRESS_STEP),
    });
    const doing = TASK_STATES.has(agent.state);
    const wasDoing = TASK_STATES.has(before.state);
    if (agent.state === "failed" && before.state !== "failed") s.finishTask(id, "failed");
    if (doing && agent.state !== "failed" && (!wasDoing || before.task !== agent.task || before.state === "failed")) {
      s.startTask(id, agent.task, moduleId);
    } else if (!doing && wasDoing) {
      s.finishTask(id, "done");
    }
  }
}
