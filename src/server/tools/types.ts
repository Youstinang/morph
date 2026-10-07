import type { z } from "zod";
import type { ModelUsage } from "../providers/types";

/**
 * A research tool the team can use. Each tool declares what it takes and returns; `runTool` checks both,
 * so a tool's raw reply never reaches a prompt or the record unchecked. Like providers, tools never throw:
 * failures come back as short, safe reasons.
 */
export interface Tool<I, O> {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  execute(input: I, signal?: AbortSignal): Promise<ToolResult<O>>;
}

/** What a tool cost: the model calls behind it, the paid tool calls (such as searches) and their price. */
export interface ToolUsage extends ModelUsage {
  modelCalls: number;
  toolCalls: number;
}

export type ToolResult<O> = { ok: true; value: O; usage: ToolUsage } | { ok: false; reason: string; usage: ToolUsage | null };

export async function runTool<I, O>(tool: Tool<I, O>, input: unknown, signal?: AbortSignal): Promise<ToolResult<O>> {
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) return { ok: false, reason: `the ${tool.name} request wasn't valid`, usage: null };
  const result = await tool.execute(parsed.data, signal);
  if (!result.ok) return result;
  const checked = tool.output.safeParse(result.value);
  return checked.success ? { ok: true, value: checked.data, usage: result.usage } : { ok: false, reason: `the ${tool.name} result didn't pass MORPH's checks`, usage: result.usage };
}
