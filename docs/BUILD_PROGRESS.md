# MORPH Build Progress

## Current Phase
Phase 15 — Collaboration, handoff, failure and retry visuals (authorized 2026-10-07: "remove any limitation and go for phase 15"); complete, visually approved 2026-10-07

## Status
Complete — the user visually approved Phase 15 on 2026-10-07. Phase 14 is implemented and validated (it has no visual checkpoint of its own; Phase 15 reviews how collaboration, handoffs, failures and retries look). Phase 13 is implemented and validated (it has no visual checkpoint; the screen is intentionally unchanged). The architecture audit due after Phases 11, 12 and 19 was done first (see Audit 2026-10-07, after Phases 11, 12 and 19). Phase 19 is complete: the user moved on after reviewing it. Phase 12 is complete: the user moved on with "build next phase pls" on 2026-10-07, recorded as approval of the morphing visuals. Phase 11 is validated (it has no visual checkpoint; the screen is intentionally unchanged, and every change to the record now passes the operation checker). Phase 10 is validated. The post-phase audit after Phases 8–10 is done (see Audit 2026-10-07, after Phases 8–10). Phase 9 is validated. The user visually approved Phase 8 on 2026-10-07. Phases 3–7 were approved on 2026-10-07 after the clear-world pass; the post-phase architecture audit was done (see Audit 2026-10-07).

## Phase Map
On 2026-10-06 the user adopted `docs/MASTER_PROMPT.md` as the primary specification and chose to map completed work onto its 26-phase plan.

| Previous plan (MORPH_CODEX_MASTER_v2) | Primary specification | Status |
| --- | --- | --- |
| Phase 0 — Repository Constitution + spec adoption docs | Phase 1 — Architecture + repository plan | Complete |
| Phase 1 — Application Scaffold | Phase 2 — Application scaffold | Complete |
| Phase 2 — Visual Design System | Phase 3 — 2D design system + HUD | Complete as the `/lab` HUD over the 3D world (the standalone 2D page was rejected) |
| — | Phases 4–7 — chamber, Core, agents, multi-agent | Complete in `/lab` (approved 2026-10-07) |

## Completed Phases
- Phase 1 — Architecture + repository plan.
- Phase 2 — Application scaffold.
- Phase 3 — HUD, delivered as the guided-story, clear-lane HUD over the 3D world.
- Phases 4–7 — Orbital command deck, Intent Core, rigged agent characters, and the six-agent flagship choreography in `/lab`.
- Phase 8 — Spatial modules with the grouped-neighborhood layout.
- Phase 9 — Workspace domain state: Zod schemas, a Zustand store, selectors, and the demo fixture; the HUD reads from the store.
- Phase 10 — Typed event system: `WorkspaceEvent` contract and in-memory bus; the 3D world, the store and the steps list all run on events.
- Phase 11 — MorphOperation protocol: every change to the canonical record is a validated operation applied through `applyMorphOperation` and announced by the operation gate; development-only `/dev/operations` page.
- Phase 12 — World morphing engine: glide, carry, replacement, morph sweep, calm mode, and the `/dev/modules` operation sandbox.
- Phase 19 (moved forward) — Objective planner / real AI provider: "Ask a question" on `/lab` plans the user's own question with a real model and acts the plan out on the deck.
- Phase 13 — Deterministic demo runtime: the run controller, demo runtime and live question run live in `src/orchestration` on a fixed-step clock; the 3D world attaches to the run.
- Phase 14 — Agent orchestration: after planning, live questions continue. Agents work their tasks two at a time with model calls, Vex challenges the weakest point, and Lume and Nova give a labelled tentative answer, all within per-question limits enforced by the server.
- Phase 15 — Collaboration, handoff, failure and retry visuals (visually approved 2026-10-07).

## Key Architecture Decisions
- 2026-10-06: `docs/MASTER_PROMPT.md` is the primary specification; `MORPH_CODEX_MASTER_v2.md` governs only where it is silent.
- 2026-10-06: the user rejected the 2D design-system page, asked for moving agents in a 3D environment, and authorized building it ("build whatever, it will actually build real 3D characters"). The user supplied a character concept sheet (`docs/previews/agent-concept-sheet.jpg`) to convert to 3D.
- Agent roster follows the user's concept sheet: Nova (Planner), Orion (Researcher), Sage (Analyst), Brix (Builder), Vex (Critic), Lume (Synthesizer). Builder and Synthesizer replace the specification's Strategist and Simulator. Brix builds new zones (Economics, Risk, Possibility Engine); Lume evaluates scenarios and synthesizes with Nova.
- Characters are code-built, jointed, stylized 3D figures with procedural animation, matching each concept's palette, hair, coat or cape, build, and prop. Image-to-3D conversion through Figma Weave was attempted but is unavailable: the user's Figma account is not linked to Weave.
- Stack added: three 0.186.1, @react-three/fiber 9.8.1, @react-three/drei 10.7.9, @react-three/postprocessing 3.1.3, postprocessing 6.39.5, @types/three 0.186.0 (all exact-pinned; peer ranges verified against React 19.3).
- Prototype simulation (`src/visualization/world/sim`): deterministic fixed-step (60 Hz) world with per-agent action scripts (wait, waitFor signal, moveTo, hold state, emit, handoff), signals, zone materialization, artifact flights, routing around the Core, a budget human-input pause (auto-confirms after 3.5 s or on click), core-state derivation, scenario weights, and loop restart. It is prototype state, to be replaced by the canonical store, events, and operations in Phases 9–13.
- Rendering: the scene reads the world through a ref and animates in `useFrame` with no React re-renders. The HUD receives a throttled snapshot (about 7 Hz). Agent name tags are one DOM layer positioned by projecting each agent to screen space; drei `Html` was removed because of React 19 dev root-unmount warnings.
- 2026-10-07: the user kept the code-built characters (dropping the Figma/Weave model route) and chose an **orbital command deck, rich but readable** as the environment (`scene/station.tsx`). This overrides the specification's "not a literal building" chamber line.
  - Contents: a deck with seams, a Core dais, a curved ribbed wall with a panoramic window onto a planet and stars, a front rail, consoles, eight archive towers, and six docking bays.
  - Some decor reacts to state. Light-tracks light up per zone and brighten with its activity, bay doors open when their zone materializes, and the archive towers fill with total evidence. Everything else is static.
- 2026-10-07: the user asked for more detail, so a machinery layer was added (`scene/station-machinery.tsx`, sharing helpers through `scene/station-layout.ts`).
  - Contents: an overhead truss, hanging lamps, a cargo rail and pod, a Core emitter, service arms, conduits and generators.
  - What reacts to state: the pod travels to the bay that just received evidence, the emitter follows the Core state, the arms follow their zone's existence, build and activity, and the generators show how many agents are working.
  - The overview camera target was raised from y 0.8 to 1.6 so the overhead structure is in frame.
