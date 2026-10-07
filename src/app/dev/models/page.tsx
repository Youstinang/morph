import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModelLineup from "./model-lineup";

export const metadata: Metadata = { title: "MORPH · Model lineup" };
export const dynamic = "force-dynamic";

export default function ModelsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ModelLineup />;
}
