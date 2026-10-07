# MORPH production audit (testingnew v1.0), 2026-10-07

Run mode: FULL_AUDIT, one session. Environment: RUN_LOCAL_TESTS on the developer's Mac (dev server on port 3102, production build on ports 3110/3111, a bad-key copy on 3112). Destructive and load tests were allowed locally only; real AI spend was capped at a few cents (estimated USD 0.05–0.08 used: one live question, five plan calls). Nothing online was touched; nothing is deployed.

Inputs: SYSTEM_NAME MORPH. A 3D web showcase where six AI roles (one OpenAI model, `gpt-5.6-luna`) work on a decision question while the user watches; a scripted offline demo plus live questions. Users: the owner, recruiters and visitors to a showcase link. Criticality: portfolio piece, not a business system. SCALE_TARGETS: a showcase (tens of visitors at once, bursts after a LinkedIn post); no SLOs set. AI_COMPONENTS: OpenAI Chat Completions (structured JSON output) and the Responses API with built-in web search. REGULATORY_SCOPE: UAE PDPL and GDPR in principle (visitors' question text goes to OpenAI); WCAG 2.2 AA as a target. RISK_APPETITE: balanced. OUT_OF_SCOPE: hosting configuration (not deployed yet). KNOWN_ISSUES: live-AI records and limits are in server memory (one instance only); keys were pasted into a chat on 2026-10-06 and the user was told to rotate them.

## 1. Executive summary

**Verdict: ready to publish as a demo-only showcase (GO-WITH-CONDITIONS). Not ready to run live AI for the public yet.**

The audit tried to break MORPH the way an attacker or an unlucky day would: forged and cross-site requests, junk and oversized bodies, 9,000-request floods, an injected HTML/prompt-injection question against the real AI, a broken AI key, and keyboard, screen-reader and reduced-motion use. The core held: requests from other sites and malformed requests are refused in milliseconds before any AI call, AI text is only ever shown as text, sources must be web links, the call and cost limits are enforced on the server, the AI failure message is clear, and the offline demo makes no network calls.

Found and fixed in this session: one High (a huge request could make the server read hundreds of MB into memory, proven at 1 GB), three Medium/Low fixes (no browser security headers; no notice that questions go to OpenAI; a wrong failure message and two screen-reader gaps), plus the honest "Sample scenario" label on the demo.

Open, before live AI goes public: shared storage for live runs (known), a provider-side spend cap, rotating the keys that were pasted into chat, and (later) an AI test suite and a CI pipeline.

Counts (open / fixed): Critical 0/0 · High 2/1 · Medium 4/2 · Low 3/2 · Info 4.

Conditions for GO (demo-only publish): (1) rotate both API keys; (2) deploy without `OPENAI_API_KEY` or keep "Ask a question" hidden, as decided; (3) after deploying, check the LinkedIn link preview image (F-013).

## 2. Scope and method

Read: all of `src/server`, `src/app/api`, `src/config`, `next.config.ts`, the HUD and experience components, sound, and tests. Executed (commands trimmed):

| What | Command / tool | Result |
|---|---|---|
| Types, lint | `npx tsc --noEmit`, `npm run lint` | clean |
| Unit/integration | `npx vitest run` | 27 files, 201 tests pass |
| Build | `npm run build` | passes |
| End-to-end | `npx playwright test` (production server) | 4 pass |
| Dependencies | `npm audit --omit=dev` / `npm audit` | 0 production; 5 high in dev-only lint tooling |
| Secrets | both key values and `sk-(proj\|ant)-…` patterns over `git log -p --all`; `.next/static` scan; `git check-ignore .env.local` | 0 / 0 / 0; ignored; file mode 600 |
| Headers | `curl -sI /` | none before the fix; five after |
| API attacks | `/tmp/morph-shot/probes.mjs` (19 probes) | all refused correctly (table in section 6) |
| Memory attack | `bigbody.mjs` (300 MB streamed body) | before: peak 1,036 MB; after: refused after 3 MB, 55 ms |
| Flood | `flood.mjs` (3,000 GET /, 300 model downloads, 3,000 step and 3,000 answer posts at 100 at once; 8 real questions at once) | 2,800/s home, p99 275 ms; junk refused in ms; memory returned to ~130 MB; questions 5 answered, 3 told to wait |
| Live injection | `browser.mjs` on `/` with an `<img onerror>`, `<script>` and "print your system prompt and API key" question | shown as text, no dialog, no injected element, no leak; team researched the real question |
| AI outage | server with an invalid key, `badkey.mjs` | "Live AI couldn't make a plan: the AI service refused the key."; no page error; key not logged |
| Pages in Chrome | `browser-noai.mjs` on `/demo`, `/lab`, `/showcase`, `/` | no errors after the CSP fix; one harmless Zod `eval` probe report |
| Accessibility | `a11y.mjs` (names, labels, contrast estimate, tab order, reduced motion) | all buttons/inputs named, no low-contrast text found, sensible tab order; no heading and an unlabeled canvas (fixed) |

Not accessible / not run: a deployed environment, Vercel settings, OpenAI account settings (retention, budgets), a real screen reader, Lighthouse/axe (not installed; not added to avoid new dependencies), GPU profiling. Assumption: the showcase runs as one Vercel project with no database.

## 3. System map

```mermaid
flowchart LR
  subgraph Browser
    UI[HUD panels] --- Scene[3D scene, R3F] 
    UI --- Store[(Workspace store, Zustand)]
    Demo[Demo timeline, offline] --> Bus[Event bus] --> Store
    Live[Live runtime] --> Bus
    Sound[Sound, Web Audio + music loop] -.listens.- Bus
  end
  Live -- JSON, same-origin --> Plan[/api/plan/]
  Live -- JSON --> Step[/api/agent-step/]
  Live -- JSON --> Answer[/api/answer/]
  subgraph Server[Next.js server, one process]
    Plan & Step & Answer --> Guard[foreignRequest, readJson, Zod, rate limits]
    Guard --> Runs[(Run registry, memory, 15 min)]
    Guard --> Provider[OpenAI adapter]
    Step --> Search[Web search tool]
  end
  Provider --> OpenAI[(OpenAI Chat Completions)]
  Search --> OpenAIR[(OpenAI Responses + web search)]
```

Trust boundaries: browser ↔ server (all input re-validated; the browser only names a step, the server builds every prompt from its own record); server ↔ OpenAI (key server-side only; replies validated with Zod); web pages ↔ model (page text is data; only search-returned http(s) URLs become sources). Data flow: the question text and the visitor's slider/choice answers go to OpenAI; nothing is written to disk or a database; run records live in memory for 15 minutes; logs carry step names and reasons, never the question or answers. Critical journeys: (1) watch the offline demo; (2) answer the demo's budget question; (3) ask a live question and watch it; (4) answer Nova's live questions; (5) recover from an AI failure; (6) view on a phone; (7) record the showcase.

## 4. Domain scorecard

| Domain | Maturity | PASS | PARTIAL | FAIL | N/A | UNVERIFIABLE | Rationale |
|---|---|---|---|---|---|---|---|
| D1 Architecture | 3 | 4 | 3 | 0 | 0 | 1 | Clear layers, lint-enforced; live state in memory only |
| D2 Frontend | 3 | 6 | 3 | 0 | 2 | 0 | Strong states and fallbacks; CSP needs inline scripts |
| D3 Backend/APIs | 3 | 7 | 2 | 0 | 2 | 0 | Validation and limits solid; memory limits per instance |
| D4 Data | n/a | 0 | 1 | 0 | 10 | 0 | No database; in-memory records only |
| D5 Messaging | n/a | 0 | 0 | 0 | 6 | 0 | No broker or queue |
| D6 AI/LLM | 3 | 7 | 5 | 1 | 3 | 0 | Strict output, caps, honest labels; no eval suite |
| D7 Security | 3 | 5 | 3 | 0 | 2 | 1 | Same-origin JSON, no secrets in code/history; keys need rotating |
| D8 Privacy | 2 | 2 | 3 | 0 | 1 | 1 | Notice added; no retention settings verified at OpenAI |
| D9 Reliability | 2 | 2 | 3 | 1 | 2 | 0 | Good degradation; no SLOs, single instance |
| D10 Performance | 3 | 3 | 3 | 0 | 1 | 0 | Flood and soak fine; no formal targets per endpoint |
| D11 Observability | 1 | 0 | 2 | 3 | 0 | 2 | Console warnings only |
| D12 Infrastructure | n/a | 0 | 1 | 0 | 5 | 1 | Not deployed; Vercel planned |
| D13 CI/CD | 1 | 0 | 2 | 2 | 2 | 1 | Gates exist but run by hand |
| D14 Testing | 3 | 5 | 4 | 1 | 2 | 0 | 201 unit/integration, 3 e2e; no AI evals or a11y automation |
| D15 Code quality | 4 | 5 | 2 | 0 | 0 | 0 | Strict TS, no suppressions; one large file |
| D16 Operations | 1 | 1 | 1 | 1 | 2 | 0 | Progress doc and audits; no runbooks |
| D17 Cost | 3 | 2 | 1 | 1 | 0 | 0 | Per-question caps and tracking; no account budget |
| D18 Product logic | 3 | 3 | 1 | 0 | 3 | 0 | Invariants tested; long/unicode input OK |

## 5. Findings

### [F-001] A huge request body was read fully into memory before being refused (FIXED)
Check(s): D3.3, D3.6, D9.6   Severity: High   Likelihood: Possible   Confidence: Verified   Type: defect
Evidence: `src/server/http.ts` `readJson` used `request.text()` and checked the length afterwards. `bigbody.mjs`: 300 MB streamed to `/api/answer` → 413 after 624 ms, server memory 60 → 1,036 MB.
Impact: a handful of such requests could crash the server for everyone (Vercel's 4.5 MB request cap limits this online, other hosts don't).
Recommendation (done): read the stream with a byte cap and cancel it past the limit (`readCapped`).
Effort: S. Verification test: `src/server/http.test.ts` "stops reading an undeclared huge body at the limit" (fewer than 5 chunks pulled); rerun of `bigbody.mjs` → refused after 3 MB in 55 ms.

### [F-002] Live AI depends on one server's memory (OPEN, known)
Check(s): D1.3, D1.5, D3.8, D9.4   Severity: High (for public live AI); not applicable to a demo-only publish   Likelihood: Likely on Vercel   Confidence: High
Evidence: `src/server/run-registry.ts` (in-memory `Map`, 15-minute TTL), `src/server/rate-limit.ts` (per process), `src/server/live-services.ts` (`globalThis`).
Problem: on serverless hosting a live question's later steps can land on another instance that doesn't know the run ("this question has expired"), and every instance has its own rate and spending counters, multiplying the caps.
Recommendation: before enabling live AI publicly, move runs and limits to one shared store (for example Upstash Redis through the Vercel Marketplace); needs the user's decision. Effort: M.
Verification test: an integration test with two registry instances sharing a store; a deployed run of one full live question.

### [F-003] API keys exposed in a chat must be rotated (OPEN)
Check(s): D7.7, S10   Severity: High   Likelihood: Possible   Confidence: High (user-reported on 2026-10-06)
Evidence: progress notes; rotation not confirmed. Git history and build contain neither key (scans above).
Recommendation: revoke and recreate both keys in the OpenAI and Anthropic dashboards, update `.env.local`, and add the new key to Vercel only when live AI is enabled. Effort: S.
Verification: old key returns 401 (`curl` with the old key against `/v1/models`).

### [F-004] No browser security headers (FIXED)
Check(s): D2.5, D7.5   Severity: Medium   Likelihood: Possible   Confidence: Verified
Evidence: `curl -sI /` returned none of CSP, frame-ancestors, nosniff, referrer or permissions policy.
Impact: the site could be framed by another page (clickjacking) and had no second line of defence against injected scripts.
Recommendation (done): production headers in `next.config.ts`: a CSP limited to MORPH's own files (with `'wasm-unsafe-eval'` for the model decoder and `'unsafe-inline'` for Next.js's static bootstrap), `frame-ancestors 'none'`, nosniff, a referrer policy, a permissions policy and HSTS. The first version of the policy blocked the characters' WebAssembly decoder; found in Chrome and fixed before commit.
Verification test: the e2e flagship test now asserts the CSP and nosniff headers and still requires zero page errors.

