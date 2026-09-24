# Dobeu Repo Documentation Standard (doc-gen v1)

**Scope:** every active repo — local, Dobeu-tech-eco/*, personal-account production repos. Applied by `/projects-init` at scaffold time and by doc-gen passes on existing repos. Donor reference: `new-dobeu-net/docs`.
**Effective:** 2026-07-23.

## Required set (per repo)

| File | Purpose | Minimum content |
|---|---|---|
| `README.md` | front door | skeleton below; ≥60 lines for production apps |
| `docs/ARCHITECTURE.md` | how it's built | stack, module map, data stores, external services, DDD bounded context (from /ruflo-ddd:ddd-context when generated) |
| `docs/OPERATIONS.md` | how it runs | Vercel project name + team, deploy flow (push→preview→promote), env var table (name, purpose, where set), rollback procedure, health checks |
| `.env.example` | complete env contract | every var the code reads, placeholder values only — **empty .env.example = violation** |
| `SECURITY.md` | security posture | audit cadence, dependabot SLA (merge ≤7 days), disclosure contact |
| `CHANGELOG.md` | releases | keep-a-changelog format; release commits update it |

## README skeleton (standard)

```markdown
# <name> — <one-line purpose>
Production: <URL> · Vercel: <project> · Status: <active/maintenance>

## What it does            (3-6 sentences, business language)
## Stack                   (framework, DB, auth, payments, analytics)
## Getting started         (prereqs, install, env setup, dev server — exact commands)
## Scripts                 (table: command → what it does)
## Deployment              (link to docs/OPERATIONS.md)
## Analytics               (Amplitude verdict per _standards/amplitude-instrumentation-policy.md + link)
## Documentation           (links to docs/)
```

## Rules

1. One lockfile per repo; `packageManager` field pinned. Dual lockfiles = violation.
2. Env vars documented the day they're read by code — `.env.example` drift is a review-blocker.
3. Analytics section states the Amplitude rubric verdict explicitly, even when SKIP.
4. Docs live in the repo, not in chat logs or external notes; ruflo doc-gen renders from these files, never invents content.
5. `/agents-organizer`: reviewer role rejects PRs that add env vars, routes, or services without the matching docs delta.

## Current gap list (2026-07-23 assessment)

| Repo | README | docs/ | .env.example | Priority |
|---|---|---|---|---|
| ikram-meme-and-co | 36 lines — thin | partial | **empty** | **P0** (payments live) |
| dobeutech-designsystem-weaver | **missing** | partial | missing | **P0** (deploy broken too) |
| ai-tutor | 58 lines | **missing** | empty | P1 |
| dts-contract-engine | 77 lines | good | present | P1 (add OPERATIONS) |
| statminer | 154 lines | **missing** | present | P2 |
| DOT-Copilot | 265 lines | good | present | P2 (align to skeleton) |
| new-dobeu-net | 168 lines | **donor** | present | P2 (reference) |
