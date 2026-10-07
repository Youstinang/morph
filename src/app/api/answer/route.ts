import { createAnswerHandler } from "@/server/answer-handler";
import { liveServices } from "@/server/live-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const services = liveServices();

export const POST = createAnswerHandler({ limiter: services.stepLimiter, runs: services.runs });
