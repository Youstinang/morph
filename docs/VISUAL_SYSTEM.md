# MORPH Visual System

## Scope

This document defines the spatial visual direction for the 3D world: chamber, Intent Core, agents, zones, artifacts, Possibility Engine, camera, and motion. The 2D token and primitive layer is documented in `docs/DESIGN_SYSTEM.md`. Exact geometry, materials, and choreography are finalized at each phase's visual quality gate.

## Principles

- The live agent world is the hero. Information layers support it and never dominate it (70% world, 20% information visualization, 10% traditional UI).
- Every visual action maps to a real state or event. No meaningless movement or decorative AI activity.
- Sophistication comes from lighting, composition, motion, particles, materials, camera, and spatial design, not polygon count.
- Near-black/graphite environment, cool restrained accents, one identity accent per agent, warm highlights reserved for warnings and critical discoveries. No rainbow UI, no excessive bloom, and not every object glows.
- Materials: dark metal, glass, subtle translucency, emissive accents, and a soft reflective floor/grid.
- Color is never the only state cue; text and motion carry meaning too. Reduced motion is respected throughout.

## Chamber

**User decision (2026-10-07): orbital command deck, "rich but readable".** This deliberately overrides the primary specification's "infinite intelligence chamber, not a literal building" line, at the user's request for a detailed futuristic environment with real-world components.

The deck (`scene/station.tsx`):
- A circular reflective deck with panel seams and a recessed Core dais.
- A curved back wall of structural ribs, a lower wall, light bands, a panoramic window and a header.
- A planet limb and a fixed starfield seen through the window.
- A front safety rail, wall consoles, archive towers, and one docking bay behind each zone.
- The centre stays clear for the agents; all the detail sits around the edges.

**Cyberpunk look (user direction, 2026-10-07).** The palette is neon cyan, magenta and amber, with violet (`NEON`), against blue-black and purple fog.
- Wall bands and rib strips alternate cyan and magenta, with amber accents.
- Colored point and directional lights rim-light the agents.
- The floor is wet and highly reflective, so the neon reflects in it.
- Hanging lamps are cyan and magenta, with faint additive light shafts.
- Neon signs on the ribs, plus a deck banner.
- A nebula sky, and a planet with colored city lights.
- Bloom: intensity 1.05, threshold 0.72.
- Agents' faces are painted, with irises that glow in each agent's eye color, so they read against the dark.

Second detail pass (`scene/station-machinery.tsx`): an overhead ring truss tied into the wall ribs, twelve hanging light bars, a cargo rail with a pod, a Core emitter, a service arm at each bay, wall conduits with junction boxes, and two power generators.

Decor is either static or driven by state:
- Each floor light-track from the Core to a zone lights up when the zone exists and brightens with its activity.
- Bay doors slide open when their zone materializes.
- Archive towers fill with the total evidence gathered.
- The cargo pod travels to whichever bay just received evidence and takes on that zone's color.
- The Core emitter's ring and beam follow the Core state.
- Each service arm stays folded until its zone exists, reaches in while the zone is being built, and moves gently while the zone is worked.
- Generator bands brighten with the number of agents actively working.

No offices, game maps, or decorative idle motion.

## Intent Core

The central iconic object with states dormant, listening, interpreting, planning, delegating, processing, uncertain, converging, completed, and error. Candidate techniques: nested geometry, particle coherence, orbital structures, controlled deformation, breathing motion, energy flow, and changing symmetry. It must not be a generic glowing ball, robot head, or brain. It contains visual behavior only and is driven externally by state.

## Agents — real-time 3D characters

**Direction (2026-10-06, user-provided):** the agents are the six stylized characters from the user's concept sheet (`docs/previews/agent-concept-sheet.jpg`), converted to real-time 3D. This replaces the earlier faceless-creature direction.

**Current implementation (2026-10-07):** each agent is a textured 3D model that the user generated from the concept art with Meshy image-to-3D. They are skinned locally and stored at `public/models/{id}.glb`.
- **Asset pipeline:** an offline script outside the repo produces each GLB. It normalizes the model to 1 unit tall, feet at the origin, facing +Z. It then simplifies to about 60,000 triangles, encodes a 2048 WebP color map and a 1024 WebP normal map, and compresses with meshopt (about 1.7–2.0 MB each, 11 MB total). drei's `useGLTF` decodes these formats with no extra dependencies.
- **Rigging:** a custom auto-rigger estimates 17 joints from the mesh shape: hips, spine, chest, neck and head; upper arm, forearm and hand on each side; thigh, shin and foot on each side. It weights vertices by distance to each bone, restricted by body region, smooths the weights, and keeps the strongest four per vertex.
- **Animation (`scene/agent-model.tsx`):** the existing state poses (`poses.ts`) and walk cycle drive the bones live in `useFrame`. Angles are scaled down (arms ×0.6, legs ×0.7) and the arm raise is clamped at 1 radian. Larger rotations tear coats and held props with distance-based weights.
- **Props:** each model carries its prop from the concept art. A point light in the agent's accent color sits on the right hand and brightens while the agent is working.
- **Kept as before:** smoothed facing, the selection ring, the route line, and rising from the floor at the start of the cycle.
- **Dev route:** `/dev/models` (development only) shows the lineup with a test motion. Add `?bones` to draw the skeleton, or `?only=<id>` to show one model.

