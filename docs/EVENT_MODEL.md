# MORPH Event Model

## Status

Implemented in Phase 10 (2026-10-07). The contract lives in `src/events/schema.ts` (Zod schemas with inferred TypeScript types), the bus in `src/events/bus.ts`, and the shared agent-state transition table in `src/events/agents.ts`. Phase 11 (2026-10-07) put every change to the canonical record behind validated `MorphOperation`s (see Operations below).

## Role of events

Every happening in a run is a typed `WorkspaceEvent` on one in-memory bus. The demo timeline (DEMO) or the orchestrator (REAL) publishes them. The 3D world, the canonical workspace store, the HUD's steps list, replay and telemetry subscribe. The world never reads the story script and the story script never touches the world; they meet only on the bus.

```text
Demo story runner (DEMO) / orchestrator (REAL) / AI proposals (later)
        │ activity events: agent_assigned, agent_work_started, …      │ proposed MorphOperations
        │                                                            ▼
        │                         operation gate → applyMorphOperation → workspace store (canonical record)
        │                                                            │ record events (with the operation) or operation_rejected
        ▼                                                            ▼
Event bus (in-memory, synchronous, typed) ──► workspace store (agent activity only)
        │                                 ──► HUD steps list and caption (narrated from history)
        ▼
3D world: reacts (plans a route, opens a station, launches an artifact, updates the Core)
        │ reports what physically happened: agent_move_started, agent_arrived, artifact_handoff_completed
        └────────► back onto the bus; the story runner waits for these before continuing
```

DEMO and REAL share this path; only the publisher differs. No external queues.

## Envelope

