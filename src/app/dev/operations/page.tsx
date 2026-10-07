import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OperationsConsole from "./operations-console";

export const metadata: Metadata = { title: "MORPH · Operation checker" };
export const dynamic = "force-dynamic";

export default function OperationsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OperationsConsole />;
}
