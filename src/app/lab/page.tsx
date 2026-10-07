import type { Metadata } from "next";
import { LabExperience } from "@/visualization/world/lab-experience";

export const metadata: Metadata = {
  title: "MORPH · Lab",
};

export default function LabPage() {
  return <LabExperience />;
}
