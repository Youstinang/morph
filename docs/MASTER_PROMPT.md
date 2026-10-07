# MORPH — MASTER CURSOR BUILD PROMPT

You are acting as the **senior staff engineer, AI systems architect, interaction designer, motion designer, and technical art director** for a showcase project called **MORPH**.

You must build this project as a polished, credible, low-cost, production-minded demo that can be shown publicly on LinkedIn and at AI events.

The single most important requirement is:

> **The agents must be visibly alive.**
>
> The viewer should be able to WATCH agents receive work, move through the environment, investigate, hand off evidence, collaborate, wait, fail, retry, challenge each other, update the workspace, and converge on an answer in real time.
>
> The live behavior of the agents is the main visual attraction of MORPH.
>
> The application must feel like watching an intelligent system physically operate, not like looking at a normal dashboard with an AI chat box.

This is not an “AI office with cartoon employees.”
It must look dramatically more premium, cinematic, spatial, and futuristic.

---

# 1. PRODUCT VISION

MORPH is:

> **A living spatial agentic intelligence environment whose interface builds and reshapes itself around the user’s objective while visible agents actively work inside it.**

Traditional software works like this:

```text
Developer chooses interface
        ↓
User learns interface
        ↓
User forces task into interface
```

MORPH works like this:

```text
User states objective
        ↓
MORPH interprets objective
        ↓
Planner decomposes the problem
        ↓
Agents receive tasks
        ↓
Agents visibly move and work
        ↓
Evidence enters the environment
        ↓
The workspace creates the modules it needs
        ↓
Agents challenge / hand off / retry
        ↓
User changes assumptions
        ↓
The world restructures itself
        ↓
Scenarios are evaluated
        ↓
MORPH converges on a recommendation
```

The interface is not fixed.

The agents are not decorative.

The world itself changes because the problem changes.

---

# 2. PRIMARY DEMO GOAL

This is primarily a **high-end technical showcase**.

The target reaction is:

> “Wait… the agents are actually working live inside that environment?”

and then:

> “How is this a side project?”

The demo must be understandable in roughly **35–60 seconds** without requiring a long explanation.

The viewer should immediately see:

1. a goal is submitted,
2. agents wake up,
3. tasks are distributed,
4. agents physically move to relevant areas,
5. information begins flowing,
6. new modules materialize,
7. agents collaborate and challenge each other,
8. a user assumption changes,
9. the environment reorganizes,
10. scenarios update,
11. the system converges on a recommendation.

---

# 3. NON-NEGOTIABLE VISUAL PRIORITY

The most visually important layer is:

## THE LIVE AGENT WORLD

Agents must be visible entities in the spatial environment.

They should not only appear in a sidebar.

Each agent should have:

- a visible avatar/entity,
- a name,
- a role,
- a current task,
- a current state,
- a destination,
- a visual activity,
- progress,
- confidence,
- a visible relationship to the data or module it is working on.

Agents should visibly:

- spawn / wake,
- receive a task,
- leave the central area,
- travel toward the module they need,
- begin “working,”
- create or collect data artifacts,
- carry or transmit those artifacts,
- hand work to another agent,
- join another agent for collaboration,
- stop and wait,
- show blocked state,
- fail gracefully,
- retry,
- return to the core,
- participate in final synthesis.

The viewer should understand what the system is doing **without reading logs**.

---

# 4. HOW AGENTS SHOULD LOOK

Do NOT use:

- anime characters,
- pixel art,
- cute office workers,
- cartoon mascots,
- Roblox-like avatars,
- low-quality low-poly humans,
- generic glowing circles only,
- 2D node boxes pretending to be agents.

Preferred visual direction:

- sleek faceless digital entities,
- premium abstract humanoid / drone-like forms,
- subtle individual color signatures,
- soft emissive accents,
- clear silhouettes,
- elegant movement trails,
- high-quality idle / movement / work states,
- minimal floating labels.

