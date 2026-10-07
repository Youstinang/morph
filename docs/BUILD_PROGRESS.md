# MORPH Build Progress

## Current Phase
Phase 9 — Workspace domain state (authorized 2026-10-07: "go ahead"); complete

## Status
Complete — Phase 9 is validated (it has no visual checkpoint; the screen is intentionally unchanged). The user visually approved Phase 8 on 2026-10-07. Phases 3–7 were approved on 2026-10-07 after the clear-world pass; the post-phase architecture audit was done (see Audit 2026-10-07).

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
  - `ModuleChange` is the prototype precursor of `MorphOperation`. Phase 11 replaces it with Zod-validated operations through `applyMorphOperation`.
  - The demo story and timing are unchanged. Its later modules are reserved when the discovery fires, so they open in their final spots.
- 2026-10-07, Phase 9: the user delegated the store choice ("use your recommendation"), so **Zustand 5.0.15** was added (exact-pinned; small, no providers needed outside React, works with React 19.3; production audit clean). The user chose the **split** boundary: the store holds the facts, and the 3D world keeps motion (positions, routes, timing).
  - `src/state/domain.ts`: Zod schemas and types for the workspace — objective, agents (13 states), tasks, modules, evidence with source provenance, assumptions, scenarios (model-generated assessments 0–1, not probabilities), recommendation, human-input requests, tool calls and cost. Fixture sources are marked unverified; only the user's own answer counts as verified.
  - `src/state/store.ts`: `createWorkspaceStore` (vanilla Zustand). Every action validates its input, refuses unknown ids, dangling references and out-of-order changes (for example, resolving an assumption that was never challenged), returns whether it applied, and updates immutably so untouched records keep their identity.
  - `src/state/selectors.ts` (including `findingLines`, which replaces the old `currentFindings`) and `src/state/react.tsx` (`WorkspaceProvider`, `useWorkspace` with shallow comparison).
  - `src/state/fixtures/uae-market.ts`: the demo's objective, agents, modules, text and `UAE_STORY` (facts keyed by story signal). `src/state/story.ts`: `StoryFact` and `applyStoryFact`, the precursor of Phase 11's operations.
  - `src/visualization/world/workspace-sync.ts`: a temporary bridge that mirrors the prototype world into the store at the HUD's rate (time, modules, agents, tasks, story facts, scenarios) and resets it when the story loops. Phase 13's demo runtime replaces it.
  - The HUD now reads objective, agents, findings, scenarios, the budget question and the answer from the store. `FINDINGS`, `currentFindings` and the HUD snapshot's copies of agent and finding data were removed. The 3D scene still reads the world (motion and module visuals), as intended until Phases 10–13.
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
- Visual fixes applied during inspection: raised lighting, reduced Core bloom, enlarged characters (×1.35), moved the camera closer, repositioned zones and the Possibility Engine clear of HUD panels, compacted name tags and the roster, reshaped Vex's blade, and limited the budget card to 3 s after confirmation.
- Previews: `docs/previews/lab-handoff-15s.png`, `lab-human-input-27s.png`, `lab-critic-retry-44s.png`, `lab-possibility-51s.png`, `lab-recommendation-60s.png`, `lab-mobile-8s.png`; station: `station-handoff-15s.png`, `station-human-input-27s.png`, `station-recommendation-60s.png`, `station-1024-20s.png`.
- Not yet verified: reduced-motion behavior for the 3D scene (no 3D reduced-motion handling yet), Three.js memory over long sessions, and Safari/Firefox.

## Known Issues
- Characters use a local auto-rig with distance-based weights:
  - Gestures are deliberately small. Big poses (the "completed" arm raise, the "waiting" crossed arms) are toned down, so states read less strongly than with the old figures.
  - Coats don't simulate cloth; they bend with the legs.
  - No facial animation.
- The source FBX files live outside the repository (`~/Downloads/3d Model `, about 2–3 million triangles each). The conversion and rig scripts are now in `tools/models/`.
- At narrower widths (about 1024 px) the left roster panel covers part of the Market zone.
- The 3D scene has no reduced-motion mode yet (camera easing and agent animation always run).
- Camera framing is tuned for 16:9 desktop; portrait mobile crops the outer zones.
- The 2D design-system page (`/dev/design-system`) is rejected and outdated; the lab HUD is the current 2D direction.
- No favicon (404 in console).
- Phase 9 bridge: until Phase 13 the store is fed from the prototype world, so the story's facts live in the fixture while its timing still lives in `sim/script.ts`. The HUD's controls (pause, speed, confirm) still act on the world, not the store.
- Development-only npm audit entries in the eslint-config-next → braces chain remain (production audit clean). ESLint 9 is deprecated upstream but required by Next.js plugin peers.
- The default shell Node is v12; use `nvm use` (Node 24) before project scripts.
- The secondary specification lives outside the repository at `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md`.

## Audit 2026-10-07 (after Phases 3–7)
- High, fixed: the model conversion and rig scripts existed only in `/tmp`. They now live in `tools/models/` with their own exact-pinned `package.json`, isolated from the app's dependencies. Outputs default to git-ignored folders beside the scripts. Lint, typecheck and the 20 tests pass.
- High, fixed (user approved): the project had no version control. A local git repository was initialized with a baseline commit (`1b55b19`); nothing is pushed. Secrets stay out via `.env*` in `.gitignore`.
- Medium, scheduled: demo state and story (`src/visualization/world/sim`) live inside the visualization layer, and `src/state`/`src/orchestration` are empty. This is the planned prototype; Phases 9–13 move it into canonical state, events, operations and the demo runtime.
- Medium, fixed in Phase 8: zones were a hardcoded `ZoneId` union with fixed positions in `roster.ts`.
- Medium, open: no reduced-motion handling in the 3D scene; about 17 MB of GLB models load with no progress indication.
- Low: unused identity fields (`face`, hair and prop) in `roster.ts`, the outdated `/dev/design-system` page, and the missing favicon. Left as is.
- No findings for secrets, provider leakage or arbitrary code execution: there are no providers or AI calls yet.

## Deferred Decisions
- Phases 10–11: event and operation contracts.
- Phase 14: concurrency, timeout, retry, and spend limits. Phase 18: camera style. Phase 19: AI provider/model. Phase 20: search provider.
- Phase 23: quality presets (High/Balanced toggle exists). Phase 25: audio. Phase 26: hosting.

## Next Allowed Phase
Phase 10 — Typed events and the event log, once the user authorizes it. It starts with the event-contract decision gate. Phase 10 is not authorized yet. An architecture audit is due after Phase 10 or 11 (last one after Phase 7).

## Last Updated
2026-10-07 (Asia/Dubai)
