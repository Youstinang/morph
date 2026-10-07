# MORPH Event Model

## Status

Implemented in Phase 10 (2026-10-07). The contract lives in `src/events/schema.ts` (Zod schemas with inferred TypeScript types), the bus in `src/events/bus.ts`, and the shared agent-state transition table in `src/events/agents.ts`. Phase 11 adds `MorphOperation`s for the state-changing part.

## Role of events

Every happening in a run is a typed `WorkspaceEvent` on one in-memory bus. The demo timeline (DEMO) or the orchestrator (REAL) publishes them. The 3D world, the canonical workspace store, the HUD's steps list, replay and telemetry subscribe. The world never reads the story script and the story script never touches the world; they meet only on the bus.

```text
Demo story runner (DEMO) / orchestrator (REAL)
        │ publishes: agent_assigned, agent_work_started, evidence_discovered, …
        ▼
Event bus (in-memory, synchronous, typed) ──► workspace store (applyWorkspaceEvent → canonical state)
        │                                 ──► HUD steps list and caption (narrated from history)
        ▼
3D world: reacts (plans a route, opens a station, launches an artifact, updates the Core)
        │ reports what physically happened: agent_move_started, agent_arrived, artifact_handoff_completed
        └────────► back onto the bus; the story runner waits for these before continuing
```

DEMO and REAL share this path; only the publisher differs. No external queues.

## Envelope

Every event has `seq` (strictly increasing per bus), `at` (seconds on the run clock), `cycle` (demo loop number), `source`, and an optional `summary`.

| Source | Meaning |
| --- | --- |
| `user` | Trusted human input from the HUD (the question, the budget answer) |
| `demo` | The scripted demo timeline, including its autoplay answer (`answeredBy: "autoplay"`) |
| `orchestrator` | The real runtime (Phase 14 onward) |
| `world` | Physical reports from the 3D world: a walk started, an agent arrived, an artifact landed |

`summary` is a one-line, outcome-level narration for story moments. Events never carry secrets or private reasoning.

## Delivery guarantees

- Publishing validates the draft. A malformed or unknown draft returns `null` and is neither recorded nor delivered. Fields outside the contract are stripped.
- Delivery is synchronous. Events published by a listener are queued and delivered after the current event has reached every listener, so all listeners see one global order and runs are deterministic.
- A listener that throws is isolated and counted; other listeners still receive the event.
- History is bounded (1000 events per session) and is the source for the steps list and future replay. `stats()` reports published, rejected and listener-error counts.

## Event catalog

| Group | Events |
| --- | --- |
| Run | `run_started` |
| Objective and planning | `objective_received`, `planning_started`, `plan_created` |
| Workspace morph | `workspace_morph_started`, `workspace_morph_completed`, `module_reserved`, `module_created`, `module_updated` (panel headline), `module_emphasized`, `module_removed` |
| Agent lifecycle | `agent_assigned`, `agent_move_started`, `agent_arrived`, `agent_work_started` (working, evaluating or collaborating), `sources_checked`, `task_completed`, `task_failed`, `retry_requested`, `retry_started`, `agent_waiting`, `agent_idle`, `agent_collaboration_started` |
| Artifacts | `artifact_handoff_started`, `artifact_handoff_completed` |
| Tools | `tool_started`, `tool_completed`, `tool_failed` (defined; first used by real tools) |
| Evidence and assumptions | `evidence_discovered`, `assumption_created`, `assumption_challenged`, `assumption_resolved` |
| Human input | `human_input_requested`, `human_input_received` |
| Scenarios and outcome | `scenario_created`, `scenario_updated`, `recommendation_updated`, `synthesis_started`, `synthesis_completed` |

Events reference agents, modules, evidence and assumptions by id. Modules carry a domain `kind`; the world maps kinds to registered workstations, with a plain console for unknown kinds.

## Agent state transitions

`agentChange(event)` in `src/events/agents.ts` is the single transition table, used by both the store and the world, so the two always agree (tested frame by frame over a full run).

| Event | Agent state |
| --- | --- |
| `agent_assigned` | `assigned`, or `returning` when heading home |
| `agent_move_started` | the trip's travel: `moving`, `returning` or `retrying` |
| `agent_work_started` | `working`, `evaluating` or `collaborating` |
| `task_completed` / `task_failed` / `retry_started` | `completed` / `failed` / `retrying` |
| `artifact_handoff_started` | `handoff` (the sender) |
| `agent_waiting` / `agent_idle` | `waiting` / `idle` |

`blocked` is in the state model but not used by the demo story yet.

## World reactions

| Event | World reaction |
| --- | --- |
| `agent_assigned` | Plans a route around the Core; the agent turns toward it and pauses briefly, then the world reports `agent_move_started` and walks |
| arrival | The world reports `agent_arrived`; the story continues only then |
| `agent_work_started` and other work states | The agent stands at its station, faces it and follows it if the layout shifts |
| `artifact_handoff_started` | A physical artifact flies between the two agents; on landing the world reports `artifact_handoff_completed` |
| `module_reserved` / `module_created` / `module_removed` | A slot is held, a station materializes, or a station dissolves |
| `module_updated` | The station's floating panel changes its headline |
| `sources_checked` | The station's source indicators and the archive towers fill |
| `objective_received`, `plan_created`, `assumption_challenged`, `assumption_resolved`, `synthesis_started`, final `recommendation_updated` | The Intent Core changes mood (listening, delegating, uncertain, converging, completed) |
| `scenario_created` / `scenario_updated` | The Possibility Engine's branches change weight |
| `human_input_requested` / `human_input_received` | The budget cue appears and clears |

Visual timing (walk speed, the assignment pause, flight duration, materialize and dissolve) stays in the world layer.

## Demo timeline

The flagship story's facts are `UAE_TIMELINE` in `src/state/fixtures/uae-market.ts`: for each story moment, the events it publishes in order, plus its narration. The prototype story runner (`src/visualization/world/sim/runner.ts`) plays each agent's script by publishing events and waiting for the world's reports. Phase 13 moves it into the orchestration layer as the deterministic demo runtime.