### [F-005] No account-level spending cap (OPEN)
Check(s): D6.10, D17.4   Severity: Medium   Likelihood: Possible   Confidence: High
Evidence: per-question cap USD 0.10 and 30 calls (`LIVE_LIMITS`), 60 questions per hour per server (`live-services.ts`); worst case about USD 6 per hour per instance, unbounded across instances or days.
Recommendation: set a monthly budget and hard limit on the OpenAI project; optionally a daily cap in the shared store from F-002. Effort: S.
Verification: OpenAI dashboard shows the limit; a test that the server refuses plans once a daily total is reached.

### [F-006] The shared hourly limit can be used up by one determined visitor (OPEN, accepted for a showcase)
Check(s): D3.8, D9.3   Severity: Medium   Likelihood: Unlikely   Confidence: High
Evidence: `createRateLimiter` global window (60 plans/hour); per-visitor 5/minute. Someone with many addresses could take all 60, and real visitors then see "Too many questions just now".
Recommendation: acceptable for a portfolio; if live AI becomes popular, add bot protection (Vercel BotID or Firewall rate rules) in front of `/api/plan`. Effort: S–M.
Verification: flood test with rotating `x-real-ip` behind a trusted proxy shows refusals for the flood but not for a fresh visitor.

### [F-007] Visitors weren't told their question goes to OpenAI (FIXED)
Check(s): D8.2, D6.15, D6.12   Severity: Medium   Likelihood: Likely   Confidence: Verified
Evidence: no notice anywhere in the UI (grep for OpenAI/privacy in `src/visualization`, `src/app`).
Recommendation (done): a line above the question box (below it on phones), linked to the input with `aria-describedby`: "Your question is sent to OpenAI to be answered. Please leave out personal or confidential details." Still open: confirm the OpenAI project's data-retention setting.
Verification test: e2e "each page offers what it is for" asserts the notice is visible.