- 2026-10-07: the user said the graphics looked basic, asked for "lights, colors, a cyberpunk vibe", and said agents can't be faceless.
  - Environment:
    - Neon palette of cyan, magenta and amber, plus violet (`NEON` in `scene/station-layout.ts`).
    - Alternating neon wall bands and rib strips.
    - Colored directional and point lights, and a purple fog.
    - A wetter reflective floor.
    - Colored hanging lamps with soft light shafts.
    - Neon vertical signs and a deck banner.
    - A nebula sky, and city lights on the planet.
    - Stronger bloom: intensity 1.05, threshold 0.72.
  - Faces (`scene/face.ts`):
    - Each head has a painted face texture: almond eyes with irises that glow in the agent's eye color, brows, liner, nose shading, lips and freckles.
    - Each agent's face style is defined in its look (`FaceStyle` in `roster.ts`).
    - Heads also gained a nose and ears, Orion has glasses, and heads are 10% larger.
    - Hair shapes were moved back so they no longer cover the face.
  - Agents resting at home now face out from the Core, toward the viewer (`faceOutwardAtHome` in the simulation, with a test).
  - Selecting an agent now swings the camera to a front three-quarter portrait that follows the agent; clicking empty space returns to the overview.
- 2026-10-07: the user asked for well-designed characters made the cheapest and easiest way, and supplied six Meshy image-to-3D models (FBX, about 2–3 million triangles each, not rigged). Meshy's rigging service and Blender were both unavailable, so they are converted and auto-rigged locally at no cost (see `VISUAL_SYSTEM.md`, Agents).
  - The code-built bodies, painted faces, hair and code-built props were removed (`face.ts`, `character-parts.tsx` and `materials.ts` deleted). The `face`, hair and prop fields in `roster.ts` remain as descriptive identity data.
  - New `scene/agent-model.tsx` loads `/models/{id}.glb` and drives its bones from the existing state poses at reduced amplitude.
  - New development-only route `/dev/models` for inspecting the rigged lineup.
- 2026-10-07: the user asked for zone workstations that differ by component instead of one shared look, and supplied three Meshy models: a hologram core, a curved operator console and a tactical war-room table.
  - The user chose the "match the kind of work" mapping: consoles at Market and Regulation, war-room tables at Competition and Risk, the hologram at Economics, and the Possibility Engine unchanged.
  - The user chose to keep the live chart panels, floating above each model.
  - See `VISUAL_SYSTEM.md`, Adaptive analysis zones.
- 2026-10-07: the user said the data read "technically" rather than insightfully, and the UI was noisy. The user chose:
  - the guided-story layout (one narration caption, "What we know so far" findings, name-plus-status tags, and steps hidden behind a toggle);
  - plain headlines on the zone panels;
  - the plain-language voice.
  - Details are in `VISUAL_SYSTEM.md`, "On-screen story and language".
  - New story beats `rules`, `competition` and `risk-check` were added; they are instant and don't change timing.
  - `LogEntry` gained a `beat` flag.
  - New helpers `currentFindings` and `zoneHeadline` in `sim/world.ts`; the content lives in `FINDINGS` and `ZONE_HEADLINES` in `sim/script.ts`.
  - The recommendation now reads "Start with a local partner", with a plain reason.
- 2026-10-07: the user said text cards still hid characters and stations, and asked that they sit in empty space.
  - The HUD now uses fixed lanes, and the camera frames the world in the remaining free area at every screen size (see `VISUAL_SYSTEM.md`).
  - The answer card's confidence note moved into its label.
- 2026-10-07, Phase 8: the user chose the **grouped neighborhoods** layout (research / analysis / decision) over an even ring or fixed docking bays.
  - Zones became configured spatial modules with create, reserve and reveal, remove (with a dissolve), emphasize and mute, collapse and expand, and resize. Status is derived: reserved, materializing, active, idle, collapsed or dissolving.
  - The layout engine is deterministic: neighborhoods centred on anchors, move outward first, then shrink, and never overlap. Details are in `VISUAL_SYSTEM.md`, Adaptive analysis zones.
  - `ZoneId`, `ZONES` and `ZONE_ORDER` were removed. Module ids are open strings, and the demo catalog, story-driven module changes and panel headlines live in `sim/script.ts`.
  - Bays, service arms and Core light-tracks moved out of the static station into each module's rig. The cargo pod targets live module positions.
  - `ModuleChange` is the prototype precursor of `MorphOperation`. Since Phase 11 it is only the world's internal visual change, driven by the events of accepted operations.
  - The demo story and timing are unchanged. Its later modules are reserved when the discovery fires, so they open in their final spots.
- 2026-10-07, Phase 9: the user delegated the store choice ("use your recommendation"), so **Zustand 5.0.15** was added (exact-pinned; small, no providers needed outside React, works with React 19.3; production audit clean). The user chose the **split** boundary: the store holds the facts, and the 3D world keeps motion (positions, routes, timing).
  - `src/state/domain.ts`: Zod schemas and types for the workspace — objective, agents (13 states), tasks, modules, evidence with source provenance, assumptions, scenarios (model-generated assessments 0–1, not probabilities), recommendation, human-input requests, tool calls and cost. Fixture sources are marked unverified; only the user's own answer counts as verified.
  - `src/state/store.ts`: `createWorkspaceStore` (vanilla Zustand). Every action validates its input, refuses unknown ids, dangling references and out-of-order changes (for example, resolving an assumption that was never challenged), returns whether it applied, and updates immutably so untouched records keep their identity.
  - `src/state/selectors.ts` (including `findingLines`, which replaces the old `currentFindings`) and `src/state/react.tsx` (`WorkspaceProvider`, `useWorkspace` with shallow comparison).
  - `src/state/fixtures/uae-market.ts`: the demo's objective, agents, modules, text and `UAE_STORY` (facts keyed by story signal). `src/state/story.ts`: `StoryFact` and `applyStoryFact`, the precursor of Phase 11's operations.
  - `src/visualization/world/workspace-sync.ts`: a temporary bridge that mirrors the prototype world into the store at the HUD's rate (time, modules, agents, tasks, story facts, scenarios) and resets it when the story loops. Phase 13's demo runtime replaces it.
  - The HUD now reads objective, agents, findings, scenarios, the budget question and the answer from the store. `FINDINGS`, `currentFindings` and the HUD snapshot's copies of agent and finding data were removed. The 3D scene still reads the world (motion and module visuals), as intended until Phases 10–13.
