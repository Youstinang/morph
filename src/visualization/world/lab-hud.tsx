import { useMemo, useState, type FormEvent, type Ref } from "react";
import type { InputValue } from "@/state/input-controls";
import { OBJECTIVE_LIMITS } from "@/state/plan";
import { useWorkspace } from "@/state/react";
import {
  findingLines,
  selectAgents,
  selectAssumptions,
  selectEvidence,
  selectObjective,
  selectPendingInput,
  selectRecommendation,
  selectScenarios,
  webSourceOf,
} from "@/state/selectors";
import { CORE_WORDS, STATE_WORDS, sentenceCase } from "./copy";
import { InputPanel } from "./input-panel";
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
  autoCamera: boolean;
  /** Null when the camera can't move on its own (reduced motion). */
  onToggleCamera: (() => void) | null;
  onSelect: (id: AgentId | null) => void;
  onAnswer: (requestId: string, value: InputValue) => void;
  onSkip: (requestId: string) => void;
  onEngageInput: () => void;
  inputAnchor: Ref<HTMLElement>;
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
  const humanInputs = useWorkspace((workspace) => workspace.humanInputs);
  const cost = useWorkspace((workspace) => workspace.cost);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const live = mode === "real";
  const draftReady = draft.trim().length >= OBJECTIVE_LIMITS.min;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draftReady) return;
    props.onAsk(draft.trim());
    setAsking(false);
    setDraft("");
  };

  const selectedAgent = selected ? agents.find((agent) => agent.id === selected) : null;
  const position = pending ? { index: humanInputs.indexOf(pending), total: humanInputs.length } : null;
  const findings = useMemo(
    () => findingLines(evidence, assumptions, recommendation).slice(-MAX_FINDINGS),
    [evidence, assumptions, recommendation],
  );
  const answer = recommendation?.status === "final" ? recommendation : null;
  const webBacked = evidence.some((item) => item.status === "accepted" && webSourceOf(item));
  const answerWebBacked = answer !== null && answer.evidenceIds.some((evidenceId) => evidence.some((item) => item.id === evidenceId && webSourceOf(item)));

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
          {props.onToggleCamera && (
            <button
              type="button"
              className="lab-btn"
              onClick={props.onToggleCamera}
              aria-pressed={props.autoCamera}
              title={props.autoCamera ? "The camera moves gently for big moments; drag to look around" : "The camera stays where you put it"}
            >
              {props.autoCamera ? "Camera: auto" : "Camera: still"}
            </button>
          )}
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
              <p className="section-label">
                {!live
                  ? "What we know so far"
                  : evidence.length === 0
                    ? "What the plan assumes"
                    : webBacked
                      ? "What the team found · web pages summarized by AI, not checked"
                      : "What the team thinks · AI knowledge, not checked"}
              </p>
              <ul>
                {findings.map((finding) => (
                  <li key={finding.key} data-kind={finding.kind}>
                    {finding.text}
                    {finding.source && (
                      <>
                        {" "}
                        <a className="lab-findings__source" href={finding.source.url} target="_blank" rel="noopener noreferrer nofollow">
                          {finding.source.site}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {scenarios.length > 0 && (
              <div className="lab-options">
                <p className="lab-options__title">{live ? "Possible paths" : "How the options compare"}</p>
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className="lab-scenario">
                    <span>{scenario.label}</span>
                    <span className="lab-scenario__bar">
                      <span style={{ width: `${Math.round(scenario.assessment * 100)}%` }} />
                    </span>
                  </div>
                ))}
                <p className="caption">{live ? "Lume's rough weighing, not a probability." : "The team's judgment, not a probability."}</p>
              </div>
            )}
          </section>
        )}
        {answer && (
          <section className="lab-recommendation" aria-label="Recommendation">
            <p className="section-label">
              {live
                ? `Tentative answer · ${answer.confidence} confidence · ${answerWebBacked ? "partly from web pages, summarized by AI" : "AI general knowledge, not research"}`
                : `Our answer · ${answer.confidence} confidence · demo data, not live research`}
            </p>
            <h2>{answer.statement}</h2>
            <p>{answer.reason}</p>
          </section>
        )}
      </div>

      {pending && (
        <InputPanel
          key={pending.id}
          request={pending}
          position={position}
          canSkip={live}
          anchorRef={props.inputAnchor}
          onAnswer={(value) => props.onAnswer(pending.id, value)}
          onSkip={() => props.onSkip(pending.id)}
          onEngage={props.onEngageInput}
        />
      )}

      <div className="lab-bottom">
        {snapshot.caption && (
          <p key={snapshot.caption.id} className="lab-caption" aria-live="polite">
            <span className="lab-caption__dot" style={{ background: speakerColor(snapshot.caption) }} />
            {snapshot.caption.text}
          </p>
        )}
      </div>
    </div>
  );
}
