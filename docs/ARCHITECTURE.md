# MORPH Architecture

## Status and authority

`docs/MASTER_PROMPT.md` is the primary specification (adopted 2026-10-06). `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md` governs only where the primary specification is silent. This document describes required responsibilities and the current repository structure. Exact schemas, algorithms, libraries, providers, and services are decided in their assigned phases, with approval required for material choices.

## Required separation of responsibilities

| Boundary | Responsibility | Constraint |
| --- | --- | --- |
| World (3D visualization) | Chamber, Intent Core, agent creatures, zones, artifacts, transit, Possibility Engine, camera director, lighting, effects | Renders canonical state and reacts to events; owns animation timing only; no business logic or provider knowledge |
| HUD (2D visualization) | Objective/status strip, agent roster, agent detail, activity history, telemetry, human-input controls, recommendation panel | Reads state through selectors; dispatches user intents; trusted registered components only |
| Canonical state | Objective, workspace/modules, agents/tasks, evidence/artifacts, assumptions, scenarios, recommendation, cost usage | Single authoritative model; changes only via validated `MorphOperation`s through `applyMorphOperation` |
| Events | Typed `WorkspaceEvent` bus | In-memory; feeds world, HUD, history, replay, telemetry; no external queues |
| Orchestration | Planning, task dependencies, bounded concurrency, timeouts, cancellation, retry limits, handoff, collaboration, evaluation, synthesis, human-input pause/resume | Publishes events and proposes operations; never touches renderer internals |
| Demo runtime | Deterministic fixtures and scripted `DemoTimelineEvent`s | Uses the same events, operations, and state as REAL mode; no animation-only path |
| AI providers | Structured/text generation, streaming if needed | Replaceable adapters; Zod-validated outputs; secrets server-side; invisible to the visual layer |
| Tools | `webSearch`, `calculator`, `structuredCompare` | Typed input/output schemas; provenance preserved; mock tools for DEMO |
| Observability | Event history, telemetry (agents, tasks, tool/model calls, tokens, cost, retries, failures), “Why did MORPH change?” records | No secrets or private chain-of-thought; mostly hidden in clean/showcase mode |

These boundaries do not imply separate services, databases, queues, or deployments. MORPH is one modular Next.js application.

## Information flow

Objective or trusted user input → orchestration (REAL) or demo timeline (DEMO) → provider/tool adapters with validated outputs → `WorkspaceEvent`s plus proposed `MorphOperation`s → `applyMorphOperation` updates canonical state → world and HUD render from state, while world and camera directors animate in response to events. See `docs/EVENT_MODEL.md`.

## Repository structure

The primary specification suggests `src/morph/*` and `src/world/*` but permits a cleaner structure when boundaries stay explicit. The existing Phase 1 structure is kept and extended:

| Folder | Boundary | Specification equivalent |
| --- | --- | --- |
| `src/app` | Routes (`/`, `/demo`, `/showcase`, `/lab`), layout, global tokens | `src/app` |
| `src/visualization/ui` | 2D primitives and HUD | `src/components/ui`, `src/components/hud` |
| `src/visualization/world` | `/lab` world slice: `scene/` (lighting, orbital station deck, Intent Core, characters, zones, artifacts, tag projection), `sim/` (prototype agent simulation and script), HUD and scene composition | `src/world/*` |
| `src/state` | Domain schemas, store, selectors, MorphOperations | `src/morph/domain`, `state`, `operations` |
| `src/orchestration` | Event bus, orchestrator, demo runtime | `src/morph/events`, `orchestration`, `demo` |
| `src/server/providers` | Secret-bearing AI provider adapters | `src/morph/providers` |
| `src/server/tools` | Server-side tool adapters | `src/morph/tools` |
| `src/observability` | History, telemetry, explanations | — |
| `src/config` | Environment validation | `src/lib` |
| `tests` | Shared test setup and integration tests | `tests` |

ESLint rules prohibit the visualization layer from importing server adapters, orchestration internals, or configuration directly. Subfolders are created when their phase begins; reserved folders contain markers only until then.

