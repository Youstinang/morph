import { useMemo, useState, type FormEvent } from "react";
import { BUDGET_ANSWER } from "@/state/fixtures/uae-market";
import { OBJECTIVE_LIMITS } from "@/state/plan";
import { useWorkspace } from "@/state/react";
import {
  findingLines,
  selectAgents,
  selectAssumptions,
  selectEvidence,
  selectLatestAnswer,
  selectObjective,
  selectPendingInput,
  selectRecommendation,
  selectScenarios,
} from "@/state/selectors";
import { CORE_WORDS, STATE_WORDS, sentenceCase } from "./copy";
import { AGENTS } from "./sim/roster";
import type { AgentId, LogEntry } from "./sim/types";
import type { LabSnapshot } from "./snapshot";

interface LabHudProps {
  snapshot: LabSnapshot;
  paused: boolean;
  speed: number;
  labels: boolean;
  quality: "high" | "balanced";
  selected: AgentId | null;
  onTogglePause: () => void;
  onRestart: () => void;
  onSpeed: () => void;
  onToggleLabels: () => void;
  onToggleQuality: () => void;
  onSelect: (id: AgentId | null) => void;
  onConfirmBudget: () => void;
  onAsk: (objective: string) => void;
  onBackToDemo: () => void;
}

const SHOW_COST = process.env.NODE_ENV !== "production";

const MAX_FINDINGS = 4;

function speakerColor(entry: LogEntry) {
  return entry.agent === "user" || entry.agent === "system" ? "var(--text-muted)" : AGENTS[entry.agent].look.accent;
}

