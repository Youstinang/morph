import type { Provenance } from "@/state/domain";
import { checkAnswer, type InputControl } from "@/state/input-controls";
import type { AnswerRequest, AnswerResponse } from "@/state/live-work";

/**
 * Nova's questions on a live question: the user answers or skips each one with its trusted control. An
 * answer is recorded as the user's (an answered request and user evidence), then sent to the server so
 * Vex's review and the answer take it into account. The review waits until every question is settled,
 * meaning the server has the reply or couldn't be reached.
 */

export type AnswerRequester = (request: AnswerRequest, signal: AbortSignal) => Promise<AnswerResponse>;

interface Question {
  requestId: string;
  index: number;
  question: string;
  control: InputControl;
  state: "open" | "sending" | "settled";
  evidenceId: string | null;
}

interface DeskDeps {
  propose(operation: Record<string, unknown>, name: string, as: Provenance, summary?: string): boolean;
  /** Narrates something the user should know, such as a reply that didn't reach the server. */
  note(summary: string): void;
  runId(): string | null;
  requestAnswer: AnswerRequester | undefined;
  signal: AbortSignal;
}

const USER: Provenance = { kind: "user" };

export function createQuestionDesk(deps: DeskDeps) {
  const questions: Question[] = [];
  const inbox: { question: Question; reply: AnswerResponse }[] = [];

  function deliver(question: Question, reply: AnswerRequest["reply"]) {
    const runId = deps.runId();
    if (!runId || !deps.requestAnswer) {
      question.state = "settled";
      return;
    }
    question.state = "sending";
    deps.requestAnswer({ runId, question: question.index, reply }, deps.signal).then(
      (response) => inbox.push({ question, reply: response }),
      () => inbox.push({ question, reply: { ok: false, reason: "couldn't reach the server" } }),
    );
  }

  const find = (requestId: string) => questions.find((item) => item.requestId === requestId && item.state === "open");

  return {
    add(requestId: string, index: number, question: string, control: InputControl) {
      questions.push({ requestId, index, question, control, state: "open", evidenceId: null });
    },
    answer(requestId: string, value: unknown): boolean {
      const question = find(requestId);
      if (!question) return false;
      const checked = checkAnswer(question.control, value);
      if (!checked.ok) return false;
      if (!deps.propose({ operation: "answer_human_input", requestId, value: checked.value }, `${requestId}-answer`, USER, `You answered Nova: ${checked.display}.`)) return false;
      const evidenceId = `${requestId}-yours`;
      const statement = `${question.question.replace(/\?$/, "")}: ${checked.display}.`;
      const added = deps.propose(
        { operation: "add_evidence", evidence: { id: evidenceId, statement, kind: "constraint", moduleId: null, foundBy: "user", source: { kind: "user", label: "Your answer", verified: true } } },
        `${requestId}-evidence`,
        USER,
      );
      if (added) question.evidenceId = evidenceId;
      deliver(question, { kind: "answer", value: checked.value });
      return true;
    },
    skip(requestId: string): boolean {
      const question = find(requestId);
      if (!question) return false;
      if (!deps.propose({ operation: "skip_human_input", requestId }, `${requestId}-skip`, USER, "You skipped Nova's question; the team goes on without it.")) return false;
      deliver(question, { kind: "skip" });
      return true;
    },
    /** Acts on server replies; call on the run clock. */
    step() {
      for (const { question, reply } of inbox.splice(0)) {
        question.state = "settled";
        if (reply.ok) continue;
        question.evidenceId = null;
        deps.note(`Your answer didn't reach the team (${reply.reason}); they'll go on without it.`.slice(0, 240));
      }
    },
    /** Some question still waits for the user. */
    get open() {
      return questions.some((question) => question.state === "open");
    },
    get settled() {
      return questions.every((question) => question.state === "settled");
    },
    /** User evidence from answered questions, for the answer to cite. */
    get evidenceIds() {
      return questions.flatMap((question) => question.evidenceId ?? []);
    },
  };
}