## Technology

Implemented (Phases 1–2 of the previous plan): Next.js 16.3.8 App Router, React 19.3.0, TypeScript 6.0.3 strict, Tailwind 4.3.3 with CSS variables, Zod 4.6.5, Vitest 5.0.3 with React Testing Library, ESLint, npm, Radix Tooltip. Exact versions are pinned in `package.json`.

Added 2026-10-06 for the world slice: three 0.186.1, @react-three/fiber 9.8.1, @react-three/drei 10.7.9, @react-three/postprocessing 3.1.3, postprocessing 6.39.5 (bloom and vignette), and @types/three. GSAP is not needed so far because procedural animation runs in `useFrame`. Zustand 5.0.15 was added in Phase 9 for the workspace store (delegated by the user). Still to evaluate: Playwright if useful (Phase 24). A postprocessing library, an audio library, or authored 3D models would each need a decision. No database, persistence, hosting, queue, Redis, Kafka, or Kubernetes is selected.

## Trust and resource boundaries

- Credentials and secret-bearing AI/tool execution stay server-side; never use `NEXT_PUBLIC_` for secrets.
- Model and tool outputs are untrusted until validated. Unsourced model text is never verified evidence.
- Bound concurrency, retries, execution steps, model calls, time, and cost; support cancellation; fail visibly and gracefully.
- No arbitrary AI-generated code or HTML execution; only trusted registered components render.
- Three.js resources, animation loops, and listeners are disposed. Rendering targets 60 FPS on a modern MacBook, with a graceful ~30 FPS fallback.

## Implementation plan (primary specification, 26 phases)

| Phase | Scope | Gate |
| --- | --- | --- |
| 1 | Architecture + repository plan | Complete |
| 2 | Application scaffold | Complete |
| 3 | 2D design system + HUD | In progress; visual gate |
| 4 | Base 3D intelligence chamber | Decisions + visual gate |
| 5 | Intent Core | Decisions + visual gate |
| 6 | Agent creature prototype (one agent: idle, assigned, move, work, carry/transfer artifact, complete, return) | Critical; decisions + visual gate |
| 7 | Multiple agent system | Visual gate |
| 8 | Spatial modules / zones | Layout decision + visual gate |
| 9 | Workspace domain state (Zod + Zustand) | State-model decision |
| 10 | Typed event system | Event contract review |
| 11 | MorphOperation protocol | Protocol review |
| 12 | World morphing engine | Visual gate |
| 13 | Deterministic demo runtime | — |
| 14 | Agent orchestration | Limits decision |
| 15 | Collaboration / handoff / failure / retry | Visual gate |
| 16 | Human-in-the-loop controls | — |
| 17 | Possibility Engine | Visual gate |
| 18 | Cinematic camera director | Camera-style decision + visual gate |
| 19 | Objective planner / real AI provider | Provider/model decision |
| 20 | Research tools | Search-provider decision |
| 21 | Explainability | — |
| 22 | Flagship demo choreography | Visual gate |
| 23 | Performance + reliability | Quality-preset decision if needed |
| 24 | Security + tests | — |
| 25 | Extreme visual polish | Visual gate; audio decision |
| 26 | Showcase / deployment | Hosting decision + visual gate |

Current world slice: `src/visualization/world/sim` is a deterministic, fixed-step prototype simulation. It covers agents with 13 states, per-agent action scripts, signals, zone materialization, artifact flights, the human-input pause, and scenario weights. It is tested and drives the 3D scene and HUD through a ref plus a throttled snapshot. It is explicitly *prototype state*: Phases 9–13 replace it with the canonical workspace store, typed events, `MorphOperation`s, and the demo runtime. The scene components read only the world shape, so the swap stays contained.

Note: in this order, the world (Phases 4–8) is prototyped before the canonical state (Phase 9). Prototype phases drive visuals from local typed preview controls under `/lab` that mirror the planned state/event shapes. Phases 9–13 then rewire those visuals to canonical state and events. Prototype state must not become a competing domain model.