### [F-008] No AI evaluation or red-team suite (OPEN)
Check(s): D6.6, D6.8, D14.8   Severity: Medium   Likelihood: Possible   Confidence: High
Evidence: tests use fake providers; prompt behaviour is checked by hand (one manual injection run passed today).
Impact: a model or prompt change could quietly lower plan quality or weaken injection resistance.
Recommendation: a small versioned set (10–20 questions: normal, vague, factual, injection, non-English) run on demand with a budget cap, checking schema validity, sourced claims and refusal of instructions in the question. Effort: M. Needs the user's approval for the spend.
Verification: the suite fails if any injection case's output contains the system prompt or follows the injected instruction.

### [F-009] No CI pipeline (OPEN)
Check(s): D13.1, D13.2, D7.11   Severity: Medium   Likelihood: Likely (as the project grows)   Confidence: Verified
Evidence: no workflow files; the repository is local only.
Recommendation: when a remote is approved, run typecheck, lint, unit tests, build, e2e, `npm audit --omit=dev` and a secret scan on every push. Effort: S.

### [F-010] The fallback screen blamed a "graphics card reset" for every 3D failure (FIXED)
Check(s): D2.4   Severity: Low   Confidence: Verified (seen when the first CSP blocked the models)
Evidence: `lab-experience.tsx`: unmounting a crashed scene fires a context-lost event that overwrote "crashed".
Recommendation (done): the first cause is kept. Verification: break model loading (CSP without wasm) → message reads "The 3D deck hit an error…".

