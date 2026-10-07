import type { AgentState, CoreState } from "./sim/types";

/** Plain words shown to people for each agent state. */
export const STATE_WORDS: Record<AgentState, string> = {
  idle: "Ready",
  assigned: "Starting",
  moving: "On the way",
  working: "Working",
  waiting: "Waiting",
  handoff: "Sharing",
  collaborating: "Teaming up",
  evaluating: "Reviewing",
  blocked: "Stuck",
  failed: "Hit a problem",
  retrying: "Trying again",
  completed: "Done",
  returning: "Heading back",
};

/** Live questions leave the browser for the AI provider, so visitors are told before they type. */
export const ASK_PRIVACY_NOTE = "Your question is sent to OpenAI to be answered. Please leave out personal or confidential details.";

/** The deterministic demo is a written sample story, so it is never presented as a recording of a live run. */
export const SAMPLE_LABEL = { short: "Sample scenario", detail: " · scripted, not live AI" };

export const CORE_WORDS: Record<CoreState, string> = {
  dormant: "Waiting for a question",
  listening: "Reading your question",
  interpreting: "Understanding the question",
  planning: "Making a plan",
  delegating: "Handing out tasks",
  processing: "Team at work",
  uncertain: "Double-checking a doubt",
  converging: "Agreeing on an answer",
  completed: "Answer ready",
  waiting: "On hold",
  error: "Something went wrong",
};

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
