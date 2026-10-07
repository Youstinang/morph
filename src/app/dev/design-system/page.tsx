import { notFound } from "next/navigation";
import { DesignPreview } from "@/visualization/design-preview";
export const dynamic = "force-dynamic";
export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignPreview />;
}
