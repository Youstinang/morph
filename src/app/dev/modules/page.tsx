import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModuleSandbox from "./module-sandbox";

export const metadata: Metadata = { title: "MORPH · Module sandbox" };
export const dynamic = "force-dynamic";

export default function ModulesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ModuleSandbox />;
}
