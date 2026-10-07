import { useMemo, useState } from "react";
import { BUDGET_ANSWER } from "@/state/fixtures/uae-market";
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
}

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

  const selectedAgent = selected ? agents.find((agent) => agent.id === selected) : null;
  const request = pending ?? answered;
  const askingBudget = pending !== null || (answered !== null && snapshot.time - answered.answeredAt! < 3);
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
        </div>
        <p className="lab-objective">{objective ? objective.text : "\u00a0"}</p>
        <div className="lab-controls" role="toolbar" aria-label="Demo controls">
          <button type="button" className="lab-btn" onClick={props.onTogglePause}>
            {props.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="lab-btn" onClick={props.onRestart}>
            Restart
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
        {(findings.length > 0 || scenarios.length > 0) && (
          <section className="lab-findings" aria-label="What we know so far">
            <div className="lab-findings__list">
              <p className="section-label">What we know so far</p>
              <ul>
                {findings.map((finding) => (
                  <li key={finding.key} data-kind={finding.kind}>
                    {finding.text}
                  </li>
                ))}
              </ul>
            </div>
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
              Our answer · {answer.confidence} confidence{mode === "demo" ? " · demo data, not live research" : ""}
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
