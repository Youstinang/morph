# MORPH Event Model

## Status

Planning document. No event runtime exists yet. Exact payload schemas, ordering guarantees, and ownership are defined and tested in Phase 10 (typed event system) and Phase 11 (MorphOperation protocol), using Zod with inferred TypeScript types.

## Role of events

Application events drive the visual world. The orchestrator (REAL mode) or the deterministic demo timeline (DEMO mode) publishes typed `WorkspaceEvent`s through a single in-memory bus. Canonical state changes only through validated `MorphOperation`s applied by `applyMorphOperation(workspace, operation)`. The world, HUD, activity history, replay, and telemetry subscribe; none of them publish domain events or own domain state.

```text
Orchestrator / Demo timeline
        │ publishes WorkspaceEvent, proposes MorphOperation
        ▼
Event bus (in-memory, typed)  ──►  applyMorphOperation → canonical workspace state
        │                                         │
        ▼                                         ▼
World animation director, camera director,   World + HUD render from state
activity history, telemetry, replay
```

DEMO and REAL modes share this path. The demo differs only in event source and fixtures. No external queues.

## Event catalog (from the primary specification)

| Group | Events |
| --- | --- |
| Objective and planning | `objective_received`, `planning_started`, `plan_created` |
| Agent lifecycle | `agent_created`, `agent_assigned`, `agent_move_started`, `agent_arrived`, `agent_work_started` |
| Tools | `tool_started`, `tool_completed` |
| Evidence | `evidence_discovered`, `evidence_accepted`, `evidence_rejected` |
| Artifacts and handoff | `artifact_created`, `artifact_handoff_started`, `artifact_handoff_completed` |
| Assumptions and retry | `assumption_created`, `assumption_challenged`, `retry_requested`, `retry_started` |
| Collaboration | `agent_collaboration_started`, `agent_collaboration_ended` |
| Workspace morph | `module_created`, `module_emphasized`, `module_removed`, `workspace_morph_started`, `workspace_morph_completed` |
| Human input | `human_input_requested`, `human_input_received` |
| Scenarios and outcome | `scenario_created`, `scenario_updated`, `recommendation_updated`, `synthesis_started`, `synthesis_completed` |

Failure and blocked states (`task_failed`, `agent_blocked`, `task_cancelled`) are expected additions so that the failed, blocked, and retrying agent states are event-driven. Final names are set in Phase 10.

## Visual mapping examples

| Event | World reaction |
| --- | --- |
| `agent_assigned` | Agent pulses; destination marker and route appear |
| `agent_move_started` | Agent begins locomotion along the route |
| `agent_arrived` / `agent_work_started` | Target zone activates; working animation begins |
| `artifact_handoff_started` | A physical artifact travels between agents |
| `module_created` | Zone materializes |
| `assumption_challenged` | Critic inspection effect; assumption token flagged |
| `workspace_morph_started` | Camera pulls back; layout begins restructuring |
| `scenario_updated` | Possibility Engine branches change weight |

## Agent states

`idle`, `assigned`, `moving`, `working`, `waiting`, `handoff`, `collaborating`, `evaluating`, `blocked`, `failed`, `retrying`, `completed`, `returning`. State transitions are deterministic and derived from events; the transition table is defined and tested in Phase 9/10.

## MorphOperations

`add_module`, `remove_module`, `update_module`, `move_module`, `resize_module`, `emphasize_module`, `deemphasize_module`, `add_evidence`, `remove_evidence`, `add_assumption`, `update_assumption`, `challenge_assumption`, `add_scenario`, `update_scenario`, `update_recommendation`, `request_human_input`, `assign_agent`, `focus_camera`.

Every operation has a schema, an ID, provenance/source, and an optional reason. It is validated, safe to reject, and deterministic when applied. Malformed or unknown operations never corrupt state. Significant operations carry “Why did MORPH change?” metadata: reason, triggering evidence, triggering assumption, and responsible agent.

## Canonical domain model (Phase 9)

Objective, Workspace, WorkspaceModule, Agent, AgentRole, AgentState, AgentTask, ToolCall, Evidence, EvidenceArtifact, Assumption, Scenario, Recommendation, MorphOperation, WorkspaceEvent, HumanInputRequest, CostUsage, DemoTimelineEvent.

## Constraints

- Events reference evidence and state by ID and carry no secrets or private chain-of-thought.
- Visual-only timing (animation durations, camera easing) lives in the world layer, not in events.
- The demo timeline is a deterministic ordered list of `DemoTimelineEvent`s that feed the same bus, so it is replayable, pausable, and restartable.
