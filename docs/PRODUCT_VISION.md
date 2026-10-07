# MORPH Product Vision

## Authority

`docs/MASTER_PROMPT.md` (adopted 2026-10-06) is the primary specification. `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md` fills gaps where the primary specification is silent. This document summarizes them and does not replace them.

## Purpose

MORPH is a living spatial agentic intelligence environment whose interface builds and reshapes itself around the user's objective while visible agents actively work inside it. It is a high-end technical showcase for LinkedIn and AI events, engineered as a small, credible, low-cost product.

Target reactions: “Wait… the agents are actually working live inside that environment?” and then “How is this a side project?”

The single most important requirement: **the agents must be visibly alive.** Viewers watch agents receive work, travel, investigate, hand off evidence, collaborate, wait, fail, retry, challenge each other, update the workspace, and converge on an answer in real time. MORPH succeeds when the viewer can watch intelligence working.

## Objective-driven experience

User states an objective → MORPH interprets it → the Planner decomposes it → agents receive tasks and visibly move to work → evidence enters the environment → the workspace creates the modules it needs → agents challenge, hand off, and retry → the user changes assumptions → the world restructures → scenarios are evaluated → MORPH converges on a recommendation.

The interface is not fixed, the agents are not decorative, and the world changes because the problem changes. MORPH must not become a chat UI with a fancy background or a dashboard.

## The world

- **Intent Core** — the iconic central intelligence object with dormant, listening, interpreting, planning, delegating, processing, uncertain, converging, completed, and error states. Nested geometry, particle coherence, orbital structures, controlled deformation, breathing motion, changing symmetry; never a generic glowing ball.
- **Live agents** — real-time 3D creature entities, each with a name, role, current task, state, destination, visible activity, progress, confidence, and a visible link to the module or artifact it works on. See `docs/VISUAL_SYSTEM.md`.
- **Adaptive analysis zones** — distinct spatial machines (Market Intelligence, Competition, Regulation, Economics, Risk, Evidence, Strategy, Simulation, Decision, and others) that materialize as the task requires; not dashboard cards floating in 3D.
- **Agent transit space** — readable routes, light traces, floor/grid activation, and waypoints.
- **Data artifacts** — evidence shards, source packets, analysis cubes, risk markers, assumption tokens, and scenario fragments that agents carry, transmit, combine, reject, or store.
- **Possibility Engine** — a dramatic area where alternative scenarios branch spatially and gain or lose weight as evidence and assumptions change. Scores are model-generated assessments, never scientific probabilities.

## Morphing

When the objective or an assumption changes, the world visibly transforms: still-relevant zones remain, obsolete ones shrink or leave, new ones rise, agents receive new work and physically reroute, and existing evidence is reused. Example reframe: “What if we acquire a local competitor instead?” brings up acquisition targets, valuation, synergy, and integration risk. This transformation is a primary “wow” moment.

## Human input and explainability

Agents can pause for trusted spatial controls (text, number, currency, percentage, slider, single choice, multiple choice, confirmation). Input updates assumptions, orchestration resumes, and the world reacts. Significant changes record a concise “Why did MORPH change?” explanation: reason, triggering evidence, triggering assumption, responsible agent, and operation. No private chain-of-thought is exposed.

## REAL and DEMO modes

DEMO mode is the LinkedIn showcase. It runs from deterministic fixtures and a scripted event timeline with no internet, live model, search provider, database, or external service, and it uses the same event/state architecture as REAL mode. It is not an animation-only fake. REAL mode is optional but working, using real AI and tool calls through provider abstractions.

## Flagship demo (35–60 seconds)

Objective: “Should a European AI software company enter the UAE market?”

1. **Objective (0–3s)** — near-empty chamber; the objective enters; the Core wakes.
2. **Interpretation (3–7s)** — the Planner activates; the Core plans; the first zones begin forming.
3. **Delegation (7–13s)** — Researcher → Market, Researcher → Regulation, Analyst → Competition; agents visibly leave the Core and travel.
4. **Live work and first handoff (13–20s)** — evidence appears and is collected; a data package physically travels Researcher → Analyst and becomes structured insight.
5. **New discovery (20–26s)** — budget and enterprise sales cycle prove critical; Economics and Risk materialize; the world reorganizes; agents reroute.
6. **Human input (26–31s)** — a spatial control asks “Maximum launch budget?”; USD 500,000 is confirmed.
7. **Critic (31–37s)** — the Critic flags an assumption artifact and sends a retry request; the Researcher visibly returns to work.
8. **Possibility Engine (37–44s)** — Direct Entry, Local Partnership, and Delay Entry branch; agents feed evidence into them.
9. **Decision shift (44–50s)** — with the USD 500k budget, Direct Entry weakens and Local Partnership strengthens.
10. **Synthesis (50–56s)** — Strategist and Planner converge at the Core; the Core enters converging.
11. **Recommendation (56–60s)** — **Local Partnership First**, with rationale, supporting evidence, main risks, confidence/uncertainty, and next actions; agents settle; the Core completes.

Money shots: agents leaving the Core for different zones while the world forms; the Critic rejecting an assumption and the Researcher physically retrying; the budget change pulling the world back, repositioning modules, shifting branches, and rerouting agents.

## Surfaces and interaction

Routes: `/` (main experience), `/demo` (deterministic demo), `/showcase` (16:9 recording mode), `/lab` (internal visual/dev controls). The composition target is 70% cinematic spatial world, 20% information visualization, and 10% traditional UI. Users can submit objectives, orbit/pan/zoom, select agents and modules, inspect evidence, change assumptions, answer agent questions, pause/resume/restart the demo, hide/show intelligence activity, and switch to clean presentation mode. Hover is never required for essential actions. Optional subtle audio has a mute toggle and never carries essential information.

## Delivery boundary

Build incrementally through the primary specification's 26 phases with explicit authorization, decision gates, and visual quality gates. See `docs/BUILD_PROGRESS.md` for the phase map and status.
