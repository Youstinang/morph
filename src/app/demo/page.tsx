import type { Metadata } from "next";
import { MorphClient } from "../morph-client";

export const metadata: Metadata = {
  title: "MORPH · Demo",
};

export default function DemoPage() {
  return <MorphClient variant="demo" />;
}