Agents can be stylized enough to avoid expensive realism.

They do not need detailed faces.

Their identity comes from:

- silhouette,
- accent,
- icon,
- behavior,
- motion,
- role.

### Agent examples

**Planner**
- calm, central, precise
- geometric crown/orbit motif
- stays near Intent Core
- dispatches tasks

**Researcher**
- fast movement
- scanning particles
- interacts with evidence portals / source nodes

**Analyst**
- spends time near structured data modules
- transforms raw data artifacts into clean information structures

**Critic**
- sharper visual language
- scanning beams / red-orange inspection lines
- can reject evidence or assumptions

**Strategist**
- combines multiple streams
- works near synthesis / decision area

**Simulator**
- interacts with possibility branches and scenario structures

---

# 5. AGENT STATES AND VISUAL BEHAVIOR

Every agent must support these states:

```text
idle
assigned
moving
working
waiting
handoff
collaborating
evaluating
blocked
failed
retrying
completed
returning
```

Each state must have a visual representation.

Examples:

### assigned
- brief pulse
- destination marker appears
- route materializes

### moving
- agent travels smoothly through the environment
- subtle trail
- camera may gently acknowledge important movement

### working
- station/module activates
- agent interacts with a visual object
- particles / data fragments / scanning effects appear
- progress is visible

### handoff
- a data artifact physically leaves Agent A
- travels to Agent B
- Agent B visibly receives it
- event log records the handoff

### collaborating
- two or more agents gather around the same active structure
- their data streams converge
- a shared temporary visual field appears

### blocked
- agent stops
- task indicator changes
- blocking reason is available
- orchestrator may reroute work

### failed
- activity halts
- failure is visible but not melodramatic
- no fake explosions

### retrying
- route / task reactivates
- previous failed artifact is marked
- new attempt begins

### completed
- artifact locks into workspace
- agent returns to idle or receives another task

Every visual action must correspond to a real state/event.

No meaningless movement.

---

# 6. WORLD DESIGN

MORPH should feel like an **infinite intelligence chamber**, not a literal building.

The world should consist of:

## A. Intent Core

The central intelligence object.

It is visually iconic.

It should have states such as:

```text
dormant
listening
interpreting
planning
delegating
processing
uncertain
converging
completed
error
```

The Core should feel alive.

Do not use a generic glowing ball.

Consider:

- nested geometry,
- particle coherence,
- orbital structures,
- controlled deformation,
- breathing motion,
- dynamic energy flow,
- changing symmetry.

## B. Adaptive Analysis Zones

Zones materialize according to what the task requires.

Examples:

- Market Intelligence
- Competition
- Regulation
- Economics
- Risk
- Evidence
- Strategy
- Simulation
- Decision

They should not look like dashboard cards floating in 3D.

They should feel like distinct spatial machines / intelligence structures.

## C. Agent Transit Space

Agents need clear, beautiful movement through the environment.

Movement should be readable.

Use:

- subtle paths,
- light traces,
- floor/grid activation,
- waypoint systems,
- dynamic routes.

## D. Data Artifacts

Information should have a physical presence.

Examples:

- evidence shard,
- source packet,
- analysis cube,
- risk marker,
- assumption token,
- scenario fragment.

Agents can carry, transmit, combine, reject, or store these artifacts.

## E. Possibility Engine

A visually dramatic area that displays alternative scenarios as spatial branches.

Example:

```text
                      CURRENT STATE
                           |
              +------------+------------+
              |            |            |
         DIRECT ENTRY   PARTNERSHIP     WAIT
              |            |            |
           evidence       evidence      evidence
              |            |            |
            risks          risks         risks
```

In the real UI these should appear as branching spatial structures, not plain boxes.

---

# 7. THE WORLD MUST MORPH

The layout is not fixed.

Example initial objective:

> “Should a European AI software company enter the UAE market?”

MORPH may create:

- Market Intelligence
- Competition
- Regulation
- Economics
- Risk
- Strategy.

Later the user says:

> “What if we acquire a local competitor instead?”

The environment should visibly transform.

Possible behavior:

- market zone stays because it is still relevant,
- direct-entry strategy shrinks,
- acquisition targets emerge,
- valuation module rises,
- synergy analysis appears,
- integration risk appears,
- agents receive new work,
- agents physically move to new zones,
- data is reused where appropriate.

This transformation should be one of the “wow” moments.

---

# 8. MAIN FLAGSHIP DEMO

Use this deterministic showcase scenario:

> **Should a European AI software company enter the UAE market?**

The final showcase should follow this narrative.

### Scene 1 — Objective

Minimal scene.

The Intent Core is dormant.

User enters:

> “Should a European AI software company enter the UAE market?”

Core wakes.

### Scene 2 — Interpretation

Planner activates.

The Core changes into planning state.

Planner receives the objective.

A small number of analytical zones begin forming.

### Scene 3 — Delegation

Planner dispatches:

- Researcher → Market
- Researcher → Regulation
- Analyst → Competition

Agents visibly start moving.

This must be beautiful.

### Scene 4 — Live Work

Researcher enters Market zone.

Source/evidence objects begin appearing.

Agent scans/collects them.

Analyst starts processing competition data.

Regulation research happens separately.

Agent progress and real tasks are visible.

### Scene 5 — Handoffs

Researcher completes a data package.

A physical information artifact travels:

Researcher → Analyst.

Analyst receives it.

Analyst transforms it into structured insight.

### Scene 6 — New Discovery

Evidence reveals that budget and enterprise sales cycle are critical.

MORPH creates:

- Economics
- Risk

The world reorganizes.

Agents visibly reroute.

### Scene 7 — Human Input

MORPH needs a launch budget.

Instead of asking only in chat, a beautiful spatial control appears:

```text
Maximum launch budget?
USD 500,000
```

User confirms.

### Scene 8 — Critic

Critic receives the current analysis.

Critic moves to the relevant area.

Critic challenges an assumption.

Visual rejection:

- assumption artifact gets flagged,
- Critic sends a retry request,
- Researcher receives it,
- Researcher goes back to work.

### Scene 9 — Possibility Engine

Simulator activates.

Three branches emerge:

- Direct Entry
- Local Partnership
- Delay Entry

Agents feed evidence into branches.

Branches change weight/emphasis as evidence arrives.

### Scene 10 — Decision Shift

With budget = 500k:

Direct Entry weakens.

Local Partnership becomes strongest.

The spatial structure visibly changes.

### Scene 11 — Synthesis

Strategist and Planner converge near the Intent Core.

Their information streams combine.

Core enters converging state.

### Scene 12 — Recommendation

Final recommendation appears:

**Local Partnership First**

Include:

- concise rationale,
- supporting evidence,
- main risks,
- confidence / uncertainty,
- next suggested actions.

Agents settle.

Core enters completed state.

---

# 9. LIVE AGENT DETAIL PANEL

The world is the hero, but a clean information layer should provide depth.

When the user selects an agent, show a compact panel with:

```text
Agent: Researcher
State: Working
Current task: Analyze UAE enterprise AI demand
Progress: 63%
Current tool: Web Search
Sources reviewed: 8
Evidence accepted: 5
Evidence rejected: 1
Elapsed: 12.4s
Estimated cost: $0.01
Confidence: Medium/High
```

Do not show private chain-of-thought.

Show only concise, user-safe:

- task,
- action,
- status,
- evidence,
- rationale summary,
- tool use,
- metrics.

---

# 10. EVENT-DRIVEN VISUAL SYSTEM

The visual world must be driven by application events.

Create a typed event system.

Examples:

