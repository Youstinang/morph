import { liveProvider, liveSearch, liveServices } from "@/server/live-services";
import { createPlanHandler } from "@/server/plan-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const services = liveServices();

export const POST = createPlanHandler({ provider: liveProvider, limiter: services.planLimiter, runs: services.runs, webSearch: () => liveSearch() !== null });