### [F-011] No page heading and an unlabeled 3D canvas for screen readers (FIXED)
Check(s): D2.6   Severity: Low   Confidence: Verified (`a11y.mjs`: `h1: 0`, canvas "(no label)")
Recommendation (done): the wordmark is a level-1 heading; the 3D area is described as an image only while it is shown, so the "Try the 3D deck again" button stays reachable.

### [F-012] Dev-only tooling advisory (OPEN)
Check(s): D7.8, D15.4   Severity: Low   Confidence: Verified (`npm audit`: braces via `eslint-config-next`, 5 high, dev only, not in the shipped app). Recommendation: update when `eslint-config-next` ships a fixed range; don't force-downgrade.

### [F-013] Social preview base URL not set (OPEN)
Check(s): D2.1   Severity: Low   Confidence: Medium
Evidence: `next start` warns that `metadataBase` is unset. On Vercel, Next.js falls back to the production URL, so the LinkedIn preview should work there; elsewhere it would point to localhost.
Recommendation: after deploying, check the preview with LinkedIn's Post Inspector; set `metadataBase` if a custom domain is used.

### [F-014] Errors are only console warnings (OPEN)
Check(s): D11.1–D11.6   Severity: Low   Confidence: High
Evidence: two `console.warn` calls in the handlers; no error tracking or uptime check.
Recommendation: when published, turn on Vercel's built-in logs and add an uptime check on `/demo`; error tracking only if live AI goes public.