```text
objective_received
planning_started
plan_created
agent_created
agent_assigned
agent_move_started
agent_arrived
agent_work_started
tool_started
tool_completed
evidence_discovered
evidence_rejected
evidence_accepted
artifact_created
artifact_handoff_started
artifact_handoff_completed
assumption_created
assumption_challenged
retry_requested
retry_started
agent_collaboration_started
agent_collaboration_ended
module_created
module_emphasized
module_removed
workspace_morph_started
workspace_morph_completed
human_input_requested
human_input_received
scenario_created
scenario_updated
recommendation_updated
synthesis_started
synthesis_completed
```

The world should subscribe to these events.

Examples:

`agent_move_started`
→ agent begins travel animation.

`artifact_handoff_started`
→ physical data artifact travels between agents.

`module_created`
→ structure materializes.

`assumption_challenged`
→ Critic visual effect.

`workspace_morph_started`
→ camera pulls back and layout begins restructuring.

This architecture is essential.

---

# 11. CANONICAL DOMAIN MODEL

Create strongly typed models using TypeScript + Zod.

At minimum:

```text
Objective
Workspace
WorkspaceModule
Agent
AgentRole
AgentState
AgentTask
ToolCall
Evidence
EvidenceArtifact
Assumption
Scenario
Recommendation
MorphOperation
WorkspaceEvent
HumanInputRequest
CostUsage
DemoTimelineEvent
```

The canonical state must be separate from visual components.

The 3D scene renders state.

The scene must not become the business state.

---

# 12. GENERATIVE UI PROTOCOL

The AI must NEVER directly generate arbitrary React, HTML, or JavaScript.

AI may propose structured operations.

Example:

```json
{
  "operation": "add_module",
  "module": {
    "id": "risk-analysis",
    "type": "risk",
    "title": "Risk"
  },
  "reason": "Budget constraints make execution risk material."
}
```

Support operations such as:

```text
add_module
remove_module
update_module
move_module
resize_module
emphasize_module
deemphasize_module
add_evidence
remove_evidence
add_assumption
update_assumption
challenge_assumption
add_scenario
update_scenario
update_recommendation
request_human_input
assign_agent
focus_camera
```

Every operation must:

- have a schema,
- be validated,
- have an ID,
- contain provenance/source,
- be safe to reject,
- be deterministic when applied.

Create:

```text
applyMorphOperation(workspace, operation)
```

Do not allow malformed AI output to corrupt the world.

---

# 13. AGENT ORCHESTRATION

Implement a lightweight orchestration system.

Do not over-engineer.

Logical roles:

```text
Planner
Researcher
Analyst
Critic
Strategist
Simulator
```

Agents are logical roles, not necessarily separate expensive LLMs.

Support:

- task dependencies,
- parallel tasks,
- bounded concurrency,
- task timeout,
- cancellation,
- retry limits,
- agent handoff,
- agent collaboration,
- failed tasks,
- evaluation,
- synthesis.

The orchestrator must publish events.

Example:

```text
Planner assigns task
        ↓
agent_assigned
        ↓
world animates assignment
        ↓
agent_move_started
        ↓
agent travels
        ↓
agent_arrived
        ↓
agent_work_started
        ↓
tool_started
        ↓
tool_completed
        ↓
evidence_discovered
```

This is how the visual world stays honest.

---

# 14. REAL MODE VS DEMO MODE

Build two modes.

## DEMO MODE

This is critical.

The LinkedIn showcase must work without:

- internet,
- live LLM,
- search provider,
- database,
- external services.

Use deterministic fixtures and a scripted event timeline.

However:

> Demo mode must use the SAME event/state architecture as real mode.

Do not make a fake animation-only demo.

Use realistic fixtures for:

- evidence,
- agent tasks,
- handoffs,
- retries,
- scenario updates,
- recommendations.

Demo should be replayable and deterministic.

## REAL MODE

Optional but working.

Uses real AI/tool calls.

Real mode should use provider abstractions.

---

# 15. AI PROVIDER LAYER

Do not tightly couple the project to one model vendor.

