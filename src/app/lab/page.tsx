import type { Metadata } from "next";
import { LabClient } from "./lab-client";

export const metadata: Metadata = {
  title: "MORPH · Lab",
};

export default function LabPage() {
  return <LabClient />;
}
