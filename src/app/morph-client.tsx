"use client";

import { LabExperience, type ExperienceVariant } from "@/visualization/world/lab-experience";
import { requestAnswer, requestPlan, requestStep } from "@/orchestration/plan-client";
import { createLabSession } from "./lab/lab-session";

/** `waiting`: open on an empty deck with the question box ready instead of playing the demo. */
export function MorphClient({ variant, waiting = false }: { variant: ExperienceVariant; waiting?: boolean }) {
  const createSession = () => createLabSession({ requestPlan, requestStep, requestAnswer, start: waiting ? "waiting" : "demo" });
  return <LabExperience createSession={createSession} variant={variant} />;
}