Create provider interfaces for:

- structured generation,
- text generation,
- streaming if needed.

The main AI jobs:

### Objective Planner
Input:
- user objective

Output:
- interpreted objective,
- decomposition,
- modules needed,
- tasks,
- agent assignments,
- important questions,
- assumptions.

### Research Synthesizer
Turns tool results into evidence.

### Critic
Challenges weak assumptions/evidence.

### Strategist
Creates decision-level synthesis.

### Scenario Evaluator
Evaluates scenario implications.

All structured outputs must be runtime validated.

Secrets remain server-side.

---

# 16. TOOL SYSTEM

Create a generic Tool interface.

Possible initial tools:

```text
webSearch
calculator
structuredCompare
```

Each tool must define:

- name,
- description,
- input schema,
- output schema,
- execute.

Evidence must preserve provenance.

Do not silently convert unsourced model text into verified facts.

---

# 17. HUMAN-IN-THE-LOOP CONTROLS

Agents can pause to request user input.

Supported controls:

```text
text
number
currency
percentage
slider
single-choice
multi-choice
confirmation
```

Example schema:

```json
{
  "type": "currency",
  "question": "Maximum launch budget?",
  "variable": "launchBudget",
  "currency": "USD",
  "min": 0,
  "max": 5000000
}
```

User input updates workspace assumptions.

Orchestration resumes.

The visual world should react.

---

# 18. EXPLAINABILITY

Add:

## WHY DID MORPH CHANGE?

When the workspace changes significantly, record:

- reason,
- triggering evidence,
- triggering assumption,
- responsible agent,
- operation.

Example:

> “Enterprise procurement cycles became a major constraint after new evidence was found. MORPH increased the importance of partnership strategy and reduced direct-entry emphasis.”

Do NOT expose private chain-of-thought.

Show concise, outcome-level explanations.

---

# 19. CAMERA CHOREOGRAPHY

The camera is important for the cinematic effect.

Create a camera director.

Supported behaviors:

```text
overview
focus_core
follow_agent
focus_module
reveal_module
reveal_handoff
focus_collaboration
pull_back_for_morph
reveal_scenarios
focus_recommendation
return_to_overview
```

Important rules:

- do not constantly move the camera,
- avoid motion sickness,
- movement must be smooth,
- user interaction temporarily overrides automatic camera movement,
- major events get camera attention,
- routine events do not.

For the flagship demo:

- objective → subtle push toward Core
- delegation → wider view
- first agent movement → follow one agent briefly
- major discovery → focus relevant zone
- workspace morph → pull back
- Possibility Engine → cinematic reveal
- final recommendation → center composition.

---

# 20. AUDIO

Audio is optional but can significantly improve the LinkedIn demo.

If implemented, keep it subtle.

Possible sounds:

- Core activation,
- soft task dispatch,
- light movement tone,
- artifact transfer,
- module materialization,
- warning/challenge,
- scenario shift,
- convergence.

Never rely on audio to communicate essential information.

Provide mute toggle.

Avoid loud game-like effects.

---

# 21. VISUAL TECHNOLOGY DIRECTION

Preferred stack:

```text
Next.js
React
TypeScript strict
React Three Fiber
Three.js
Drei
GSAP
Zustand
Zod
Vitest
React Testing Library
Playwright if useful
```

For 3D character/entity movement:

Use simple, optimized, high-quality procedural/stylized agents.

Avoid heavy realism unless there is a clear performance-safe approach.

Use instancing where useful.

Keep geometry and materials controlled.

Prefer visual sophistication through:

- lighting,
- composition,
- motion,
- particles,
- materials,
- camera,
- spatial design

rather than high polygon count.

---

# 22. DESIGN LANGUAGE

Aim for:

```text
70% cinematic spatial world
20% information visualization
10% traditional UI
```

Color direction:

- near-black / graphite environment,
- cool restrained accents,
- one identity accent per agent,
- warm highlight for warnings/critical discoveries,
- no rainbow UI,
- no excessive bloom.