export function LabHud(props: LabHudProps) {
  const { snapshot, selected } = props;
  const [showSteps, setShowSteps] = useState(false);
  const objective = useWorkspace(selectObjective);
  const agents = useWorkspace(selectAgents);
  const evidence = useWorkspace(selectEvidence);
  const assumptions = useWorkspace(selectAssumptions);
  const scenarios = useWorkspace(selectScenarios);
  const recommendation = useWorkspace(selectRecommendation);
  const mode = useWorkspace((workspace) => workspace.mode);
  const pending = useWorkspace(selectPendingInput);
  const answered = useWorkspace(selectLatestAnswer);
  const humanInputs = useWorkspace((workspace) => workspace.humanInputs);
  const cost = useWorkspace((workspace) => workspace.cost);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const live = mode === "real";
  const questions = live ? humanInputs.filter((request) => request.status === "pending") : [];
  const draftReady = draft.trim().length >= OBJECTIVE_LIMITS.min;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draftReady) return;
    props.onAsk(draft.trim());
    setAsking(false);
    setDraft("");
  };

  const selectedAgent = selected ? agents.find((agent) => agent.id === selected) : null;
  const request = pending ?? answered;
  const askingBudget = !live && (pending !== null || (answered !== null && snapshot.time - answered.answeredAt! < 3));
  const findings = useMemo(
    () => findingLines(evidence, assumptions, recommendation).slice(-MAX_FINDINGS),
    [evidence, assumptions, recommendation],
  );
  const answer = recommendation?.status === "final" ? recommendation : null;

  return (
    <div className="lab-hud">
      <header className="lab-top">
        <div className="lab-brand">
          <span className="wordmark">
            MORPH<span className="wordmark-dot">.</span>
          </span>
          <span className="lab-core">
            <span className="status-dot" /> {CORE_WORDS[snapshot.core]}
          </span>
          {live && <span className="lab-objective__mode">Live AI</span>}
          {SHOW_COST && live && cost.modelCalls > 0 && (
            <span className="lab-cost">
              AI cost ≈ ${cost.estimatedUsd.toFixed(4)} · {cost.modelCalls} call{cost.modelCalls === 1 ? "" : "s"} (dev only)
            </span>
          )}
        </div>
        {asking ? (
          <form className="lab-ask" onSubmit={submit}>
            <input
              autoFocus
              aria-label="Your question for the team"
              placeholder="Ask the team a decision question…"
              maxLength={OBJECTIVE_LIMITS.max}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAsking(false);
              }}
            />
            <button type="submit" className="action action-primary" disabled={!draftReady}>
              Ask
            </button>
            <button type="button" className="lab-btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <p className="lab-objective">
            {objective ? objective.text : "\u00a0"}
          </p>
        )}
        <div className="lab-controls" role="toolbar" aria-label="Demo controls">
          {!asking && (
            <button type="button" className="lab-btn lab-btn--ask" onClick={() => setAsking(true)}>
              Ask a question
            </button>
          )}
          <button type="button" className="lab-btn" onClick={props.onTogglePause}>
            {props.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="lab-btn" onClick={live ? props.onBackToDemo : props.onRestart}>
            {live ? "Back to demo" : "Restart"}
          </button>
          <button type="button" className="lab-btn" onClick={props.onSpeed} aria-label={`Playback speed ${props.speed}x`}>
            {props.speed}×
          </button>
          <button type="button" className="lab-btn" onClick={props.onToggleLabels} aria-pressed={props.labels}>
            Names
          </button>
          <button type="button" className="lab-btn" onClick={props.onToggleQuality}>
            {props.quality === "high" ? "High" : "Balanced"}
          </button>
        </div>
      </header>

      <div className="lab-team">
        <nav className="lab-roster" aria-label="Team">
          {agents.map((agent) => {
            const id = agent.id as AgentId;
            const profile = AGENTS[id];
            return (
              <button
                key={agent.id}
                type="button"
                className="lab-roster__item"
                aria-pressed={selected === id}
                onClick={() => props.onSelect(selected === id ? null : id)}
              >
                <span className="lab-roster__dot" style={{ background: profile.look.accent }} />
                <span className="lab-roster__name">{profile.name}</span>
                <span className="lab-roster__role">{profile.role}</span>
                <span className="lab-roster__state" data-state={agent.state}>
                  {STATE_WORDS[agent.state]}
                </span>
              </button>
            );
          })}
        </nav>
        <section className={`lab-steps ${showSteps ? "lab-steps--open" : ""}`} aria-label="Step by step">
          <button type="button" className="lab-btn" aria-expanded={showSteps} onClick={() => setShowSteps((value) => !value)}>
            {showSteps ? "Hide steps" : "Show steps"}
          </button>
          {showSteps && (
            <ol>
              {snapshot.log.map((entry) => (
                <li key={entry.id}>
                  <span className="lab-caption__dot" style={{ background: speakerColor(entry) }} />
                  {entry.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="lab-info">
        {selectedAgent && (
          <section className="lab-detail" aria-label={`${selectedAgent.name} detail`}>
            <p className="lab-detail__name">
              {selectedAgent.name} <span>{AGENTS[selectedAgent.id as AgentId].role}</span>
            </p>
            <p className="lab-detail__summary">{AGENTS[selectedAgent.id as AgentId].summary}</p>
            <p className="lab-detail__now">
              <span data-state={selectedAgent.state}>{STATE_WORDS[selectedAgent.state]}</span>
              {sentenceCase(selectedAgent.task)}
            </p>
          </section>
        )}
        {(findings.length > 0 || scenarios.length > 0 || questions.length > 0) && (
          <section className="lab-findings" aria-label="What we know so far">
            <div className="lab-findings__list">
              <p className="section-label">{!live ? "What we know so far" : evidence.length > 0 ? "What the team thinks · AI knowledge, not checked" : "What the plan assumes"}</p>
              <ul>
                {findings.map((finding) => (
                  <li key={finding.key} data-kind={finding.kind}>
                    {finding.text}
                  </li>
                ))}
              </ul>
            </div>
            {questions.length > 0 && (
              <div className="lab-options lab-questions">
                <p className="lab-options__title">Nova would ask you · answering comes later</p>
                <ul>
                  {questions.map((request) => (
                    <li key={request.id} data-kind="question">
                      {request.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scenarios.length > 0 && (
              <div className="lab-options">
                <p className="lab-options__title">How the options compare</p>
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className="lab-scenario">
                    <span>{scenario.label}</span>
                    <span className="lab-scenario__bar">
                      <span style={{ width: `${Math.round(scenario.assessment * 100)}%` }} />
                    </span>
                  </div>
                ))}
                <p className="caption">The team&apos;s judgment, not a probability.</p>
              </div>
            )}
          </section>
        )}
        {answer && (
          <section className="lab-recommendation" aria-label="Recommendation">
            <p className="section-label">
              {live
                ? `Tentative answer · ${answer.confidence} confidence · AI general knowledge, not research`
                : `Our answer · ${answer.confidence} confidence · demo data, not live research`}
            </p>
            <h2>{answer.statement}</h2>
            <p>{answer.reason}</p>
          </section>
        )}
      </div>

      <div className="lab-bottom">
        {snapshot.caption && !askingBudget && (
          <p key={snapshot.caption.id} className="lab-caption" aria-live="polite">
            <span className="lab-caption__dot" style={{ background: speakerColor(snapshot.caption) }} />
            {snapshot.caption.text}
          </p>
        )}
        {askingBudget && request && (
          <section className="lab-input" aria-label="Your input">
            <span className="lab-caption__dot" style={{ background: AGENTS.nova.look.accent }} />
            <p className="lab-input__question">
              <span>Nova asks:</span> {request.question}
            </p>
            <strong className="lab-input__value">{request.answer ?? BUDGET_ANSWER}</strong>
            {pending ? (
              <button type="button" className="action action-primary" onClick={props.onConfirmBudget}>
                Confirm
              </button>
            ) : (
              <span className="lab-input__done">Got it</span>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