| Character | Role | Look | Prop |
| --- | --- | --- | --- |
| Nova | Planner | Navy bob, long dark-brown coat, gold trim | Golden orb with orbit rings |
| Orion | Researcher | White spiky hair, long navy coat, backpack, blue trim | Holographic tablet |
| Sage | Analyst | Pink braid, short utility coat, green trim | Holographic bar chart |
| Brix | Builder | Topknot and beard, broad armored build, glowing orange backpack | Gauntlet |
| Vex | Critic | Hood with long red hair, long black coat, red trim | Crystal blade |
| Lume | Synthesizer | Indigo bun, ivory cape over violet robe, purple trim | Violet sphere |

The table above is the concept-sheet identity. The models now carry these looks in their textures, not as code-built parts.

Every agent supports these states, each with a distinct visual treatment:

| State | Visual treatment |
| --- | --- |
| idle | Subtle breathing/idle motion near its home position |
| assigned | Brief pulse; destination marker appears; route materializes |
| moving | Smooth locomotion along the route with a subtle trail |
| working | Target station activates; agent manipulates or scans an object; particles and progress visible |
| waiting | Settles in place; pending indicator |
| handoff | A data artifact physically leaves one agent, travels, and is received by another |
| collaborating | Two or more agents gather at one structure; streams converge into a shared temporary field |
| evaluating | Inspection posture; scanning of the artifact under review |
| blocked | Stops; task indicator changes; blocking reason available |
| failed | Activity halts; calm, clear failure marking; no explosions |
| retrying | Route/task reactivates; failed artifact marked; new attempt starts |
| completed | Artifact locks into the workspace |
| returning | Travels back toward the Core or home position |

Performance: models are preloaded and cloned with `SkeletonUtils`. The six skinned meshes total about 360,000 triangles, and all animation runs in `useFrame` without React re-renders. Measured 60 FPS at 1440×900 in Chrome on the development MacBook with reflections and bloom on.

## Adaptive analysis zones

Zones are distinct spatial machines that materialize, grow, shrink, gain or lose emphasis, and leave as relevance changes. They are not floating dashboard cards.

**Spatial modules and layout (Phase 8, user choice 2026-10-07: grouped neighborhoods).** Each work area is a configured module (`ModuleSpec`: id, title, neighborhood, workstation, surface, color), not a hardcoded zone. Modules can be created, reserved and then revealed, removed, emphasized, muted, collapsed, expanded and resized (`sim/modules.ts`). The demo's six modules and the story moments that open them live in `sim/script.ts` (`MODULE_CATALOG`, `MODULE_CHANGES`).

- **Neighborhoods** (`sim/layout.ts`), with bearings measured around the Core from straight back:
  - research, on the left and back (centre −34°, bounds −76° to 4°);
  - analysis, on the right and back (centre 56°, bounds 34° to 76°);
  - decision, in front on the right (centre 109°, bounds 108° to 140°).
  The names are generic, so any objective can use them.
- **Placement:** each neighborhood keeps its modules in creation order, centred on its anchor, at a preferred spacing. Adding or removing a module only moves its own neighborhood.
- **Crowding:** a crowded neighborhood first moves outward (up to radius 11.2 for research and analysis, 9.5 for decision), then shrinks its modules. Footprints never overlap, and bays stay clear of the generators and the wall.
- **Capacity:** four research, four analysis and three decision modules stay at a readable size (40% or more).
- **One rig per module** (`scene/zone.tsx`): station, panel, shards, scenario branches, plus its bay, service arm and Core light-track (`scene/module-fixtures.tsx`). The rig glides when the layout moves it.
- **Materializing and dissolving:** a module rises in a column of light and dissolves the same way. The gap closes only after the dissolve finishes. All modules dissolve before the story loops.
- **Agents follow:** agents working at a module walk to its new spot if it moves.
- **Camera:** the overview frames each neighborhood's arc plus any module pushed beyond it, and refits smoothly only when the framing actually changes.
- **Development sandbox:** `/dev/modules` (development only) exercises every operation on the real deck.

**Workstations (user direction, 2026-10-07):** each zone has a workstation model that matches its kind of work, so agents no longer all work at the same-looking station. The user generated the three models with Meshy. They are converted with the same offline pipeline as the agents (about 50,000 triangles and 2 MB each) and stored in `public/models/stations/`. They are wired up in `scene/zone-station.tsx`, and each module's `station` field picks one.

| Zone | Kind of work | Workstation |
| --- | --- | --- |
| Market Intelligence, Regulation | Research and source intake | Curved operator console |
| Competition, Risk | Strategy and stress-testing | Tactical war-room table with a terrain hologram |
| Economics | Modeling | Hologram pedestal |
| Possibility Engine | Scenario branching | Unchanged: its hex platform and branching structure |