Typography:

- clean,
- modern,
- minimal,
- strong hierarchy,
- excellent spacing.

Materials:

- dark metal,
- glass,
- subtle translucent surfaces,
- emissive accents,
- soft reflective floor/grid.

Do not make every object glow.

---

# 23. USER INTERFACE SURFACES

Required routes:

```text
/
```
Main MORPH experience.

```text
/demo
```
Deterministic demo mode.

```text
/showcase
```
16:9 LinkedIn recording mode.

```text
/lab
```
Internal visual/dev controls.

Suggested UI layers:

- top objective/status strip,
- compact agent roster,
- selected agent detail,
- event/activity history,
- optional cost/latency telemetry,
- spatial human-input controls,
- clean final recommendation panel.

Keep the world dominant.

---

# 24. INTERACTION

User should be able to:

- submit objective,
- orbit/pan/zoom environment,
- click an agent,
- click a module,
- inspect evidence,
- change assumptions,
- answer agent questions,
- pause/resume demo,
- restart demo,
- hide/show intelligence activity,
- switch clean/presentation mode.

Hover cannot be required for essential actions.

---

# 25. AGENT ROSTER UI

The agent roster should show agents without stealing space from the world.

Example:

```text
● Planner      Delegating
● Researcher   Working
● Analyst      Processing
● Critic       Waiting
○ Strategist   Queued
○ Simulator    Queued
```

Click agent:
- focus camera,
- open detail,
- show current route/task.

---

# 26. PERFORMANCE REQUIREMENTS

Target:

- smooth on a modern MacBook,
- ideally 60 FPS,
- graceful fallback around 30 FPS,
- adaptive effects if necessary.

Audit:

- draw calls,
- particle count,
- geometry allocation,
- materials,
- shadows,
- postprocessing,
- React rerenders,
- Zustand selectors,
- animation loops,
- event listeners,
- Three.js disposal,
- memory leaks.

Implement quality presets if useful:

```text
High
Balanced
Performance
```

Do not degrade the premium default experience unnecessarily.

---

# 27. ACCESSIBILITY

Even though this is spatial:

- keyboard-accessible essential controls,
- visible focus states,
- proper labels,
- reduced-motion support,
- color should not be the only state cue,
- textual fallback for important state,
- enough contrast,
- responsive layout.

---

# 28. SECURITY

Review:

- API key exposure,
- server/client boundaries,
- prompt injection,
- tool result trust,
- XSS,
- unsafe URLs,
- schema validation,
- oversized user input,
- agent loop runaway,
- excessive model spend,
- timeouts,
- rate limiting where appropriate,
- logging sensitive content.

No arbitrary AI code execution.

No arbitrary HTML execution.

---

# 29. COST CONTROL

This is a showcase.

Keep it inexpensive.

Requirements:

- no unnecessary infrastructure,
- no GPU backend required,
- no Kubernetes,
- no Kafka,
- no Redis unless genuinely necessary,
- no multi-model swarm by default,
- agents can share the same underlying model,
- cheap model for simple structured tasks,
- stronger model only for planning/synthesis when needed,
- hard model-call caps,
- retry caps,
- token usage tracking,
- estimated cost visible in dev mode.

---

# 30. TESTING

Prioritize domain behavior.

Unit tests:

- schemas,
- MorphOperations,
- workspace updates,
- agent transitions,
- event publishing,
- layout calculations,
- orchestration dependencies,
- retry limits,
- cancellation,
- scenario updates,
- invalid AI output.

Integration tests:

- objective → plan,
- plan → agent assignments,
- agent completion → evidence,
- evidence → module change,
- human input → replanning,
- failed agent → retry,
- critic → research retry,
- scenario change → recommendation.

End-to-end:

Flagship demo path.

Avoid brittle visual snapshots as primary testing.

---

# 31. OBSERVABILITY

