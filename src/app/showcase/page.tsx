import type { Metadata } from "next";
import { MorphClient } from "../morph-client";

export const metadata: Metadata = {
  title: "MORPH · Showcase",
};

export default function ShowcasePage() {
  return <MorphClient variant="showcase" />;
}
