# MORPH Repository Rules

## Authority and phase discipline

- `docs/MASTER_PROMPT.md` is the primary specification and decision authority (adopted 2026-10-06). `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md` is secondary: it governs only where the primary specification is silent (decision-gate procedure, safety, engineering, validation, progress format). Where they conflict, the primary specification wins. Read both completely at the beginning of every phase; these repository documents summarize them and do not replace them.
- Read this file, `docs/BUILD_PROGRESS.md`, and relevant current code before stating a short plan for the current phase only.
- Phases follow the primary specification's 26-phase order (Section 35). The phase map in `docs/BUILD_PROGRESS.md` records how earlier completed work maps onto it.
- Implement one authorized phase, validate it, repair meaningful failures, update progress, and stop. Do not combine, skip, or automatically advance phases.
- Advance only after the user explicitly authorizes the next MORPH phase. Check the next allowed phase in progress first.

## Mandatory decision gates

- Do not silently choose material product, visual, UX, agent-representation, camera, layout-metaphor, architecture, technology, scope, demo-story, state/event/protocol, provider/model, service, or quality/cost/performance trade-offs. If uncertain whether a choice is material, ask.
- Before implementing an unresolved material choice, explain the decision and why it matters; present 2–4 reasonable options with pros, cons, and what each would change; recommend an option; then STOP until the user explicitly chooses.
- If a decision arises mid-phase, summarize progress and pause at that point. Do not treat a recommendation as approval.
- Decide routine names, helper structure, formatting, test organization, and implementation details under an approved architecture independently.
- Visual approval checkpoints (run the app, inspect visually, fix anything cheap, then ask the user to approve, revise, or compare alternatives) are required for Phases 3, 4, 5, 6, 7, 8, 12, 15, 17, 18, 22, 25, and 26.
- On 2026-10-06 the user authorized a combined world slice (Phases 4–7 as a first version) in `/lab`. Each of those phases still needs its own visual approval before it is marked Complete.

## Product and visuals

- MORPH is a living spatial agentic intelligence environment that reshapes around the objective while visible agents actively work inside it. The live agent world is the main visual attraction; the viewer must be able to watch intelligence working without reading logs.
- Agents are real-time 3D stylized characters based on the user's concept sheet (`docs/previews/agent-concept-sheet.jpg`): Nova (Planner), Orion (Researcher), Sage (Analyst), Brix (Builder), Vex (Critic), Lume (Synthesizer). Each has a distinct silhouette, identity accent, signature prop, readable locomotion, and a visible relationship to the module or artifact it is working on. They support all 13 agent states in the primary specification.
- Avoid cute mascots, chibi/pixel art, cartoon office workers, Roblox-like avatars, generic glowing circles, 2D node boxes pretending to be agents, literal offices/rooms, robot/brain imagery, template dashboards, rainbow UI, and particle soup.
- User direction (2026-10-07): the world is an orbital command deck with a cyberpunk look: neon cyan, magenta and amber light, a wet reflective floor, neon signage, and a nebula. This overrides the earlier "no excessive neon" and "not a literal building" guidance. Keep the agents and their work as the focal point, and don't let decorative glow overwhelm state cues. Agents have painted faces with glowing irises in their eye color.
- Preserve the Intent Core, adaptive analysis zones, agent transit space, physical data artifacts, trusted spatial human input controls, and the Possibility Engine.
- Every visual action, including agent movement, must correspond to real state or events. No meaningless movement. Respect accessibility, responsiveness, reduced motion, and rendering performance.
- Scenario scores are model-generated assessments, never scientific probabilities or objective predictions.

## Engineering and safety

- Separate visualization, canonical state, orchestration, AI providers, tools, and observability. The 3D scene renders state; it never becomes the business state. Keep provider details out of the visual layer.
- Use strict TypeScript and Zod runtime validation at AI/tool boundaries. Validate constrained `MorphOperation` declarations through `applyMorphOperation`; render only trusted registered components; never execute arbitrary AI-generated code or HTML.
- Keep state transitions deterministic. REAL and DEMO modes share workspace, operation, and event architecture; DEMO uses deterministic fixtures and a scripted timeline and works without internet, LLMs, search, a database, or external services.
- Use replaceable provider/tool adapters, server-side secrets, provenance-bearing evidence, graceful failures, timeouts, cancellation, bounded concurrency/retries/loops, model-call caps, and cost tracking.
- Expose concise outcome-level explanations and evidence references, never private chain-of-thought. Do not treat unsourced AI statements as verified evidence.
- Evaluate dependencies before installation and obtain approval for unresolved material choices. Avoid Kubernetes, Kafka, Redis, microservices, external queues, multiple databases, and complicated infrastructure absent an approved need.

## Validation and progress

- Validate what the current phase implements; files existing alone do not establish completion. Record checks honestly, including checks that are not applicable or cannot run.
- Later phases require typecheck, lint, unit/integration tests, build, and runtime checks; visual phases also inspect layout, resource disposal, responsiveness, reduced motion, and performance (target 60 FPS, graceful ~30 FPS fallback).
- Maintain the progress format, including decisions, known issues, deferred decisions, validation, and next allowed phase.
- After approximately every 3–4 completed phases, audit architecture drift, duplication, ownership, type safety, dependencies, performance, and demo leakage. Rank findings Critical/High/Medium/Low; fix Critical/High within authorized scope and decision gates, and avoid refactoring for taste.