Create development telemetry.

Useful metrics:

- current objective,
- active agents,
- queued tasks,
- total tool calls,
- total model calls,
- approximate tokens,
- estimated cost,
- elapsed time,
- event count,
- retries,
- failures.

Keep this mostly hidden from clean showcase mode.

---

# 32. DEMO TIMELINE

Final deterministic showcase target:

### 0–3s
Empty premium chamber.

User objective enters.

Core wakes.

### 3–7s
Planner activates.

World begins forming.

### 7–13s
Agents receive work.

Three agents visibly travel to different modules.

### 13–20s
Agents actively work.

Evidence appears.

First visible handoff.

### 20–26s
New constraint discovered.

Economics + Risk materialize.

World morphs.

### 26–31s
Human budget input appears.

500k confirmed.

### 31–37s
Critic challenges assumption.

Researcher visibly gets a retry task and moves.

### 37–44s
Possibility Engine rises.

Three futures branch.

Agents feed evidence into scenarios.

### 44–50s
Local Partnership strengthens.

Direct Entry weakens.

### 50–56s
Strategist + Planner converge.

Core enters synthesis.

### 56–60s
Recommendation locks in.

Camera settles.

MORPH logo / final line.

---

# 33. FINAL LINKEDIN VISUAL

The first 3 seconds must stop scrolling.

Do NOT begin with a normal homepage.

Suggested opening:

- almost empty dark environment,
- Core barely visible,
- user objective appears,
- Core activates dramatically,
- agents awaken around it.

The money shot is:

> multiple agents visibly leaving the Core and running/traveling to different analysis zones while the world forms around them.

Another key money shot:

> Critic rejects an assumption, sends work back, and the Researcher physically moves to retry.

Another:

> user changes a budget assumption, the world pulls back, modules reposition, scenario branches change, and agents reroute.

---

# 34. REPOSITORY STRUCTURE

Use a clean structure approximately like:

```text
src/
  app/
  components/
    ui/
    hud/
  morph/
    domain/
    state/
    operations/
    events/
    orchestration/
    providers/
    tools/
    demo/
  world/
    scene/
    core/
    agents/
    modules/
    artifacts/
    camera/
    lighting/
    effects/
    animation/
    layout/
  lib/
  tests/

docs/
  PRODUCT_VISION.md
  ARCHITECTURE.md
  ENGINEERING_PRINCIPLES.md
  VISUAL_SYSTEM.md
  EVENT_MODEL.md
  PERFORMANCE.md
  SECURITY.md
  BUILD_PROGRESS.md
```

Do not blindly follow this if a cleaner architecture is justified, but keep boundaries explicit.

---

# 35. IMPLEMENTATION ORDER

Build in phases.

Do not write the entire project blindly in one giant pass.

## Phase 1
Architecture + repository plan.

## Phase 2
Application scaffold.

## Phase 3
2D design system + HUD.

## Phase 4
Base 3D intelligence chamber.

## Phase 5
Intent Core.

## Phase 6
Agent entity visual prototype.

This phase is CRITICAL.

Before moving on, one agent must:

- idle,
- receive assignment,
- move,
- work,
- carry/transfer artifact,
- complete,
- return.

Make this visually excellent.

## Phase 7
Multiple agent system.

## Phase 8
Spatial modules.

## Phase 9
Workspace domain state.

## Phase 10
Typed event system.

## Phase 11
MorphOperation protocol.

## Phase 12
World morphing engine.

## Phase 13
Deterministic demo runtime.

## Phase 14
Agent orchestration.

## Phase 15
Agent collaboration / handoff / failure / retry.

## Phase 16
Human-in-loop controls.

## Phase 17
Possibility Engine.

## Phase 18
Cinematic camera director.

## Phase 19
Objective planner / real AI provider.

## Phase 20
Research tools.

## Phase 21
Explainability.

## Phase 22
Flagship demo choreography.

