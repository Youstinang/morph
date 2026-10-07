"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AgentStatus,
  ConfidenceIndicator,
  GlassPanel,
  Metric,
  PrimaryAction,
  SecondaryAction,
  SectionLabel,
  StatusIndicator,
} from "./ui/primitives";
import { CommandInput } from "./ui/command-input";
import { Tooltip } from "./ui/tooltip";
const palette = [
  ["Canvas", "var(--background)"],
  ["Surface", "var(--surface)"],
  ["Ivory", "var(--text)"],
  ["Ice", "var(--emphasis)"],
  ["Success", "var(--success)"],
  ["Warning", "var(--warning)"],
  ["Uncertainty", "var(--uncertainty)"],
];
export function DesignPreview() {
  const [message, setMessage] = useState(
    "Try a control. These samples do not run agents or tools.",
  );
  const [emphasized, setEmphasized] = useState(false);
  const [inputVersion, setInputVersion] = useState(0);
  return (
    <main className="design-preview">
      <a className="skip-link" href="#specimens">
        Skip to component samples
      </a>
      <header className="preview-header">
        <Link className="wordmark" href="/">
          MORPH
          <span className="wordmark-dot" aria-hidden="true">
            .
          </span>
        </Link>
        <span className="section-label">Interface studies / 02</span>
        <StatusIndicator label="Development preview" />
      </header>
      <section className="preview-intro" aria-labelledby="preview-title">
        <SectionLabel>A language for living intelligence</SectionLabel>
        <h1 id="preview-title">
          Intelligence,
          <br />
          <span>with room to think.</span>
        </h1>
        <div className="intro-bottom">
          <p>
            Quiet surfaces. Precise signals. Space for what matters.
            <br />
            The visual foundation for an interface that takes shape around
            intent.
          </p>
          <span className="caption">
            PHASE 02
            <br />
            COMPONENT SPECIMENS
          </span>
        </div>
      </section>
      <section
        className="specimen-section"
        id="specimens"
        aria-labelledby="intent-heading"
      >
        <div className="specimen-heading">
          <SectionLabel>01 / Intent & interaction</SectionLabel>
          <h2 id="intent-heading">Start with a question.</h2>
        </div>
        <div className="interaction-layout">
          <div>
            <CommandInput
              key={inputVersion}
              placeholder="What would you like to understand?"
              onSubmit={(objective) =>
                setMessage(
                  `Preview received: ${objective}. No analysis was started.`,
                )
              }
            />
            <p className="caption input-note">
              A trusted input surface. Press Enter or use the arrow.
            </p>
            <div className="action-row">
              <PrimaryAction
                onClick={() =>
                  setMessage("Primary action selected in the preview.")
                }
              >
                Explore a possibility <span aria-hidden="true">↗</span>
              </PrimaryAction>
              <SecondaryAction
                onClick={() => {
                  setMessage("Preview reset.");
                  setEmphasized(false);
                  setInputVersion((version) => version + 1);
                }}
              >
                Reset preview
              </SecondaryAction>
              <Tooltip content="This page previews UI components. It does not execute research.">
                <button className="info-button" aria-label="About this preview">
                  i
                </button>
              </Tooltip>
            </div>
            <p className="interaction-feedback" role="status">
              {message}
            </p>
          </div>
          <aside className="interaction-aside">
            <SectionLabel>Interaction principles</SectionLabel>
            <p>
              One clear intention.
              <br />A deliberate next step.
              <br />
              Feedback you can understand.
            </p>
            <PrimaryAction disabled>Unavailable action</PrimaryAction>
          </aside>
        </div>
      </section>
      <section className="specimen-section" aria-labelledby="surface-heading">
        <div className="specimen-heading">
          <SectionLabel>02 / Surface & hierarchy</SectionLabel>
          <h2 id="surface-heading">Depth without distraction.</h2>
        </div>
        <div className="surface-layout">
          <GlassPanel
            className={`evidence-specimen ${emphasized ? "is-emphasized" : ""}`}
          >
            <div className="panel-top">
              <SectionLabel>Analytical surface</SectionLabel>
              <StatusIndicator label="Sample content" tone="active" />
            </div>
            <h3>
              Make the important
              <br />
              things feel important.
            </h3>
            <p className="muted">
              A reading surface with a quiet edge, subtle depth, and room for
              evidence. This is a component specimen, not a live research
              result.
            </p>
            <div className="metric-row">
              <Metric
                label="Example constraint"
                value={
                  <>
                    <span className="metric-unit">USD</span> 500,000
                  </>
                }
                detail="Illustrative launch budget"
              />
              <Metric
                label="Surface treatment"
                value="Smoked"
                detail="16px radius · restrained blur"
              />
            </div>
            <SecondaryAction
              aria-pressed={emphasized}
              onClick={() => setEmphasized(!emphasized)}
            >
              {emphasized ? "Remove emphasis" : "Preview emphasis"}
            </SecondaryAction>
          </GlassPanel>
          <div className="signal-specimen">
            <SectionLabel>Signal vocabulary</SectionLabel>
            <div className="signal-list">
              <StatusIndicator label="Neutral / waiting" />
              <StatusIndicator label="Active / selected" tone="active" />
              <StatusIndicator label="Complete / success" tone="success" />
              <StatusIndicator label="Attention / warning" tone="warning" />
              <StatusIndicator
                label="Uncertain / challenged"
                tone="uncertain"
              />
              <StatusIndicator label="Failed / error" tone="error" />
            </div>
            <ConfidenceIndicator
              level="moderate"
              description="Some assumptions still need supporting evidence."
            />
          </div>
        </div>
      </section>
      <section className="specimen-section" aria-labelledby="agents-heading">
        <div className="specimen-heading">
          <SectionLabel>03 / Abstract roles</SectionLabel>
          <h2 id="agents-heading">Presence, without characters.</h2>
        </div>
        <div className="roles-layout">
          <p className="muted">
            Roles are identified through text and restrained signals. These
            static samples demonstrate presentation states, not current agent
            activity.
          </p>
          <div>
            <AgentStatus
              name="Researcher"
              label="Working sample"
              tone="active"
            />
            <AgentStatus
              name="Critic"
              label="Evaluating sample"
              tone="uncertain"
            />
            <AgentStatus
              name="Strategist"
              label="Completed sample"
              tone="success"
            />
          </div>
        </div>
      </section>
      <section className="specimen-section" aria-labelledby="palette-heading">
        <div className="specimen-heading">
          <SectionLabel>04 / Foundations</SectionLabel>
          <h2 id="palette-heading">A restrained spectrum.</h2>
        </div>
        <div className="palette-row">
          {palette.map(([name, color]) => (
            <div className="palette-item" key={name}>
              <div className="palette-swatch" style={{ background: color }} />
              <span className="caption">{name}</span>
            </div>
          ))}
        </div>
        <div className="foundation-notes">
          <p>
            Geist Sans / Geist Mono
            <br />
            <span className="muted">
              Locally bundled. Clear hierarchy. Tabular metrics.
            </span>
          </p>
          <p>
            180ms / 360ms
            <br />
            <span className="muted">
              Responsive feedback. Reduced motion respected.
            </span>
          </p>
        </div>
      </section>
      <footer className="preview-footer">
        <span className="wordmark">MORPH.</span>
        <p className="caption">
          Visual system preview · No 3D world or AI execution
        </p>
      </footer>
    </main>
  );
}
