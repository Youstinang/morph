import type { Metadata } from "next";
import { MorphClient } from "../morph-client";

export const metadata: Metadata = {
  title: "MORPH · Lab",
};

export default function LabPage() {
  return <MorphClient variant="full" />;
}
