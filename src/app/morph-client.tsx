"use client";

import { LabExperience, type ExperienceVariant } from "@/visualization/world/lab-experience";
import { createLabSession } from "./lab/lab-session";

export function MorphClient({ variant }: { variant: ExperienceVariant }) {
  return <LabExperience createSession={createLabSession} variant={variant} />;
}