- **Live data:** the zone's chart panel now floats above and behind the model, and evidence shards orbit over its top.
- **State cue:** each model's screens glow brighter while agents work at the zone. The baked texture is reused as an emissive map, with intensity 0.08 when idle and 0.32 at full activity. It follows zone activity, and each instance has its own materials.
- **Kept:** the zone's floor ring and the column of light when the zone appears.

## Transit, artifacts, and relationships

Agent movement must be readable: subtle paths, light traces, floor/grid activation, waypoints, and dynamic routes. Data artifacts (evidence shard, source packet, analysis cube, risk marker, assumption token, scenario fragment) have physical presence and can be carried, transmitted, combined, rejected, or stored.

## Possibility Engine

A dramatic spatial branching structure growing from the current state into scenarios (flagship: Direct Entry, Local Partnership, Delay Entry). Branches strengthen, weaken, recede, or become dominant as evidence and assumptions change. Values are labeled as model-generated assessments.

## Camera

A camera director supports overview, focus_core, follow_agent, focus_module, reveal_module, reveal_handoff, focus_collaboration, pull_back_for_morph, reveal_scenarios, focus_recommendation, and return_to_overview. Major events get camera attention; routine events do not. Movement is smooth, avoids motion sickness, and yields to user interaction. Reduced motion substitutes cuts or minimal moves. Style is decided at Phase 18.

Current selection close-up: the camera frames the agent from a front three-quarter view. When the agent is within 3.4 units of a zone, that view would sit inside the workstation model, so the camera frames the agent from the Core side at 0.9 rad off-axis instead.

## On-screen story and language (user direction, 2026-10-07)

The user said the data read too technically and the UI was too noisy, and chose the "guided story" layout, plain headlines on the zone panels, and a plain-language voice.

- **Voice.** Short plain sentences that say what was learned, not what the system is doing: "Vex pushes back: there's no proof big UAE companies buy within 6 months", not "Assumption flagged: 6-month enterprise sales cycle is unsupported". There are no internal terms on screen, such as module, synthesis, Possibility Engine or registry.
- **Where the text lives.**
  - Agent `task` strings in `sim/script.ts` are "-ing" phrases, so one string serves as a status line ("Checking…"), as narration ("Orion is checking…") and in the detail card.
  - Plain words for agent and Core states live in `copy.ts`.
  - Zone names are plain: Market demand, Competitors, Rules, Costs, Risks, Options.
- **Layout.**
  - **Top:** a plain status ("Team at work"), the question, and the controls.
  - **Left:** a one-row-per-agent list with name, role and a plain status. Clicking an agent opens a small card with what they do and what they're doing now.
  - **Bottom center:** one narration caption, showing the latest story beat. Beats are emitted milestones, the user's answers, failures, retries and handoffs, marked `beat` on the log entry.
  - **Right:** "What we know so far", up to four findings that build up as the story runs. Findings marked as doubts get an amber dot and conclusions a green dot. A finding is removed when a later one supersedes it; for example, the 6-month guess disappears once the 9–12 months finding is confirmed. Once options exist, a simple comparison appears in the same card, with no numbers, labeled "The team's judgment, not a probability".
  - **Bottom left:** the full step-by-step log, hidden behind "Show steps".
  - **Bottom right:** the answer, with a one-paragraph reason and its confidence.
- **Keeping the world clear (user direction, 2026-10-07):** text cards must never cover characters or stations. The HUD therefore reserves fixed lanes, and the camera frames the world inside the space that remains (`hud-layout.ts`, and `frameOverview` in `lab-scene.tsx`).
  - The camera finds the closest overview at which every zone footprint and top, the Core, and every agent home fall inside the free area. It then centers that footprint there using a projection view offset.
  - It refits on resize. Close-ups center the selected agent in the same free area.
  - **Bands, 901–1599 px:** an info band under the header holds the agent card, the findings in two columns with the option comparison beside them, and later the answer. The team list is a single row at the bottom, with the narration strip just above it. The world gets the full width.
  - **Columns, 1600 px and up:** the team list on the left; agent card, findings and answer on the right; narration centered between them.
  - **Compact, 900 px and below:** the latest finding (or the answer) under the header; team list and narration at the bottom.
  - The budget question is a one-row strip in place of the narration.
  - The open "Show steps" list is the only card allowed over the world, because the viewer opens it on purpose.
- **Floating name tags:** name plus a plain status only. Resting states use a neutral color, so an agent's accent doesn't read as an alarm.
- **Zone panels:** these show the zone name and the latest plain headline from `ZONE_HEADLINES` (for example, "Data must stay in the UAE / Needs local hosting or a local partner"). Before anything is found they show "Looking into it…". A panel is redrawn only when its headline changes. The decorative charts were removed.
- **Data source:** findings, headlines and captions come only from signals the story actually emits, so every line on screen corresponds to a real event.

## Audio (optional)

Subtle cues for Core activation, dispatch, movement, transfer, materialization, challenge, scenario shift, and convergence, with a mute toggle. Audio never carries essential information. Inclusion is decided at a later phase.

## Quality presets

High, Balanced, and Performance presets may be introduced if needed. The premium default must not be degraded unnecessarily.
