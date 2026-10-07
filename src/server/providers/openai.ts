import { estimateUsd } from "./pricing";
import type { AiProvider, ModelUsage, ProviderResult, StructuredRequest, TextRequest } from "./types";

export interface OpenAiOptions {
  apiKey: string;
  model: string;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  reasoningEffort?: "none" | "low" | "medium";
}

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface ChatReply {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function statusReason(status: number): string {
  if (status === 401 || status === 403) return "the AI service refused the key";
  if (status === 429) return "the AI service is busy or out of credit";
  if (status >= 500) return "the AI service is having problems";
  return `the AI service rejected the request (${status})`;
}

/** OpenAI Chat Completions adapter. Structured replies use strict JSON-schema output. */
export function createOpenAiProvider(options: OpenAiOptions): AiProvider {
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function call(request: TextRequest, format: Record<string, unknown> | null): Promise<ProviderResult<string>> {
    const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await send(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model,
          reasoning_effort: options.reasoningEffort ?? "low",
          max_completion_tokens: request.maxOutputTokens,
          ...(format ? { response_format: format } : {}),
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        }),
        signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      if (aborted && request.signal?.aborted) return { ok: false, reason: "the request was cancelled", usage: null };
      return { ok: false, reason: aborted ? "the AI took too long to answer" : "couldn't reach the AI service", usage: null };
    }
    if (!response.ok) return { ok: false, reason: statusReason(response.status), usage: null };

    let reply: ChatReply;
    try {
      reply = (await response.json()) as ChatReply;
    } catch {
      return { ok: false, reason: "the AI service sent an unreadable reply", usage: null };
    }
    const inputTokens = reply.usage?.prompt_tokens ?? 0;
    const outputTokens = reply.usage?.completion_tokens ?? 0;
    const usage: ModelUsage = { inputTokens, outputTokens, estimatedUsd: estimateUsd(options.model, inputTokens, outputTokens) };
    const choice = reply.choices?.[0];
    if (choice?.message?.refusal) return { ok: false, reason: "the AI declined to answer", usage };
    if (choice?.finish_reason === "length") return { ok: false, reason: "the AI's answer was cut off", usage };
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) return { ok: false, reason: "the AI sent an empty answer", usage };
    return { ok: true, value: content, usage };
  }

  return {
    name: "openai",
    generateText: (request) => call(request, null),
    async generateStructured(request: StructuredRequest) {
      const result = await call(request, {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
      });
      if (!result.ok) return result;
      try {
        return { ok: true, value: JSON.parse(result.value) as unknown, usage: result.usage };
      } catch {
        return { ok: false, reason: "the AI's answer wasn't valid JSON", usage: result.usage };
      }
    },
  };
}