Every event has `seq` (strictly increasing per bus), `at` (seconds on the run clock), `cycle` (demo loop number), `source`, an optional `summary`, and — on record events only — `operation`: the id, type, provenance and reason of the accepted operation that caused it. The bus refuses a record event without `operation` and any other event with one, so only the gate can announce record changes.

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
| Run | `run_started` (mode demo or real), `run_waiting` (the run can't go further on its own yet), `run_failed`, `model_call_completed` (usage and estimated cost of one AI call; never the prompt, reply or provider) |
| Objective and planning | `objective_received`, `objective_updated`, `planning_started`, `plan_created` |
| Workspace morph | `workspace_morph_started`, `workspace_morph_completed`, `module_reserved`, `module_created`, `module_updated` (title, collapse, panel headline), `module_moved`, `module_resized`, `module_emphasized`, `module_removed` |
| Agent lifecycle | `agent_assigned`, `agent_move_started`, `agent_arrived`, `agent_work_started` (working, evaluating or collaborating), `sources_checked`, `task_completed`, `task_failed`, `retry_requested`, `retry_started`, `agent_waiting`, `agent_idle`, `agent_collaboration_started` |
| Artifacts | `artifact_handoff_started`, `artifact_handoff_completed` |
| Tools | `tool_started`, `tool_completed`, `tool_failed` (defined; first used by real tools) |
| Evidence and assumptions | `evidence_discovered`, `evidence_removed`, `assumption_created`, `assumption_challenged`, `assumption_resolved` |
| Human input | `human_input_requested`, `human_input_received` |
| Scenarios and outcome | `scenario_created`, `scenario_updated`, `recommendation_updated`, `synthesis_started`, `synthesis_completed` |
| Operations | `task_assigned`, `camera_focus_requested`, `operation_rejected` |

Record events (`RECORD_EVENTS` in `schema.ts`) are the ones an accepted operation announces: objective, module, evidence, assumption, scenario, recommendation, human-input, `task_assigned` and `camera_focus_requested` events. Everything else is activity.

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
| `module_reserved` / `module_created` / `module_removed` | A slot is held, a station materializes, or a station dissolves; neighbors glide to make room first |
| `module_created` with `replaces` | The new station takes the old one's slot and motion and grows there while the old one dissolves in place |
| `module_updated` | The station's floating panel changes its headline; a new title or collapse applies too |
| `module_moved` / `module_resized` | The station is carried to another neighborhood (lifted, shrunk, travelling around the Core) or changes size; its old and new neighbors glide on one shared clock |
| `module_emphasized` | The station brightens or dims, and its light column re-flashes |
| `workspace_morph_started` / `workspace_morph_completed` | A ring of light sweeps the floor outward from the Core; `world.morph` records the morph |
| `sources_checked` | The station's source indicators and the archive towers fill |
| `objective_received`, `plan_created`, `assumption_challenged`, `assumption_resolved`, `synthesis_started`, final `recommendation_updated` | The Intent Core changes mood (listening, delegating, uncertain, converging, completed) |
| `scenario_created` / `scenario_updated` | The Possibility Engine's branches change weight |
| `human_input_requested` / `human_input_received` | The budget cue appears and clears |
| `run_waiting` / `run_failed` | The Intent Core turns to "waiting for research" (soft amber, slow) or "something went wrong" (red) |

Visual timing (walk speed, the assignment pause, flight duration, materialize and dissolve, glide and carry durations) stays in the world layer. With reduced motion, stations fade between places and the sweep is skipped; the events and resulting state are identical.

## Operations

A `MorphOperation` (`src/state/operations.ts`) is a proposed change to the canonical record, written as plain data. It is the only way the record (objective, modules, evidence, assumptions, scenarios, recommendation, questions, task assignments, camera focus) changes. Agent activity — state, current task, task history — stays on activity events.

| Group | Operations |
| --- | --- |
| Objective | `set_objective`, `update_objective` |
| Modules | `add_module` (optionally `reserve`), `update_module`, `move_module`, `resize_module`, `emphasize_module`, `deemphasize_module`, `remove_module` |
| Evidence and assumptions | `add_evidence`, `remove_evidence` (optionally superseded by another item), `add_assumption`, `challenge_assumption`, `update_assumption` |
| Scenarios and answer | `add_scenario`, `update_scenario`, `update_recommendation` |
| People and view | `request_human_input`, `answer_human_input`, `assign_agent`, `focus_camera` |

Every operation has an `id`, a `source` (provenance: user, demo, orchestrator or model, with an optional agent and label) and an optional `why` (reason, evidence ids, assumption, agent). `applyMorphOperation(workspace, input)` is pure and deterministic. It returns the new workspace or a refusal with a reason, and a refusal leaves the workspace untouched. It refuses:

- input that isn't plain data, is over 16 KB, has an unknown operation, or fails the strict schema (unknown fields, including markup or code, are refused, not stripped);
- an id that was already applied;
- a significant change (`add_module`, `move_module`, `emphasize_module`, `deemphasize_module`, `remove_module`, `remove_evidence`, `update_recommendation`) without a reason;
- references to modules, evidence, assumptions, scenarios, agents or questions that don't exist, and out-of-order changes;
- evidence marked verified unless it comes from the user or a tool; user evidence, answers to the user's questions, or a new objective from a model or the orchestrator;
- removing evidence that the answer cites or that settled an assumption; a recommendation citing evidence that isn't accepted; a final recommendation without a statement and reason.

Text stays text: the HUD renders it as plain strings, never as HTML.

**Live questions (planner).** The objective planner's reply is not an operation list: it is a `Plan` (`src/state/plan.ts`: interpretation, 2–6 stations, at most one task per agent, up to 2 assumptions and 2 questions), validated on the server and again in the browser. `planToOperations` turns it into ordinary `add_module`, `add_assumption`, `request_human_input` and `assign_agent` operations with ids MORPH assigns, proposed through the gate as `{ kind: "model", label: "Planner", agentId: "nova" }`. Each station's `why` is the planner's one-line reason. The user's question is recorded as `set_objective` from the user.

**Live questions (team work, Phase 14).** When the plan reply carries a `runId`, the live question schedules research (one task per planned assignment, starting when the agent has arrived), a critique (after any research succeeds, when Vex is at the Core) and a synthesis (after the critique settles, when Lume is at the Core). Each step is a `POST /api/agent-step` with `{ runId, step }`, where `step` is `{ kind: "research", task }`, `{ kind: "critique" }` or `{ kind: "synthesis" }` (`src/state/live-work.ts`); replies are validated again in the browser. Events per step:

- started: `agent_work_started` (or `retry_started` for a second attempt); synthesis also publishes `agent_collaboration_started` and `synthesis_started` for Lume and Nova.
- research succeeded: `add_evidence` (source `{ kind: "model", label: "AI general knowledge, not checked against sources", verified: false }`) and `update_module` (the station's headline), proposed as `{ kind: "model", label: "Researcher", agentId }`, then `task_completed`.
- critique succeeded: `challenge_assumption`, or `add_evidence` of kind risk for a doubted finding, as the Critic; or `task_completed` "found no serious weak spot".
- synthesis succeeded: `update_recommendation` (final, citing the findings it rests on) as the Synthesizer, `update_objective` answered, `synthesis_completed`, `task_completed` for Lume and Nova.
- failed: `task_failed` with the short reason; skipped: `agent_waiting`.
- every reply's cost: `model_call_completed` with purpose `research`, `critique` or `synthesis`.
- the end: everyone `agent_assigned` home and `agent_idle`; if the team couldn't answer, first `run_waiting` "The team stopped: {reason}.".

The operation gate (`src/state/gate.ts`) is the only caller in a run. `gate.submit(input, { as, summary })` stamps the trusted channel's provenance (`as`) over whatever source the proposal claims, applies the operation to the store, and publishes either its record events carrying the operation reference, or `operation_rejected` with the reason. The world reacts only to those published record events, so it never shows a refused change. The development-only page `/dev/operations` sends good and deliberately broken requests through a real gate.

## Demo timeline

The flagship story's facts are `UAE_TIMELINE` in `src/state/fixtures/uae-market.ts`: for each story moment, its items in order (activity events and proposed operations, each significant one with a reason), plus its narration. The runner proposes the operations through the gate as the demo, or as the user for the user's own question and answer; a full run has no refusals. The demo runtime (`src/orchestration/demo/runtime.ts`, Phase 13) plays each agent's part (`demo/script.ts`) by publishing events and waiting for the world's reports. It uses no network, model or randomness and runs on the run controller's fixed-step clock, so the same story produces the same events at any frame rate or playback speed, and every restart and loop replays it identically (ids carry the run number).
