import { requestPlan, requestStep } from "@/orchestration/plan-client";
import { createRunController, type RunController, type RunControllerOptions } from "@/orchestration/run-controller";
import { attachWorld, type LabSession } from "@/visualization/world/sim/session";

export interface LabRun extends LabSession {
  readonly run: RunController;
}

/** Wires the lab: the run controller (orchestration) with the 3D world attached (visualization). */
export function createLabSession(options: RunControllerOptions = { requestPlan, requestStep }): LabRun {
  const run = createRunController(options);
  const view = attachWorld(run);
  return {
    run,
    bus: run.bus,
    store: run.store,
    get world() {
      return view.world;
    },
    get mode() {
      return run.mode;
    },
    advance(realSeconds, speed) {
      run.advance(realSeconds, speed);
      return view.world;
    },
    restart: run.restart,
    startLive: run.startLive,
    answerBudget: run.answerBudget,
  };
}
