# Amplitude Instrumentation Policy — Fair Evaluation Standard

**Scope:** All repositories under `C:\Users\JeremyWilliams\repos`, all repos in `github.com/dobeu-tech-eco/*`, and any repo scaffolded by `/projects-init` or organized by `/agents-organizer`.
**Owner:** Jeremy Williams — Amplitude org account recorded in `amplitude-keys.local.md` (gitignored)
**Effective:** 2026-07-23 · Review annually or when Amplitude ships a major SDK version.

---

## 1. Purpose

Every repo gets a *fair, criteria-based evaluation* for Amplitude Analytics + Session Replay — neither blanket-installed everywhere nor forgotten. The evaluation runs:

- at repo scaffold time (`/projects-init`)
- during agent/workflow organization passes (`/agents-organizer`)
- on demand via the check script (`_standards/checks/check-amplitude.mjs`)

## 2. Fair Evaluation Rubric (decision matrix)

Classify the repo, then apply the row. "JS-based" means the shipped product runs JavaScript/TypeScript.

| Repo class | Signals | Verdict | SDK / approach |
|---|---|---|---|
| **Browser web app** (React, Next.js, Vite, Remix, vanilla) | `react`/`next`/`vite` in deps; `index.html` or `app/`/`pages/` | **INSTALL** | `@amplitude/unified` — Analytics autocapture + Session Replay, client-side only |
| **Static / marketing site** (Webflow, plain HTML) | No bundler; hosted builder | **INSTALL (script tag)** | Amplitude Browser snippet or Webflow custom code; Session Replay via snippet |
| **Full-stack app** (Next.js API routes, Express + SPA) | Both client and server code | **INSTALL client-side**; server events optional via `@amplitude/analytics-node` behind API routes | Unified SDK in the client root only — never in server code |
| **Server-only API / bot / worker** | Express/Fastify, no UI; whatsapp-bot, androidbackend | **EVALUATE** — install `@amplitude/analytics-node` only if it emits *product* events (user actions), not infra logs | No Session Replay (browser-only) |
| **Mobile app** | Android/iOS/React Native/Flutter | **EVALUATE** — platform SDK (Amplitude Android/iOS/RN) | Session Replay available on mobile SDKs; separate eval |
| **CLI tool / library / SDK / config repo** | dotfiles, cmder, claude-bootstrap, design tokens, agent frameworks | **SKIP** | Product analytics not applicable; do not add |
| **Non-JavaScript project** | No package.json, Python/Go/etc. | **SKIP (per project rules)** | No code changes — rule: "Do not make any code changes if this is not a JavaScript-based application" |

**Tie-breaker questions** (any "yes" → lean INSTALL): Does a human end-user interact with it in a browser? Do we need funnels/retention/replay for growth decisions? Is it customer-facing for dobeu/Foundscard growth plans?

## 3. Implementation Standard (browser apps)

Non-negotiable rules (from the Foundscard project charter):

1. **Client-side only** — code must never execute on the server (`typeof window` guard; `"use client"` in Next.js App Router).
2. **Initialize exactly once** per application lifecycle (module-level guard).
3. **JS-based apps only.**

### Canonical module — `src/lib/amplitude.client.ts`

```ts
'use client'; // Next.js App Router only — harmless elsewhere, remove for Vite

import * as amplitude from '@amplitude/unified';

let initialized = false;

export function initAmplitude(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const apiKey =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_AMPLITUDE_API_KEY) ||
    (import.meta as any)?.env?.VITE_AMPLITUDE_API_KEY;

  if (!apiKey) return; // fail open — never crash the app over analytics

  amplitude.initAll(apiKey, {
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });
}
```

Install: `npm install @amplitude/unified`
Mount: call `initAmplitude()` from the client root — Next.js App Router: a `"use client"` component imported in `app/layout.tsx`; Pages Router: `pages/_app.tsx`; Vite/CRA: `src/main.tsx` before render.

### Project keys

| Project | Browser API key | Env var |
|---|---|---|
| Foundscard.com (growth plan started 2026-07-23) | see `amplitude-keys.local.md` (gitignored) | `NEXT_PUBLIC_AMPLITUDE_API_KEY` / `VITE_AMPLITUDE_API_KEY` |
| Other repos | Create one Amplitude project per product; add row here | same |

Browser keys are publishable (not secrets), but keep them in env files for per-environment separation. Never use a server secret key in browser code.

### Session Replay sampling

- Launch / low traffic (Foundscard year 1): `sampleRate: 1` (100%).
- At scale or nearing quota: drop to `0.1–0.5`. Sample rate is a config change, not a code change.

### Taxonomy guardrails (best practice)

- Autocapture covers page views, clicks, form activity, sessions — start there; don't hand-instrument what autocapture already gives you.
- Custom events: `Object Action` naming (`Card Created`, `Checkout Completed`), Title Case, present tense; property names snake_case; document each event before shipping (tracking plan).
- Call `amplitude.setUserId()` after auth; never put PII in event properties.
- Server-side product events (payments, webhooks) → `@amplitude/analytics-node` with the same user_id to stitch identity.

## 4. Hooks, Tests & Checks

### Check script

`node _standards/checks/check-amplitude.mjs <repo-path>` — classifies the repo and, when Amplitude applies, verifies: dependency present, exactly one `initAll` call site, no `@amplitude/unified` imports under server-only dirs (`api/`, `server/`, `functions/`), and warns on hardcoded API keys. Exit 0 = pass/skip, 1 = policy violation.

### Wire-in points

- **Per-repo CI:** add `node ../_standards/checks/check-amplitude.mjs .` (or vendor the script) to the test step.
- **Ruflo hooks:** after feature work, dispatch `testgaps` worker and run the check: `npx @claude-flow/cli@latest hooks post-task --task-id amplitude-eval --success true --store-results true`.
- **/projects-init:** scaffold step must run the rubric (§2), record the verdict in the repo README or `docs/decisions/`, and when verdict = INSTALL, generate the canonical module (§3).
- **/agents-organizer:** include an `analytics-instrumentation` responsibility on the reviewer/tester agent role; the reviewer rejects PRs that add a second `init` call or move analytics server-side.

### Verification (manual, once per install)

1. `npm run dev`, open the app, click around.
2. Amplitude → Data → Sources (or the project Setup page) → confirm events arriving; check Session Replay tab for a captured session.
3. Only then ship to production.

## 5. Memory & Propagation

- Store the verdict per repo: `npx @claude-flow/cli@latest memory store --namespace patterns --key "amplitude-eval:<repo>" --value "<verdict + date>"`.
- This policy is mirrored in Cowork project memory (`amplitude_policy.md`) so future sessions apply it without re-research.