- 2026-10-07, Phase 10: the user chose to **make the 3D world react to events now**, over connecting only the text panels or building the bus alone. See `EVENT_MODEL.md`.
  - `src/events/schema.ts`: about 40 Zod-validated event types covering the specification's catalog plus `run_started`, `module_reserved`, `module_updated`, `sources_checked`, `task_completed`, `task_failed`, `assumption_resolved`, `agent_waiting`, `agent_idle` and `tool_failed`. The envelope has `seq`, `at`, `cycle`, `source` (user, demo, orchestrator or world) and an optional one-line `summary`.
  - `src/events/bus.ts`: a synchronous in-memory bus. It validates and stamps each event, rejects malformed ones, queues events published by listeners so everyone sees one order, isolates failing listeners, and keeps a bounded history (1000) with counters. No external queue.
  - `src/events/agents.ts`: one agent-state transition table shared by the store and the world.
  - The event contract and bus live in `src/events`, not `src/orchestration`, because visualization subscribes and may not import orchestration.
  - The prototype simulation was split. `sim/runner.ts` (story runner) publishes events and waits for the world's reports; it never touches the world. `sim/world.ts` changes only through `reactToEvent` and its own animation, and reports `agent_move_started`, `agent_arrived` and `artifact_handoff_completed`. `sim/session.ts` runs both on one clock and handles the loop.
  - The world derives the Core's mood, the options display, the budget cue, station headlines and source indicators from events (`StoryView`, `ModuleRuntime.headline`) instead of reading story signals. Module visuals are chosen by kind (`presentationFor`).
  - The fixture's `UAE_TIMELINE` replaces `UAE_STORY`, `MODULE_CHANGES`, `MODULE_HEADLINES` and the script's narration strings. `src/state/apply-event.ts` (`applyWorkspaceEvent`, `connectWorkspace`) replaces `story.ts` and the Phase 9 polling bridge (`workspace-sync.ts`, removed).
  - The steps list and caption are narrated from the event history (`narration.ts`). The budget autoplay answer is recorded as `source: "demo"`, `answeredBy: "autoplay"`; a click on Confirm is `source: "user"`.
  - A new instant `planning` story moment publishes `planning_started`.
  - Timing compared with the Phase 9 code: the same order of story moments, each at most 0.17 s later over the 58.7 s story (one frame per arrival).
- 2026-10-07, Phase 11: the user chose **"record"**: every change to the record goes through the checker, the world reacts only to accepted changes, agent activity (walk, arrive, work) stays as plain events, plus a development-only page for sending broken, AI-style requests. See `EVENT_MODEL.md`, Operations.
  - `src/state/operations.ts`: `MorphOperationSchema`, a strict Zod union of 21 operations (the specification's 18 plus `set_objective`, `update_objective`, `answer_human_input`), each with an id, provenance and an optional reason; `applyMorphOperation` is pure and refuses non-data, oversized, unknown, malformed, repeated, unexplained-significant, dangling, out-of-order and trust-violating proposals with a reason.
  - `src/state/transitions.ts`: the pure record transitions, shared by operations and the store's activity actions.
  - `src/state/gate.ts`: `createOperationGate` stamps the trusted channel's provenance over any claimed source (fixing a gap found during implementation where a proposal could claim to be the user), applies through the store, and publishes record events carrying the operation reference, or `operation_rejected`.
  - The store's record mutators were replaced by `apply(operation)`; agent activity keeps `updateAgent`, `startTask`, `finishTask`. `applyWorkspaceEvent` became `applyActivityEvent`.
  - The bus refuses record events without an operation reference and other events with one. New events: `objective_updated`, `module_moved`, `module_resized`, `evidence_removed`, `task_assigned`, `camera_focus_requested`, `operation_rejected`. `module_updated` carries `changes`; scenario events carry one scenario.
  - Domain additions: module `summary` (the panel headline), workspace `focus` and `appliedOperationIds`, `ProvenanceSchema`, `WhySchema`, `FocusSchema`.
  - The demo's `UAE_TIMELINE` beats now hold items: activity events and operations; every significant demo operation has a reason. The runner proposes operations through the gate (as the user for the user's question and budget answer, otherwise as the demo with the acting agent), and the end-of-run dissolve is `remove_module` with a reason. The session owns the one store the HUD reads.
  - The world reacts to `module_moved` and `module_resized` (new `move` and `retitle` module changes).
- 2026-10-07, Phase 12: the user objected to hard-coded content ("that should be LLM driven"). After the explanation that DEMO mode is a fixed offline recording the specification requires and REAL mode is AI-driven, the user chose to **bring the real AI forward right after this phase** (provider and model choice delegated: "pick provider or model what you need according to the output needed").
  - Consequences: the demo story is unchanged (no new scripted reshuffle); morphing is shown in the `/dev/modules` sandbox and will be driven by the AI planner next; the next phase is the real AI provider and planner (Phase 19, moved forward).
  - The user pasted an OpenAI key and an Anthropic key in the chat. Both are stored only in `.env.local` (git-ignored, file mode 600, read server-side only) and must be revoked and replaced, because chat text is not a safe place for secrets.
  - Morphing engine (`sim/modules.ts`): every layout change travels instead of snapping. Stations staying in their neighborhood glide 1.2 s; a station changing neighborhood is carried: it lifts 3.4 units, shrinks to half size, travels along the ring around the Core (arc-length interpolation, 2–3.6 s by distance) and sets down. Size and crowding change with position. All stations in a changed neighborhood share one clock, starting from where they are, so a change in mid-flight continues smoothly; a redirected carry stays in the air; neighbors wait 0.35 s for a lifting station to clear its slot; a newcomer waits 0.9 s for room before growing.
  - `add_module` accepts `replaces`: the new station takes the old one's slot, position and motion and inherits its evidence; the old one dissolves in place. The gate announces it as `module_created` with `replaces`.
  - `workspace_morph_started` / `workspace_morph_completed` set `world.morph`; a ring of light sweeps the floor from the Core (`scene/morph-sweep.tsx`).
  - Priority changes re-flash the station's light column (brighter when raised).
  - Agents working at a station that moves walk to its new spot, routed around the Core.
  - Calm mode (`motion.ts`, follows the operating-system "reduce motion" setting; also a checkbox in the sandbox): stations fade between places instead of travelling, the camera cuts instead of easing, panel bob, shard drift and the sweep stop. Agents still walk, because their movement is state.
  - `/dev/modules` was rewritten to send operations through the real gate as an AI model would, with presets (Opening plan, New discovery, Priority shift, Rebuild: buy a competitor, Crowd analysis) and per-station controls. Its camera now frames the whole deck.
  - A favicon (`src/app/icon.svg`) was added. Panel titles now redraw when a station is renamed (they never did before).
- 2026-10-07, Phase 19 (moved forward): the user chose **a question box on the main deck** (the recorded demo plays until a question is typed, then the AI takes over the same deck) and, on scope, **"we need less cost"**, so the AI only plans in this phase (no AI-written station content).
  - Provider and model (delegated by the user): **OpenAI `gpt-5.6-luna`**, reasoning effort low, chosen after comparing `gpt-5.4-nano`, `gpt-5.4-mini` and `gpt-5.6-luna` on the same question. Luna is the newest model in the cheapest tier (USD 0.20 / 1.20 per million input/output tokens) and gave the most consistent plans; a plan costs about USD 0.0007 and takes about 6 s. OpenAI was chosen over Anthropic for its strict JSON-schema output; the Anthropic key is unused and the provider interface allows adding it. `MORPH_PLANNER_MODEL` overrides the model.
  - No new dependency: the adapter uses plain `fetch` (the Vercel AI SDK and vendor SDKs were not needed for one structured call).
  - The model fills in a constrained `Plan`, never operations: MORPH validates it (server and browser), assigns all ids, and converts it to ordinary operations through the gate as the planner model. A small tidy-up step (dropping extras, pointing a task at a station named by title) avoids paying for repairs; otherwise one repair call, then a graceful failure.
  - Cost and abuse limits: at most 2 model calls and 2000 output tokens per question, 30 s timeout, 5 questions per minute per client and 60 per hour per server process, request size limits, cancellation when the user leaves the question. Usage is recorded in the workspace's cost (`model_call_completed`) and shown in development only.
  - New events `run_waiting`, `run_failed`, `model_call_completed`; new Core state `waiting` (soft amber). Without research tools the team honestly waits at its stations after planning.
  - The user's question is never logged; the server logs only failure reasons and call counts.