## Phase 23
Performance + reliability.

## Phase 24
Security + tests.

## Phase 25
Extreme visual polish.

## Phase 26
Showcase / deployment.

---

# 36. VISUAL QUALITY GATES

Do not consider these phases complete without visual inspection:

- chamber,
- Intent Core,
- agent entity,
- agent movement,
- agent working animation,
- artifact handoff,
- multi-agent collaboration,
- world morphing,
- Possibility Engine,
- final choreography.

At each gate:

1. run the app,
2. visually inspect,
3. identify anything that looks cheap,
4. improve it,
5. only then continue.

If you have browser/screenshot capabilities, use them.

---

# 37. DECISION GATES

Do not silently make major decisions.

Ask the user before material choices involving:

- major visual direction,
- agent representation,
- camera style,
- layout metaphor,
- technology/framework replacement,
- database/service addition,
- AI provider,
- major feature scope,
- changing the demo story,
- architecture boundary change,
- important cost/performance tradeoff.

For material decisions:

1. explain the decision,
2. give 2–4 options,
3. list pros/cons,
4. give your recommendation,
5. wait for approval.

Do NOT ask for trivial implementation details.

---

# 38. CURSOR WORKING RULES

For every substantial phase:

1. inspect current repository,
2. read project docs,
3. state a concise plan,
4. implement the smallest complete slice,
5. run it,
6. run relevant tests,
7. fix real problems,
8. visually inspect when relevant,
9. update `docs/BUILD_PROGRESS.md`,
10. stop before the next major phase if user approval is required.

Do not claim success because code exists.

Verify behavior.

---

# 39. ANTI-PATTERNS

Do not allow this project to become:

- chat UI + fancy background,
- boxes connected by lines,
- fake agent animation disconnected from state,
- generic dashboard,
- low-quality video-game office,
- 20 agents doing meaningless tasks,
- flashy neon mess,
- particle soup,
- over-engineered backend,
- 10 model providers,
- fake probabilities presented as truth,
- giant source files,
- duplicated state,
- visual components owning domain state,
- unbounded autonomous loops.

---

# 40. FINAL ACCEPTANCE CRITERIA

MORPH is complete only when all of these are true.

## Visual

- opening frame feels premium,
- Core is memorable,
- agents are clearly visible and alive,
- agent movement is smooth,
- work animations are meaningful,
- handoffs are understandable,
- collaboration looks real,
- failures/retries are visible,
- world morphing is impressive,
- Possibility Engine is cinematic,
- UI does not look like normal SaaS.

## Agentic

- tasks are genuinely represented in runtime state,
- agent status changes are real,
- events drive visual behavior,
- retries are bounded,
- collaboration/handoffs exist,
- human input can change execution,
- scenarios respond to assumptions.

## Technical

- strict TypeScript,
- validated schemas,
- clean boundaries,
- safe AI output,
- provider abstraction,
- deterministic demo mode,
- tests for important logic,
- stable production build,
- secrets protected,
- bounded cost.

## Demo

- deterministic replay works,
- no external API required,
- 35–60 second showcase works,
- agents visually perform the story,
- user can pause/restart,
- `/showcase` is optimized for recording,
- demo is understandable without narration.

---

# 41. FIRST TASK

Before coding, do the following:

1. Inspect the current repository.
2. Create/update:
   - `docs/PRODUCT_VISION.md`
   - `docs/ARCHITECTURE.md`
   - `docs/VISUAL_SYSTEM.md`
   - `docs/EVENT_MODEL.md`
   - `docs/BUILD_PROGRESS.md`
3. Produce a concrete implementation plan based on the phases above.
4. Identify any material decisions that require user approval.
5. Do NOT start coding until those decisions are resolved.

The most important sentence to keep in mind during the entire build is:

> **MORPH succeeds when the viewer can watch intelligence working.**

The visible live agents, their movement, their collaboration, and their interaction with the evolving world are the heart of the project.