Info: (a) CSP keeps `'unsafe-inline'` for scripts because the static pages carry Next.js's inline bootstrap without a nonce; nonces would force every page to be rendered per request. (b) Zod tries `Function("")` once to decide whether it may compile validators; the CSP refuses it and Zod uses its normal path (reported, harmless). (c) `/` is prerendered, so whether it opens on "Ask a question" or the demo is decided at build time by whether a key is present; rebuild after adding a key. (d) Frame rate read 30 FPS in this session on both servers under machine load (the automatic step to Balanced worked); 60 FPS was measured earlier the same day.

## 6. Adversarial scenarios

| ID | Expected | Actual / predicted | Evidence | Gaps | Verification |
|---|---|---|---|---|---|
| S1 DB failover | — | N/A: no database | — | — | — |
| S2 AZ/region loss | Static demo stays up | Predicted: Vercel serves static pages from its edge; live AI down with its region | not deployed | No multi-region for functions | Check after deploy |
| S3 Provider 5xx, then bad quality | Clear message; bad output refused | Bad key → clear message, no crash (run); malformed output is refused by Zod (unit tests); subtly worse but valid output is not detected | `badkey.mjs`; `openai.test.ts` | No eval (F-008) | Eval suite |
| S4 10x latency, rate limits | Timeouts, clear wait message | Each call times out at 58 s; 429 → "busy or out of credit"; 4 tasks at once at most | `live-services.ts`, `LIVE_LIMITS` | No backoff retry for 429 (one retry per task by design) | Fake provider with delays (existing tests cover timeouts) |
| S5 Instructions hidden in a web page | Treated as data | Search instructions say page text is data; results are Zod-checked and shown as text; only search-returned http(s) URLs become links | `web-search.ts` INSTRUCTIONS, `cleanUrl`; direct-injection run passed | Indirect injection not tested live | Eval case with a planted page |
| S6 Swap an object ID | Can't reach another run | Run IDs are random UUIDs; no accounts or tenants; a wrong ID gets 404 | probes "unknown run id" | Anyone holding a run ID can drive it (capability by design) | — |
| S7 10x spike in 60 s | Stays up, limits apply | 9,300 requests in about 4 s; home p99 275 ms; junk refused; memory recovered | `flood.mjs` | Per-instance limits (F-002) | Rerun on staging |
| S8 Queue backlog | — | N/A: no queue | — | — | — |
| S9 Cache flush | — | N/A: no cache; restart loses live runs (users are told to ask again) | `run-registry.ts` | F-002 | — |
| S10 Leaked credential | Rotate fast | Keys were exposed in chat; rotation not yet confirmed | F-003 | Rotation | 401 with old key |
| S11 Compromised dependency | Pinned versions, review | Exact versions pinned and lockfile committed; no automated SCA in CI | `package.json`, F-009 | CI audit | `npm audit` in CI |
| S12 Bad deploy | Roll back | Predicted: Vercel instant rollback; no migrations exist | — | Not rehearsed | Roll back once after first deploy |
| S13 Clock skew | No wrong ordering | Single process clock for limits; event order uses sequence numbers, not wall time | `events/bus` (`seq`) | — | — |
| S14 Endless agent loop | Stopped | Hard stops: 30 calls, USD 0.10, 2 retries per task, 60 s per task, server-enforced | `run-registry.ts` `refuse`; `step-handler.test.ts` | — | Existing tests |
| S15 Webhook replay | — | N/A: no webhooks | — | — | — |
| S16 Disk fills with logs | — | Two short warnings per failure; nothing written to disk | handlers | — | — |
| S17 TLS expiry | Auto-renewed | Predicted: Vercel-managed certificates; HSTS header added | `next.config.ts` | Not deployed | Check after deploy |
| S18 DNS failure | Clear message | Unreachable provider → "couldn't reach the AI service"; demo unaffected | `openai.ts` | — | Unit test with failing fetch (exists) |
| S19 Deletion request | Nothing kept | MORPH stores nothing beyond 15 minutes in memory; OpenAI's retention depends on account settings | `run-registry.ts` TTL | Confirm OpenAI retention | Account settings |
| S20 Corrupted data for 6 h | — | N/A: no stored data | — | — | — |
| S21 Insider bulk export | — | N/A: no customer data or admin tools; `/dev/*` return 404 in production | probes | — | e2e asserts `/dev/*` 404 |
| S22 Embedding model deprecated | — | N/A: no embeddings; the chat model is set by `MORPH_PLANNER_MODEL` | `environment.ts` | Model deprecation needs a config change | — |
| S23 Feature-flag service down | — | N/A: no flag service | — | — | — |
| S24 Old client after a deploy | Clear recovery | A tab open across a deploy sends steps for an unknown run → "this question has expired; ask it again" | probes | — | — |

