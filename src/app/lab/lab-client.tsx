"use client";

import { LabExperience } from "@/visualization/world/lab-experience";
import { createLabSession } from "./lab-session";

export function LabClient() {
  return <LabExperience createSession={createLabSession} />;
}
