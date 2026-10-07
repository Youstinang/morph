import { liveProvider, liveSearch, liveServices } from "@/server/live-services";
import { createStepHandler } from "@/server/step-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const services = liveServices();

export const POST = createStepHandler({ provider: liveProvider, limiter: services.stepLimiter, trustProxy: services.trustProxy, runs: services.runs, search: liveSearch });