API probe results (production build): text/plain 415 · form post 415 · cross-site 403 · forged origin 403 · bad JSON 400 · extra field 400 · too short 400 · 10 KB 413 · 5 MB chunked 413 · wrong type 400 · GET 405 · unknown run 404 · path-like run ID 400 · unknown step kind 400 · unknown run answer 404 · negative index 400 · `__proto__` body 400 · `/dev/operations` 404 · static folder listing 404.

## 7. Coverage matrix

Status per check (P = PASS, Pa = PARTIAL, F = FAIL, N = N/A, U = UNVERIFIABLE). Finding IDs in brackets.

| Domain | Statuses |
|---|---|
| D1 | 1.1 P · 1.2 Pa (no quantified SLOs) · 1.3 Pa [F-002] · 1.4 P · 1.5 Pa [F-002] · 1.6 P (demo independent of AI) · 1.7 P (versioned event schema) · 1.8 U (no exit plan written; adapter is replaceable) |
| D2 | 2.1 P · 2.2 P (aborts stale live requests) · 2.3 Pa (no bundle budget) · 2.4 P [F-010 fixed] · 2.5 Pa [F-004 fixed; inline scripts] · 2.6 Pa [F-011 fixed; no real screen-reader pass] · 2.7 N (English only) · 2.8 Pa (Chrome only tested) · 2.9 N (web only) · 2.10 P (no analytics) · 2.11 P |
| D3 | 3.1 P · 3.2 N · 3.3 P [F-001 fixed] · 3.4 P · 3.5 P · 3.6 Pa (per-instance memory) · 3.7 N · 3.8 Pa [F-006] · 3.9 P (timeouts, no webhooks) · 3.10 P (Zod env, fail fast) · 3.11 P (stateless apart from F-002) |
| D4 | 4.1–4.8 N (no database, cache store, search, object storage or pipelines; 4.5 N) · 4.9 Pa (15-min memory only) · 4.10 N · 4.11 N |
| D5 | 5.1–5.6 N |
| D6 | 6.1 P (one adapter, model from config) · 6.2 Pa (prompts in code, delimited; no eval gate) · 6.3 P (strict JSON schema + Zod) · 6.4 N (no RAG) · 6.5 P (one read-only tool, caps) · 6.6 F [F-008] · 6.7 Pa (sources linked, unverified labelled; no automated check) · 6.8 Pa (manual direct-injection pass) · 6.9 Pa (timeouts, no fallback provider) · 6.10 P (per-call cost tracked, caps) · 6.11 Pa (usage in replies; no tracing) · 6.12 Pa [F-007] · 6.13 N · 6.14 N · 6.15 P (scores labelled as AI assessments; human answers questions) |
| D7 | 7.1 Pa (no written threat model; this audit acts as one) · 7.2 N (no accounts) · 7.3 P (capability run IDs; no tenants) · 7.4 P (no SQL/shell/templates; probes) · 7.5 P [F-004 fixed] · 7.6 U (TLS by host) · 7.7 Pa [F-003] · 7.8 P (pinned, lockfile) · 7.9 N (managed hosting) · 7.10 Pa (warnings only) · 7.11 Pa [F-009] |
| D8 | 8.1 P (this report's data flow) · 8.2 Pa [F-007 fixed] · 8.3 P (nothing stored) · 8.4 P (15-min TTL) · 8.5 U (OpenAI region/retention) · 8.6 N · 8.7 Pa |
| D9 | 9.1 F (no SLOs) · 9.2 P (AI down → demo still works) · 9.3 Pa (timeouts, caps; no circuit breaker) · 9.4 Pa [F-002] · 9.5 N (no data) · 9.6 Pa [F-001 fixed] · 9.7 N · 9.8 P (failure drills run in this audit) |
| D10 | 10.1 Pa (FPS targets only) · 10.2 Pa (local flood, no staging) · 10.3 Pa (soak earlier, no CPU profile today) · 10.4 P · 10.5 N · 10.6 P (p99 measured) · 10.7 Pa (first to break: per-instance limits) |
| D11 | 11.1 Pa (no PII in logs) · 11.2 F · 11.3 F · 11.4 F · 11.5 U · 11.6 U · 11.7 Pa [F-014] |
| D12 | 12.1 N · 12.2 Pa (no staging) · 12.3 N · 12.4 N · 12.5 U · 12.6 N · 12.7 N |
| D13 | 13.1 F [F-009] · 13.2 Pa (gates exist, run by hand) · 13.3 Pa · 13.4 U · 13.5 N · 13.6 N · 13.7 F |
| D14 | 14.1 P · 14.2 P · 14.3 Pa (fakes for OpenAI) · 14.4 Pa (Zod contracts, no provider contract test) · 14.5 P · 14.6 N · 14.7 Pa (manual load/a11y) · 14.8 F [F-008] · 14.9 P · 14.10 P (no flakes seen) · 14.11 N · 14.12 Pa |
| D15 | 15.1 Pa (`live-question.ts` ~670 lines) · 15.2 P · 15.3 P · 15.4 Pa [F-012] · 15.5 Pa (single owner) · 15.6 P · 15.7 P |
| D16 | 16.1 F (no runbooks) · 16.2 N · 16.3 N · 16.4 P (progress doc, audits) · 16.5 Pa (`/dev` pages 404 in production) |
| D17 | 17.1 P · 17.2 P (cost per question) · 17.3 Pa · 17.4 F [F-005] |
| D18 | 18.1 P · 18.2 P (limits tested) · 18.3 Pa (long and unicode input handled; no fuzzing) · 18.4 N · 18.5 N · 18.6 P · 18.7 N |

## 8. Test plan

| ID | Type | Target | Expected | Priority | Location |
|---|---|---|---|---|---|
| T1 | unit | `readJson` caps streamed bodies | ≤ 5 chunks read, 413 | done | `src/server/http.test.ts` |
| T2 | e2e | security headers + zero page errors | CSP and nosniff present; no errors | done | `tests/e2e/flagship-demo.spec.ts` |
| T3 | e2e | privacy notice and sample label | visible | done | same |
| T4 | e2e | `/dev/*` hidden in production | 404 | done | same |
| T5 | eval | 15 live questions incl. 4 injections, budget-capped | valid plans; no instruction following; no prompt text | High | `tests/eval/` (new, needs approval) |
| T6 | integration | two registries sharing a store | a run opened on one is served by the other | High (with F-002) | `src/server/run-registry.test.ts` |
| T7 | security | old key after rotation | 401 | High | manual |
| T8 | load | staging flood with rotating addresses | flood refused, fresh visitor served | Medium | `tests/load/` |
| T9 | a11y | axe-core on `/`, `/demo` | no serious violations | Medium | e2e (needs a dev dependency) |
| T10 | e2e | answer flow on a live run with a fake provider | answer recorded, review waits | Medium | e2e with a mock server |

Runnable code for T4:

```ts
test("development pages are hidden in production", async ({ request }) => {
  for (const path of ["/dev/operations", "/dev/modules", "/dev/models", "/dev/design-system"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
```

## 9. Remediation roadmap

- NOW (before the LinkedIn post): rotate both keys (F-003); publish demo-only; check the link preview (F-013); set an OpenAI budget even before live AI (F-005).
- NEXT (before public live AI): shared store for runs and limits (F-002, needs a decision), then a daily spend cap (F-005) and bot protection (F-006); a small eval suite (F-008); CI when a remote exists (F-009).
- LATER: error tracking and an uptime check (F-014); axe in e2e (T9); split `live-question.ts`; update lint tooling (F-012).

## 10. Open questions and evidence requests

- OpenAI project: data-retention setting and region (D8.5, D6.12): the owner's OpenAI dashboard.
- Key rotation done? (F-003): the owner.
- Hosting: Vercel project settings, TLS, logs (D7.6, D11.5, D12.5): available after the first deploy.
- Real screen-reader pass (VoiceOver) on `/demo` (D2.6): a manual session.

Checkpoint: all 18 domains and 24 scenarios have a status; nothing remains for a later session.
