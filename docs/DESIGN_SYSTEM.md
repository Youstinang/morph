# MORPH Visual Design System — Phase 2

Under the primary specification adopted on 2026-10-06 (`docs/MASTER_PROMPT.md`), this work is the design-system half of **Phase 3 — 2D design system + HUD**. The HUD half is not yet built. The 3D world direction lives in `docs/VISUAL_SYSTEM.md`.

## Approval status

The user approved the proposed Phase 2 direction on 2026-10-06: graphite/ivory/ice-blue, mostly opaque smoked glass, Geist Sans with selective Geist Mono, restrained responsive motion, and native controls with targeted Radix Tooltip support. Implementation and validation are ready for review. Final visual approval is still required; Phase 2 must not be marked Complete until that approval arrives.

The component specimen page is not MORPH's final workspace composition. It introduces no 3D environment, Intent Core, event runtime, AI execution, research, or scenario calculations.

## Preview

Run `npm run dev -- --hostname 127.0.0.1 --port 3102` and visit `/dev/design-system`. The current local preview is at http://127.0.0.1:3102/dev/design-system.

This route calls `notFound()` outside development; production requests return HTTP 404. It has no authentication service because it is a local development preview rather than a deployed private application. The production homepage remains the temporary shell.

## Foundations

Tokens live in `src/app/globals.css` as CSS custom properties.

| Role | Value |
| --- | --- |
| Canvas | `#090c10` |
| Surface / raised | `#121820` / `#1b232d` |
| Reading text / muted | `#f0efeb` / `#a9b4c1` |
| Emphasis | `#b8d6eb` |
| Warning / success | `#e9c185` / `#acd0b5` |
| Uncertainty / error | `#c5b6e9` / `#efaaa5` |
| Decorative / interactive border | `#2d3844` / `#596a7d` |
| Smoked glass | Surface at 94% opacity, 8px blur, subtle highlight |
| Control / panel radius | 12px / 16px |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64px |
| Feedback / panel timing | 180ms / 360ms |

Text and semantic colors were numerically checked above 4.5:1 against the three base surfaces; interactive borders exceed 3:1 against the canvas and input surface. Decorative separators are not interactive boundaries. Translucent surfaces will need renewed contrast checks against the actual spatial background in future phases; this check is not a blanket accessibility certification.

Geist Sans and Geist Mono variable WOFF2 files are bundled locally under `src/assets/fonts`, sourced from the official `geist@1.7.2` package. The accompanying SIL Open Font License is retained as `LICENSE.txt`. `next/font/local` supplies local font assets and swap behavior; build and runtime do not fetch a font service. Mono is reserved for small labels; numbers use tabular figures.

Reduced motion sets feedback/panel durations to zero and removes tooltip reveal animation. Only deliberate control interactions animate. No decorative activity loop exists. Forced-color styling preserves control outlines/borders.

## Primitives

| Component | Responsibility |
| --- | --- |
| GlassPanel | Restrained reading surface; callers supply emphasis class and content |
| StatusIndicator | Text label plus decorative tone dot; never color-only meaning |
| Metric | Label, caller-supplied value, optional supporting text |
| SectionLabel | Consistent secondary hierarchy |
| CommandInput | Labeled native input; trim/reject blank values; bounded length; explicit submission callback |
| Tooltip | Targeted Radix wrapper; focus/hover support, Escape dismissal, collision handling |
| AgentStatus | Name and caller-supplied status label; no agent runtime or character |
| ConfidenceIndicator | Ordinal low/moderate/high presentation with explicit probability limitation |
| PrimaryAction / SecondaryAction | Native buttons; safe non-submit default; native disabled behavior |

The local CommandInput behavior is a presentation contract, not a finalized objective-processing protocol. AgentStatus labels and tone props do not define the canonical agent/state schemas reserved for later phases. ConfidenceIndicator neither calculates scores nor implements the Possibility Engine.

Only preview state is local: input text, feedback, and emphasis. No preview sample modifies domain state, calls tools, or claims completed research. Static agent examples and USD 500,000 are identified as samples.

## Validation

- Strict typecheck, zero-warning lint, eleven tests, and production build pass.
- Browser checks cover Enter submission, full preview reset, emphasis toggle, keyboard tooltip opening/Escape dismissal, and 2px visible keyboard focus.
- Mobile 375px and desktop 1280px layouts were inspected with no horizontal overflow; temporary viewport overrides were reset.
- Reduced-motion rules were verified in compiled browser CSS. Preference emulation and assistive-technology testing were not performed.
- No captured browser warning/error logs. No Three.js resources or animation listeners are introduced; Radix owns tooltip lifecycles.
- Production root returns 200; design-system preview returns 404. Production dependency audit reports zero vulnerabilities; existing development lint-tool advisories remain recorded in BUILD_PROGRESS.md.

Screenshot for review: `docs/previews/phase-2-design-system.png`.
