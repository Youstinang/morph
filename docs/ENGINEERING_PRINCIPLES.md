# MORPH Engineering Principles

## Governing requirements

`docs/MASTER_PROMPT.md` is the primary specification (adopted 2026-10-06). `/Users/youstina/Downloads/MORPH_CODEX_MASTER_v2.md` governs where it is silent, including most of the engineering detail below. Build a small professional product with clear boundaries and useful abstractions; avoid over-engineering and infrastructure added for appearances.

## State and rendering

- Use one canonical typed workspace model with deterministic transitions and clear state ownership.
- Separate rendering from orchestration. Visual components derive from state and meaningful events and do not contain business logic or provider knowledge.
- AI declares constrained operations; runtime validation and a trusted component registry control what renders. Never execute arbitrary model-generated React, HTML, JavaScript, or frontend code.
- Validate every operation; malformed/unknown input must not corrupt workspace state.
- Make important animations, including agent movement, reflect real state/events; coordinate and clean up animations, subscriptions, and Three.js resources.

## Boundaries and reliability

- Use TypeScript strict mode, strong types, and runtime validation at AI and tool boundaries.
- Keep AI providers replaceable behind interfaces/adapters. Tool interfaces require typed inputs/outputs and validation.
- Preserve evidence provenance: source, claim, extracted facts, uncertainty/confidence, and citation metadata. Source-free AI statements are not verified evidence.
- Bound orchestration with task dependencies, safe parallelism, timeouts, cancellation where appropriate, retry/step/model-call caps, and approximate token/cost tracking.
- Keep failures visible and graceful. For structured generation failure, Phase 19 allows one safe repair attempt before graceful failure.
- Keep secrets server-side and avoid sensitive logging. Address prompt injection, unsafe URLs, oversized input, arbitrary rendering, API abuse, and model spend in the relevant phases.
- Provide observable significant events for visuals, activity history, replay, and diagnostics without exposing private chain-of-thought.

## Deterministic demo

REAL and DEMO execution share operations, events, and canonical workspace state. Demo uses deterministic fixtures, scripted events, and mock adapters. It must be replayable/restartable and work without internet, providers, search services, or a database. Do not create a separate animation-only execution path.

## Visual quality and access

Maintain the premium spatial direction, with live 3D agent creatures as the hero (see VISUAL_SYSTEM.md), while respecting accessibility, keyboard/focus behavior, responsiveness, reduced motion, and performance on a modern MacBook-class laptop. Avoid unnecessary rerenders, GPU waste, resource leaks, and motion-sickness-style camera behavior. Material quality/performance/cost/complexity trade-offs require a decision gate.

## Dependencies and infrastructure

The user approved the Phase 1 foundation on 2026-10-04: Next.js App Router, React, strict TypeScript, Tailwind with CSS variables/custom CSS, Vitest with React Testing Library, Zod environment validation, and npm, with the proposed framework-appropriate ESLint baseline. Use one modular application, explicit client/server boundaries, and framework-independent domain logic. Verify dependency compatibility before installation. Phase 1 execution was separately authorized on 2026-10-06.

React Three Fiber, Three.js, Drei, GSAP, and Zustand remain preferred later-phase technologies to evaluate at their gates. Do not install them ahead of their authorized phases.

Add other libraries only when value clearly justifies the dependency and the relevant decision gate is satisfied. Do not introduce Kubernetes, Kafka, Redis, microservices, distributed/external queues, multiple databases, or complicated infrastructure without a concrete approved requirement. Phase 10 specifies a lightweight in-memory event implementation.

## Validation and audits

Run checks appropriate to each phase, repair meaningful failures, and record results honestly. Application checks eventually include typecheck, lint, unit/integration tests, production build, and runtime/manual checks. Prioritize schemas, operations, state mutations, dependencies, retries, cancellation, scenarios, invalid AI output, and key end-to-end behavior; avoid brittle snapshot-heavy tests.

Visual checks include runtime errors, layout, performance, rerenders, resource disposal, animation/listener cleanup, responsiveness, and reduced motion. Phase 0 validates document content and repository scope; application checks are not applicable before application code exists.

Audit architecture after approximately every 3–4 completed phases. Rank drift, duplication, state ownership, weak abstractions, type safety, unnecessary dependencies, performance risks, and demo leakage as Critical/High/Medium/Low. Fix only Critical/High automatically within authorization and mandatory gates; do not refactor for taste.

## Decision ownership

The user controls material product direction and meaningful trade-offs. Present 2–4 options, pros/cons, consequences, and a recommendation, then stop for explicit choice. Routine implementation details may be resolved independently. Complete only the authorized phase, update progress, and stop for approval.
