import type { NewEvidence, Objective, Recommendation } from "./domain";
import type { WorkspaceStore } from "./store";

/**
 * A scripted fact the demo applies when a story moment happens. This is the Phase 9 precursor of the
 * MorphOperation protocol (Phase 11), which will replace it with validated, provenance-bearing operations.
 */
export type StoryFact =
  | { type: "objective"; id: string; text: string }
  | { type: "objective-status"; status: Objective["status"] }
  | { type: "evidence"; evidence: NewEvidence }
  | { type: "supersede"; id: string; by: string }
  | { type: "assumption"; id: string; statement: string; raisedBy: string }
  | { type: "challenge"; id: string; by: string; note: string }
  | { type: "resolve"; id: string; status: "confirmed" | "rejected"; evidenceId: string | null }
  | { type: "input-request"; id: string; question: string; askedBy: string }
  | { type: "input-answer"; id: string; answer: string }
  | { type: "recommendation"; recommendation: Omit<Recommendation, "updatedAt"> };

/** Applies one fact; returns false if the store rejected it. */
export function applyStoryFact(store: WorkspaceStore, fact: StoryFact): boolean {
  const s = store.getState();
  switch (fact.type) {
    case "objective":
      return s.receiveObjective(fact.id, fact.text);
    case "objective-status":
      return s.setObjectiveStatus(fact.status);
    case "evidence":
      return s.addEvidence(fact.evidence);
    case "supersede":
      return s.supersedeEvidence(fact.id, fact.by);
    case "assumption":
      return s.raiseAssumption(fact.id, fact.statement, fact.raisedBy);
    case "challenge":
      return s.challengeAssumption(fact.id, fact.by, fact.note);
    case "resolve":
      return s.resolveAssumption(fact.id, fact.status, fact.evidenceId);
    case "input-request":
      return s.requestHumanInput(fact.id, fact.question, fact.askedBy);
    case "input-answer":
      return s.answerHumanInput(fact.id, fact.answer);
    case "recommendation":
      return s.setRecommendation(fact.recommendation);
  }
}
