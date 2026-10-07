import { createAnswerHandler } from "@/server/answer-handler";
import { liveServices } from "@/server/live-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const services = liveServices();

export const POST = createAnswerHandler({ limiter: services.stepLimiter, trustProxy: services.trustProxy, runs: services.runs });
