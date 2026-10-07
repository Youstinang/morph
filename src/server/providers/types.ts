/**
 * The AI provider boundary. Callers describe what they need (instructions, a JSON schema, a token budget);
 * adapters hide the vendor, the model and the key. Failures come back as short, safe reasons — never
 * thrown, never containing secrets or the provider's raw response.
 */

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface TextRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface StructuredRequest extends TextRequest {
  schemaName: string;
  /** JSON Schema the reply must follow; the caller still validates the reply itself. */
  jsonSchema: Record<string, unknown>;
}

export type ProviderResult<T> = { ok: true; value: T; usage: ModelUsage } | { ok: false; reason: string; usage: ModelUsage | null };

export interface AiProvider {
  /** A short label for logs and tests, e.g. "openai". */
  readonly name: string;
  generateStructured(request: StructuredRequest): Promise<ProviderResult<unknown>>;
  generateText(request: TextRequest): Promise<ProviderResult<string>>;
}

export const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };

export function addUsage(a: ModelUsage, b: ModelUsage | null): ModelUsage {
  if (!b) return a;
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, estimatedUsd: a.estimatedUsd + b.estimatedUsd };
}