- 2026-10-07, Phase 13: no new material choice; the move into orchestration was the planned architecture. The screen is intentionally unchanged.
  - `src/orchestration/run-controller.ts` (new): owns the bus, store, gate, clock and mode; one runtime at a time; fixed 1/60 s steps through `advance(realSeconds, speed)`, counting at most 0.1 s per frame (the scene used to keep this counter); the demo loop; stages attach with `onCycle`, `beforeStep` and `afterStep`. Without a planner connected, a live question fails with "live AI isn't connected here".
  - `src/orchestration/demo/runtime.ts` (was `sim/runner.ts`) and `demo/script.ts` (the agents' parts, was in `sim/script.ts`). `src/orchestration/live-question.ts` (was `sim/live-runner.ts`) and `plan-client.ts` (was in the visualization folder).
  - `src/visualization/world/sim/session.ts` now only attaches the world to a run (`attachWorld`) and declares the `LabSession` the screen drives; it imports nothing from orchestration. `sim/presentation.ts` keeps the station look registry.
  - `src/app/lab/lab-session.ts` and `lab-client.tsx` wire the two for `/lab`; `LabExperience` receives a session factory.
  - Audit fix: the standing team moved from the demo fixture to `src/state/team.ts`, so live questions no longer borrow it from demo data.
  - Run-level tests moved to `src/app/lab/` (`demo-run`, `workspace-run`, `live-run`), because they need both layers; world-only tests stay in `sim/world.test.ts`.
- 2026-10-07, Phase 14: the user chose:
  - what the team does: **AI-only work, clearly labelled, ending in a tentative answer, under 1 cent per question**;
  - where it is coordinated: **in the browser, with the server making each AI call and enforcing the limits**;
  - the limits: **the recommended ones: 2 agents at once, 30 s per task, 1 retry, 10 AI calls and a USD 0.01 hard stop per question** (`LIVE_LIMITS` in `src/state/live-work.ts`).
  - The steps: one research call per planned task; one critique (Vex), who challenges a plan assumption or a finding, or finds no weak spot; one synthesis (Lume with Nova), giving a statement, a reason, low or moderate confidence and the findings it rests on. Each is one structured call with strict JSON output (`src/orchestration/agent-steps.ts`), validated with Zod; Vex may only name things that exist, and the answer's basis is cut to real findings.
  - With no research tools yet, prompts forbid invented statistics, prices, sources and recent events, and treat the question and notes as quoted data. Every finding is recorded as model evidence labelled "AI general knowledge, not checked against sources", never verified. The answer card says "Tentative answer · {confidence} confidence · AI general knowledge, not research".
  - The browser only names a step (`research` with a task number, `critique` or `synthesis`) and the question's run id. The server keeps each question's record (`src/server/run-registry.ts`: plan, findings, critique, calls, spending and attempts; in memory, 15-minute expiry, at most 500 questions), builds every prompt from that record, and refuses steps beyond the limits, out of order or already done. Calls in flight count toward the call limit, so parallel requests can't overrun it. The plan's call counts too. New route `/api/agent-step` (60 steps per minute per client, 600 per hour per server process).
  - The browser's scheduler (`src/orchestration/scheduler.ts`) handles dependencies, two at a time, timeouts on the run clock, one retry after 1.5 s, and the attempt cap. A task starts only when its agent has arrived. The review waits for any finding and the answer waits for the review, so if every task fails the team stops without them. The whole question also stops after 150 s.
  - On screen, every state is a real step: working while its call runs; "stuck … trying again shortly" then retrying; Vex walks to the Core to review; Lume walks there and collaborates with Nova; the answer, then everyone walks home. A stop at a limit shows "The team stopped: {reason}" with the Core on hold, and the team goes home.
  - No new dependency.
- 2026-10-07, Phase 15: the user asked to "remove any limitation", then chose to **raise the limits a lot but keep a hard stop**: 4 agents at once, 60 s per task, 2 retries, 30 AI calls and a USD 0.05 hard stop per question (`LIVE_LIMITS`). The provider timeout follows the task limit (58 s). The whole question stops after 240 s.
  - Look, chosen by the user (**physical**): a handoff is a glowing data card riding a light beam from hand to hand, with a pulse ring at the receiver's feet when it lands; agents working together share a small rotating hologram that each one's data stream flows into (at the Core, their streams flow into the Core itself instead, because a separate hologram was lost in its glow); a failure shows a calm red warning sign over the agent and leaves a cracked grey card beside them, which turns amber while they try again and fades once the task succeeds.
  - Live work, chosen by the user (**real**): two new AI steps. After research, every researcher walks their finding to Sage at the Core (one card each), and Sage combines them into one insight (one call). Sage hands that card to Vex, who reviews. If Vex doubts a specific finding, he hands a red flag card to that finding's researcher, who walks back to their station "going back to double-check" and re-checks it (one call): it is kept, or a revised finding replaces the old one (the old one stays in the record, marked superseded). Lume and Nova's answer waits for the re-check and names whether the doubted finding stood.
  - The server enforces the new steps: each one runs at most once; a re-check needs a critique that named a real finding; the browser never names the task to re-check, the server takes it from Vex's critique.
  - Demo timing: Sage now waits for Vex to arrive at Costs, so the demo's "Teaming up" hologram always has two agents in it.
  - No new dependency.
- ESLint: `react-hooks/immutability` is disabled only for `src/visualization/world/scene/**`, because Three.js objects are mutated imperatively inside `useFrame`.
- Foundation unchanged: Next.js 16.3.8, React 19.3.0, TypeScript 6.0.3 strict, Tailwind 4.3.3, Zod 4.6.5, Vitest 5.0.3, ESLint 9, npm, Node 24.

## Validation
- Typecheck: PASS (strict).
- Lint: PASS, zero warnings.
- Unit tests: PASS — 19 tests in 4 files. The 8 new simulation tests cover flagship signal order and total time under 90 s; every agent moving and working; Orion passing through assigned, handoff, failed, retrying, completed, and returning; Sage waiting; Vex handing off; determinism; the budget pause with early confirmation; zones materializing only from plan or builder signals; core state and scenario weights; routing around the Core; and loop restart.
- Integration tests: existing semantic shell test passes. No browser end-to-end tests yet.
- Production build: PASS; `/lab` prerenders as static.
- Runtime/manual check: PASS — Chrome (Playwright driving the installed Chrome, outside the repo) at 1440×900, captured at 15 s, 21 s, 27 s, 44 s, 51 s, and 60 s. The full story completes at about 57.5 s, then loops. Measured 60 FPS with reflections and bloom on. No runtime errors; console shows only a missing-favicon 404 and a three.js `Clock` deprecation notice from a dependency. Mobile 390×844 is checked: the layout wraps without overflow.
- Station pass (2026-10-07):
  - Typecheck, lint, the 19 tests and the build pass.
  - Chrome at 1440×900 holds 60 FPS with reflections and bloom on.
  - Also checked at 1024×900.
  - Fixed zone panels reading backwards when seen from behind; they now have a solid back.
  - Fixed overlapping agent name tags; farther tags are lifted above nearer ones.
  - Fixed overlapping Possibility Engine branch labels; the fan turns toward the viewer.
- Machinery pass (2026-10-07):
  - Typecheck, lint, the 19 tests and the build pass.
  - Chrome at 1440×900 holds 60 FPS with reflections and bloom on.
  - 390×844 renders, but only the middle of the scene is in frame.
  - Previews: `station-detail-16s.png`, `station-detail-44s.png`, `station-detail-60s.png`, `station-mobile-10s.png`.
- Cyberpunk and faces pass (2026-10-07):
  - Typecheck, lint, 20 tests (one new) and the build pass.
  - Chrome at 1440×900 holds 60 FPS with four added point lights, reflections and bloom.
  - Portrait close-ups checked for Nova, Orion, Sage, Vex, Lume and Brix.
  - Previews: `cyber-handoff-16s.png`, `cyber-critic-44s.png`, `cyber-recommendation-60s.png`, `cyber-portrait-vex.png`, `cyber-portrait-sage.png`, `cyber-portrait-orion.png`.
- Rigged characters pass (2026-10-07):
  - Typecheck, lint with zero warnings, 20 tests and the build pass.
  - Chrome at 1440×900 holds 60 FPS with the six skinned models, reflections and bloom on.
  - Walking, working and critic close-ups checked; no tearing at the poses used in the story.
  - Large test rotations do tear: an arm raised about 1.1 rad with the elbow bent 0.9 rad smeared Brix's hand and tool. This is why the story's arm angles are scaled and clamped.
  - Previews: `rigged-handoff-16s.png`, `rigged-critic-44s.png`, `rigged-portrait-brix.png`, `rigged-portrait-vex.png`.
- Zone workstations pass (2026-10-07):
  - Typecheck, lint with zero warnings, 20 tests and the build pass.
  - Chrome at 1440×900 measured 58–60 FPS with the five station models added.
  - Close-ups checked at the console (Orion), the hologram (Sage) and the war table (Vex). Agents stand at each model's front.
  - Found and fixed: selection close-ups near a zone put the camera inside the model.
  - Previews: `stations-models.png`, `stations-handoff-16s.png`, `stations-critic-44s.png`, `stations-portrait-vex-risk.png`, `stations-portrait-sage-economics.png`.
- Plain-language HUD pass (2026-10-07):
  - Typecheck, lint with zero warnings, 20 tests and the build pass.
  - Chrome at 1440×900 measured 60 FPS.
  - Checked at 22 s, 26 s (budget question), 52 s, 60 s (answer), with "Show steps" open and an agent card selected, and at 390×844. On small screens, roles are hidden and the findings card spans the width.
  - The Next.js development badge overlaps the "Show steps" button in development only.
  - Previews: `plain-22s.png`, `plain-budget-26s.png`, `plain-52s.png`, `plain-answer-60s.png`, `plain-steps-orion.png`, `plain-mobile-22s.png`.
- Clear-world layout pass (2026-10-07):
  - Typecheck, lint with zero warnings, 20 tests and the build pass.
  - Checked at 1440×900 (26 s, 44 s, 60 s), 1024×768, 1920×1080, 390×844, and in a close-up with "Show steps" open.
  - No HUD card covers a character or station. Cards sit over walls, ceiling or empty floor.
  - On phones the world is small, because the deck's width limits the zoom.
  - Previews: `clear-1440-44s.png`, `clear-1440-budget-26s.png`, `clear-1440-answer-60s.png`, `clear-1024-44s.png`, `clear-1920-60s.png`, `clear-mobile-44s.png`.
- Phase 8 spatial modules pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 33 in 5 files, 13 of them new.
  - New tests cover:
    - layout: demo modules land within 1.1 units of the approved arc; 300 seeded crowded layouts with mixed size, emphasis and collapse never overlap and keep bays clear of the generators and the wall; capacity; adding a module moves only its neighborhood; crowding grows the radius before shrinking;
    - operations: the full status lifecycle, the gap closing after a dissolve, re-layout on emphasis and resize with size clamping, unknown and duplicate changes ignored, and agent work spots;
    - story: modules created only by the plan or the builder, every scripted module present in the catalog, agents only sent to existing modules, demo positions stable through the run, and every module dissolved before the loop.
  - Chrome at 1440×900 holds 60 FPS. `/lab` at 16 s, 44 s and 60 s matches the approved clear-world framing, and was also checked at 1024×768 and 390×844.
  - Checked in the `/dev/modules` sandbox at 60 FPS: the demo set; three modules added, so analysis crowds to 45% and research moves outward; then emphasize, collapse and remove, with the dissolve column and the neighbors re-spacing.
  - Found and fixed: bays behind crowded modules stayed full size and merged into one wall. Bays and arms now scale with crowding.
  - Previews: `modules-lab-44s.png`, `modules-lab-60s.png`, `modules-sandbox-demo.png`, `modules-sandbox-crowded.png`, `modules-sandbox-dissolve.png`, `modules-sandbox-after.png`.
- Phase 9 workspace state pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 50 in 7 files, 17 of them new.
  - Store tests: the seeded fixture validates; malformed seeds, patches and unknown ids are refused with no change; untouched records keep their identity; task lifecycle per agent; module reserve, open, update and remove; evidence provenance, duplicates and dangling references refused; the assumption order; the human-input request answered once; scenario range; finding lines ordered, with superseded and resolved items dropped.
  - Bridge tests: fixture agents match the rendered roster; no fixture fact is marked verified; the whole story applies with no rejected fact; a full run ends answered with a final recommendation, all six modules mirrored, the budget answered, the assumption rejected, a failed Orion task, and every agent with a task; the findings at the risk check and after the shift match the approved HUD line for line; runs are deterministic; the store resets on loop.
  - Chrome at 1440×900 at 16 s, 27 s (budget question), 44 s and 62 s (answer): unchanged from the Phase 8 screens, 60 FPS. Console shows only the known favicon 404 and three.js `Clock` notice.
- Phase 10 typed event system pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 67 in 8 files (9 new bus tests, 8 new event-driven world and store tests; the old bridge tests were ported).
  - Bus tests: stamping and order, malformed and unknown drafts rejected and not recorded, unknown fields stripped, type filters and unsubscribe, listener-published events delivered in one global order, a failing listener isolated, bounded history, a JSON round trip through validation, and the specification's catalog present.
  - World tests: all earlier story tests on the new session (order, every state, determinism over the full event history, budget pause with user and autoplay answers, stations, layout stability, dissolve, Core and scenarios, loop); no agent moves without an assignment and every arrival is reported; assign, move-started and arrival come in order with the right sources; the world acts out events with no runner (an unknown module kind, an unknown agent ignored).
  - Store tests: a full run with zero rejected events and zero listener errors validates; findings match the approved HUD line for line; the store's agent states equal the world's at every frame for 60 s; determinism and loop reset; events referencing unknown things are refused; the steps list uses only the current run's history.
  - Chrome at 1440×900 at 16 s, 27 s, 44 s and 62 s: unchanged from the approved screens, 60 FPS. Show steps, Confirm and Restart checked live. Console shows only the known favicon 404 and three.js `Clock` notice.
  - Previews: `events-handoff-16s.png`, `events-critic-44s.png`, `events-answer-62s.png`, `events-steps-budget.png`.
- Phase 11 MorphOperation pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 87 in 9 files (20 new operation and gate tests; store, bus, world and run tests ported to operations).
  - Operation tests: the specification's operations present; deterministic application leaving the input untouched; repeated ids; malformed, unknown, oversized and non-data input refused without throwing; extra fields (a script, a component) refused; markup kept as plain text; significant changes without a reason; dangling references; a model marking its own claim verified, supplying user evidence, setting the objective or answering for the user; module move, resize and emphasis steps; reserve then open and summary; the assumption lifecycle and protected evidence; recommendation citing superseded evidence or incomplete; scenario range; task assignment and camera focus; 2000 random proposals never corrupt the workspace.
  - Gate tests: accepted operations announced with their reference and reason; refusals announced and changing nothing; a forged user source overridden by the trusted channel; record events without an operation refused by the bus.
  - Run tests: a full run has zero refusals, more than 30 operation-backed events, zero bus rejections and a valid workspace; replaying only activity events leaves the record empty (the record changes only through operations); findings still match the approved HUD line for line; store and world agent states agree every frame; determinism and loop reset.
  - Chrome at 1440×900 at 16 s, 27 s, 44 s and 62 s: unchanged from the approved screens, 60 FPS. Show steps, Confirm and Restart checked live. Console shows only the known favicon 404 and three.js `Clock` notice.
  - `/dev/operations` checked live: as the AI model, all nine broken requests were refused with reasons (missing reason, unknown command, smuggled script, self-verified claim, posing as the user, answering for the user, missing station, repeated id, oversized), a pasted sentence was refused, and the user's own answer was accepted; the record and the world's station list changed only on acceptance.
  - Previews: `operations-checker.png`, `operations-lab-44s.png`.
- Phase 12 morphing engine pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 97 in 9 files (10 new).
  - Engine tests: a glide within a neighborhood; a carry stays on the ring and lifts above 3 units; scripted reshuffles never overlap grounded stations; interrupting a move mid-flight never jumps (each frame moves under 0.4 units); replacement takes the slot and evidence; a same-group move is ignored; a 120-round random reshuffle (add, remove, move, resize, emphasize, collapse, replace, at random moments) never overlaps grounded stations.
  - A temporary 600-seed version of that random test found 12 distinct overlap causes, all fixed (listed in the decisions above); the last was a replacement of a station still waiting for room growing too early. All 600 seeds pass; the temporary test was removed.
  - Operation, gate and world tests: replacement keeps the order slot, moves evidence, and refuses reserve-plus-replace, self-replacement, a missing station and an existing id; the gate announces `replaces`; the world reacts to replacement and morph events; an agent follows its moved station without entering the Core.
  - Chrome at 1440×900: `/lab` at 16 s, 27 s, 44 s and 62 s is unchanged from the approved screens, 60 FPS; Show steps, Confirm and Restart checked live; no favicon 404 any more.
  - `/dev/modules` checked live with each preset, a carry across neighborhoods, and calm mode; no console errors. Found and fixed: the sandbox camera cropped the decision neighborhood, so carried stations left the frame.
  - Previews: `morph-rebuild-start.png`, `morph-rebuild-mid.png`, `morph-rebuild-done.png`, `morph-carry.png`, `morph-calm.png`.
- Phase 19 real AI planner pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass (`/api/plan` is a dynamic route). Tests: 119 in 14 files (22 new).
  - Plan tests: a valid plan accepted; slips tidied (station named by title, a second task for one agent, unknown station, extra questions); refusals for too many decision stations, duplicate keys, unknown kinds, Nova given a task, extra fields, plain text; the converted operations all accepted by the gate as the planner, with MORPH's ids and the planner's reasons, and no evidence created.
  - Provider tests (fake fetch): strict JSON-schema request with model, token budget and key header; parsed reply and cost; key refused, rate limit, server error, unreadable reply, broken JSON, refusal, cut-off and empty answers, and network failure all give short reasons that never contain the key; timeout and cancellation.
  - Planner tests (fake provider): one-call success with the question quoted as data; one repair with the problems listed and usage summed; stop after two calls; provider failure passed through; the JSON schema's enums and limits match `PlanSchema`.
  - Route tests: success with `no-store`; bad JSON, too short, too long, extra fields and oversized bodies refused with zero model calls; per-client rate limit with `Retry-After` and zero model calls; 503 without a key; 502 with the planner's reason. Rate limiter window and server cap.
  - Live-run tests (fake requester): the question recorded as the user's; Nova arrives before planning starts; stations created only after the plan; three stations, one assumption, one pending question, cost recorded; assigned agents end waiting at their station spots, the unassigned one idle; Core waiting; zero refusals; a failed plan shows the error, opens nothing, and Nova returns and rests; a malformed plan is refused in the browser; "Back to demo" aborts the request and the demo plays again.
  - Key safety: the production build contains neither key, and browser bundles don't mention the OpenAI endpoint or the key variable. `.env.local` stays git-ignored.
  - Live checks against the real model: `/api/plan` returned a valid plan for a new question (bakery delivery apps) in about 6 s. In Chrome at 1440×900, 1024×768 and 390×844: ask, Nova planning, five stations rising, agents walking to them and waiting, assumptions and questions, the dev cost line (about USD 0.0007, 1 call), then "Back to demo"; 60 FPS, no console errors.
  - Found and fixed: long assumptions and the questions note were clipped in the info band (shorter limits, note moved into the title, at most 2 assumptions); the "Live AI" tag was squeezed by the toolbar (moved under the Core status); at 1024 px the question wrapped into the info band (clamped to two lines, smaller below 1280 px); on phones the header grew and hid the question (labels no longer wrap, the Live tag and cost line are hidden, a shorter "Waiting for research" status).
  - `/lab` demo at 16 s, 27 s, 44 s and 62 s: unchanged apart from the new "Ask a question" button, 60 FPS.
  - Previews: `live-ask.png`, `live-planning.png`, `live-plan-waiting.png`, `live-1024.png`, `live-mobile.png`, `live-demo-unchanged-44s.png`.
- Phase 13 deterministic demo runtime pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 126 in 16 files (7 new; all 119 earlier tests pass after the move). Production dependency audit: 0 vulnerabilities.
  - Runtime tests (`src/orchestration/run-controller.test.ts`), with a stand-in that reports walks and handoffs instead of the 3D world: the whole story plays to the final answer under 90 s with no world and no network (a stubbed `fetch` is never called), zero refusals, zero bus rejections or listener errors, no model provenance and zero cost; with nothing reporting arrivals the story holds at Nova's first walk instead of faking progress; the first 40 s are event-for-event identical at 30, 60 and 144 frames per second, at 2× speed and with irregular frames; a stalled frame counts at most 0.1 s; a restart and the automatic loop replay the identical story; every scripted story moment exists in the timeline; a live question with no planner fails plainly.
  - Chrome at 1440×900: `/lab` demo at 16 s, 27 s, 44 s and 62 s unchanged from the approved screens, 60 FPS, no console errors (only the three.js `Clock` notice). A live question through the new wiring: real plan, about USD 0.0006, agents waiting at their stations, 60 FPS, no errors. `/dev/modules`, `/dev/operations`, `/dev/models` and `/` load.
  - Previews: `runtime-demo-44s.png`, `runtime-demo-62s.png`, `runtime-live-15s.png`.
- Phase 14 agent orchestration pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass (`/api/agent-step` is a dynamic route). Tests: 148 in 20 files (22 new).
  - Scheduler tests: dependencies, two at a time, timeouts on the run clock that ignore late replies, a retry after its delay, no retry for a final failure, skipping once the attempt cap is reached, "any" dependencies, and cancellation.
  - Step tests: prompts carry the ground rules and quote the question; Vex can't name something that doesn't exist; the answer's basis is cut to real findings; extra or oversized fields are refused.
  - Route tests (fake provider): prompts are built from the server's record, never the browser's text; unreadable bodies, extra fields, unknown steps, unknown questions (404), steps out of order and tasks outside the plan are refused without a model call; one retry, then refused; a finished task can't be redone; the call limit and the spending limit stop the question, counting the plan; three parallel requests at 8 of 10 calls give exactly two calls; questions expire.
  - Live-run tests (fake server answering on the run clock): the full flow from research to review to tentative answer to everyone at home; never more than two calls or two working agents at once; all evidence is unverified model evidence; Vex's challenge is recorded; the answer cites the right findings; the question is answered; zero refusals. Also: a failure is visible before the retry; Vex is still sent to review when his own research finishes last; a limit stop shows the reason and sends everyone home; no review or answer when all research fails; "Back to demo" cancels work in flight.
  - Found and fixed in the live check: the late "done; waiting for the team" status stopped Vex's walk to the Core when his research finished last, so the review never started; the regression test above covers it. Also found by tests: a failed agent showed "waiting" in the same frame, so the failure was never visible.
  - Real model in Chrome at 1440×900 and 390×844: the bakery question ran to a tentative answer in about 30 s with 8 calls (plan, five research, review, answer) for about USD 0.0023; 60 FPS, no console errors. The production build contains neither key.
  - Previews: `live-work-review.png`, `live-work-answer.png`, `live-work-home.png`, `live-work-phone.png`.
- Phase 15 collaboration visuals pass (2026-10-07):
  - Typecheck, lint with zero warnings, and the build pass. Tests: 153 in 21 files (new and updated tests for the combine and re-check steps, the raised limits, and the new world visuals).
  - Route tests: combine, re-check and answer each run once; a re-check is refused when Vex doubted an assumption rather than a finding; a re-check that names a task is refused as malformed; retries stop at the new limit.
  - Live-run tests (fake server): findings travel to Sage as cards, Sage's card travels to Vex, and the answer comes after; when Vex doubts a finding, a flag card goes to that researcher, who walks back in the "retrying" travel state, and the revised finding replaces the old one, which is marked superseded; up to four agents work at once; with every task failing, each is tried three times.
  - World tests: every landed card makes a catch pulse; a failed task leaves a cracked card that is visible during the retry and clears on success; the demo's collaborating groups are exactly Sage with Vex and Lume with Nova; restarting clears everything.
  - Real model in Chrome at 1440×900: the bakery question ran to a tentative answer in about 28 s with 8 calls (plan, four research, combine, review, answer) for about USD 0.002; 59.5 FPS; no console errors. Vex doubted an assumption, so no re-check happened in that run (the re-check is covered by tests and seen in the demo's flag beat).
  - Demo checked in Chrome: Orion's handoff, the warning sign and cracked card on failure, the amber card while retrying, the Sage and Vex hologram at Costs, Vex's red flag card flying to Orion, and Nova and Lume's streams into the Core; 58–60 FPS. Phone width (390×844) works, though the new effects are small there, as is the rest of the world.
  - Found and fixed: the effects were too small to read (about doubled); the cracked card hid behind the agent (moved beside them); Sage showed "Teaming up" alone before Vex arrived (demo timing); the hologram at the Core was lost in its glow (streams now flow into the Core).
  - Reduced motion: the hologram stops spinning and bobbing, its data dots stand still, and the warning sign stops pulsing (in code; not checked in the browser).
  - Key safety: the production build contains neither key; `.env.local` stays git-ignored.
  - Previews: `p15-handoff-live.png`, `p15-brief-live.png`, `p15-failure.png`, `p15-retry.png`, `p15-collab-costs.png`, `p15-flag.png`, `p15-core.png`, `p15-phone.png`.
- Visual fixes applied during inspection: raised lighting, reduced Core bloom, enlarged characters (×1.35), moved the camera closer, repositioned zones and the Possibility Engine clear of HUD panels, compacted name tags and the roster, reshaped Vex's blade, and limited the budget card to 3 s after confirmation.
- Previews: `docs/previews/lab-handoff-15s.png`, `lab-human-input-27s.png`, `lab-critic-retry-44s.png`, `lab-possibility-51s.png`, `lab-recommendation-60s.png`, `lab-mobile-8s.png`; station: `station-handoff-15s.png`, `station-human-input-27s.png`, `station-recommendation-60s.png`, `station-1024-20s.png`.
- Not yet verified: Three.js memory over long sessions, and Safari/Firefox.

## Known Issues
- Characters use a local auto-rig with distance-based weights:
  - Gestures are deliberately small. Big poses (the "completed" arm raise, the "waiting" crossed arms) are toned down, so states read less strongly than with the old figures.
  - Coats don't simulate cloth; they bend with the legs.
  - No facial animation.
- The source FBX files live outside the repository (`~/Downloads/3d Model `, about 2–3 million triangles each). The conversion and rig scripts are now in `tools/models/`.
- At narrower widths (about 1024 px) the left roster panel covers part of the Market zone.
- Calm mode keeps agent walking and the Core's slow motion; only layout motion, camera easing and decorative drift stop.
- A carried station is small (half size) and seen from above in the default view, so the lift reads less strongly than in close views.
- Overlap-free motion is tested for random reshuffles; a pile-up of many interruptions within a fraction of a second has no guarantee beyond those tests.
- The OpenAI and Anthropic keys pasted in chat must be revoked and replaced in `.env.local`.
- Handoffs between agents standing close together (for example at the Core) are short, so the card's flight is brief.
- In a live run, a re-check happens only when Vex doubts a specific finding; often he doubts an assumption instead.
- The architecture audit after Phases 13–15 is due before the next phase's work.
- Live findings are the model's general knowledge, not research: there are no search or source tools yet (Phase 20). They are labelled and never verified. Nova's questions can't be answered yet (Phase 16), so the answer can't use them.
- Each question's record lives in one server process's memory: a restart, or a second server instance, forgets it, and the next step gets "this question has expired; ask it again" (shared storage would come with hosting, Phase 26).
- An agent with two tasks in one plan isn't possible (the planner tidies it away), so the scheduler doesn't handle one agent at two stations.
- Once answered, live mode stays on screen; "Back to demo" or a new question leaves it.
- Rate limits and the hourly cap are per server process and reset on restart; a multi-instance deployment needs a shared limit (Phase 26).
- Station panels in live mode show "Looking into it…" until that station's finding arrives.
- `/api/agent-step` has the same open `X-Forwarded-For` and content-type weaknesses as `/api/plan` (Phase 24); each question's own limits still cap a single question at USD 0.05.
- Plan quality depends on the model; it is a proposal for what to investigate, never evidence.
- Camera framing is tuned for 16:9 desktop; portrait mobile crops the outer zones.
- The 2D design-system page (`/dev/design-system`) is rejected and outdated; the lab HUD is the current 2D direction.
- Pause stays in the screen (it stops calling the run clock); speed is passed to the run clock. There is no seek or scrub control.
- The demo runtime still waits on the world's reports of arrivals and landed handoffs, so walking speed in the world sets story timing; headless runs need a stand-in reporter (as the tests use).
- The event history is capped at 1000 events per session (about three demo loops).
- `focus_camera` is recorded in the workspace and announced, but the camera doesn't follow it yet (camera direction is Phase 18).
- `appliedOperationIds` grows for the life of a run (about 45 per demo run); it resets with the workspace on each loop.
- Development-only npm audit entries in the eslint-config-next → braces chain remain (production audit clean). ESLint 9 is deprecated upstream but required by Next.js plugin peers.
- The default shell Node is v12; use `nvm use` (Node 24) before project scripts.
- The secondary specification lives outside the repository at `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md`.

## Audit 2026-10-07 (after Phases 3–7)
- High, fixed: the model conversion and rig scripts existed only in `/tmp`. They now live in `tools/models/` with their own exact-pinned `package.json`, isolated from the app's dependencies. Outputs default to git-ignored folders beside the scripts. Lint, typecheck and the 20 tests pass.
- High, fixed (user approved): the project had no version control. A local git repository was initialized with a baseline commit (`1b55b19`); nothing is pushed. Secrets stay out via `.env*` in `.gitignore`.
- Medium, scheduled: demo state and story (`src/visualization/world/sim`) live inside the visualization layer, and `src/state`/`src/orchestration` are empty. This is the planned prototype; Phases 9–13 move it into canonical state, events, operations and the demo runtime.
- Medium, fixed in Phase 8: zones were a hardcoded `ZoneId` union with fixed positions in `roster.ts`.
- Medium, open: (reduced motion fixed in Phase 12) about 17 MB of GLB models load with no progress indication.
- Low: unused identity fields (`face`, hair and prop) in `roster.ts`, the outdated `/dev/design-system` page, and the missing favicon. Left as is.
- No findings for secrets, provider leakage or arbitrary code execution: there are no providers or AI calls yet.

## Audit 2026-10-07 (after Phases 8–10)
- No Critical or High findings.
- Medium, scheduled: the prototype story runner (`sim/runner.ts`) and the story script are demo orchestration living in the visualization layer. They are isolated behind the bus, and Phase 13 moves them into `src/orchestration` as the demo runtime.
- Medium, fixed in Phase 11: events updated the store directly through `applyWorkspaceEvent`; record changes now go through validated `MorphOperation`s.
- Low: agent names exist in both `roster.ts` and the fixture (a test keeps them equal); the world casts scenario ids to the three demo keys; the module presentation registry sits in `sim/script.ts` next to the demo script. Left as is.
- Ownership: the world no longer reads story signals; the store no longer polls the world; the HUD reads facts from the store and narration from event history. Dependencies: none added in Phase 10. Performance: unchanged, 60 FPS. Safety: events are schema-validated with length limits, unknown fields are stripped, and summaries are fixed fixture text.

## Audit 2026-10-07 (after Phases 11, 12 and 19)
- No Critical or High findings.
- Medium, fixed in Phase 13: the demo runner, the live question runner and the plan client lived in the visualization layer; they are now in `src/orchestration`, and the visualization layer imports none of them (enforced by lint).
- Medium, fixed in Phase 13: live questions took their team from the demo fixture (`DEMO_AGENTS`); the team is now `src/state/team.ts`.
- Medium, open (for Phase 24, security): `/api/plan` trusts `X-Forwarded-For` for the per-client limit, so a caller can dodge that limit by faking the header; the hourly server cap (60 questions, about USD 0.05) still bounds spending. It also accepts any content type, so another website could make a visitor's browser send questions (same cap). Fix: rely on the host's client address and require JSON with a same-origin check.
- Low: a few `as AgentId` casts on event agent ids in the demo runtime (guarded by lookups); the outdated `/dev/design-system` page. Left as is.
- Dependencies: none added since Phase 9; production audit clean. Performance: unchanged, 60 FPS in demo and live. Secrets: the key stays server-side; browser bundles don't contain it. Demo leakage: the demo path makes no network or model calls (tested).

## Audit 2026-10-07 (after Phases 13–15)
- No Critical or High findings.
- Medium, open: `src/orchestration/live-question.ts` (about 530 lines) now holds planning, the work schedule, handoffs, arrivals and results for live questions. Ownership is clear and it is tested, but it is the place most likely to grow; split the result handling out if Phase 16 adds much more.
- Medium, open (for Phase 24, security): `/api/agent-step` shares `/api/plan`'s open `X-Forwarded-For` and content-type weaknesses. With the raised limits, one question is capped at USD 0.05, and the hourly server cap (60 questions) bounds the worst case at about USD 3 per hour per server process.
- Low: step results are cast to their type in `live-question.ts`; each reply is validated with Zod and checked to be for the step asked, so the casts are safe at runtime. A few guarded `as AgentId` casts remain in the demo runtime. Left as is.
- Boundaries: lint enforces that the visualization layer imports no orchestration, server or configuration code; the new Phase 15 visuals read only the world. Dependencies: none added since Phase 9; production audit clean. Performance: 58–60 FPS with the new effects; their geometry and materials are disposed on unmount. Secrets: neither key is in the production build. Demo leakage: the demo makes no network or model calls (tested).

## Deferred Decisions
- Live limits: decided 2026-10-07 in Phase 14, raised in Phase 15 (4 at once, 60 s, 2 retries, 30 calls, USD 0.05). Phase 18: camera style. Phase 20: search provider.
- AI provider/model: decided 2026-10-07 (delegated): OpenAI `gpt-5.6-luna`.
- Phase 23: quality presets (High/Balanced toggle exists). Phase 25: audio. Phase 26: hosting.

## Next Allowed Phase
Phase 16 — Human-in-loop controls, once the user authorizes it, preceded by the audit due after Phases 13–15.

## Last Updated
2026-10-07 (Asia/Dubai)
