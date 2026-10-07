/**
 * Approximate list prices in US dollars per million tokens (OpenAI pricing pages, checked 2026-10-07).
 * Used only for the cost estimate shown in development; the provider's bill is the real number.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
};

/** Unknown models are priced like a mid-size model, so the estimate errs high rather than low. */
const UNKNOWN = { input: 2, output: 10 };

export function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? UNKNOWN;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
