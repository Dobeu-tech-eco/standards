# standards — portfolio CI baseline and policy checks for Dobeu-tech-eco
Status: active · Consumers: repos under `Dobeu-tech-eco/*` and `repos\` · Ref to pin: `@v1`

## What it does

Holds one shared CI gate set so the portfolio stops maintaining 25 divergent copies of the same
workflow. Repos call `ci-baseline.yml` instead of copying it, and portfolio policy checks live
here as plain Node scripts that any repo or CI job can run against a checkout.

A 2026-09-24 sweep of 65 local repos found 25 with CI, 5 gating all four of test/lint/typecheck/
build, and 0 sharing a definition. This repo exists to close that gap without hand-editing 25
workflow files every time a gate changes.

## Stack

Plain GitHub Actions YAML and Node ESM scripts. No dependencies, no build step, no package
manager. Scripts run on any Node 18+.

## Getting started

Consume the baseline from another repo — add `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  baseline:
    uses: Dobeu-tech-eco/standards/.github/workflows/ci-baseline.yml@<40-char-sha>  # v1
```

Pin the **full commit SHA**, with the tag name as a trailing comment. A moving tag is a
mutable reference: anyone with write access here could repoint every consumer's CI at once.
Repos that enforce SHA pinning (si-agent-core does, via a test) will reject a tag ref
outright. Get the SHA with `git ls-remote https://github.com/Dobeu-tech-eco/standards 'v1^{}'` — note
the `^{}`, which dereferences the annotated tag to its commit. Without it you get the tag
object's hash, which is 40 hex characters but is not a commit and will not resolve.

The workflow detects the stack from `pyproject.toml` / `package.json` and the package manager
from the lockfile. Override any gate when detection is wrong:

```yaml
    with:
      test-cmd: ./gradlew test
      typecheck-cmd: ''        # empty = use the stack default, not "skip"; there
                                # is no real way to skip test/lint/typecheck — see
                                # ci-baseline.yml's typecheck-cmd description
      build-cmd: uv build      # python/both have no build default; set one to gate it
      enforce-amplitude: true  # default false = report only
```

Run the checks locally:

```bash
node checks/check-ci-coverage.mjs ../            # portfolio CI coverage report
node checks/check-ci-coverage.mjs ../ --json     # same, machine readable
node checks/check-amplitude.mjs ../<repo>        # Amplitude policy for one repo
```

## Scripts

| Command | What it does |
|---|---|
| `checks/check-ci-coverage.mjs [path] [--json]` | Reports which repos gate test/lint/typecheck/build in CI. Report-only, always exits 0. |
| `checks/check-amplitude.mjs <repo>` | Amplitude instrumentation policy check. Exit 1 = violation. |

## Versioning

Callers pin a **full commit SHA**, with a tag name as a trailing comment. Never pin `@main`
directly — a push here would reach every consumer with no staging step and no review.

Tags are immutable once released and **do not move**: publishing a GitHub Release on a tag
locks it against force-updates (confirmed the hard way — `git push -f origin v1` was rejected
server-side with `GH013 ... Cannot update this protected ref` after `v1`'s Release existed).
A change to this workflow ships as a **new tag** — `v1.1`, `v1.2`, and so on — never by moving
an existing one. Resolve the tag you want to a commit with:

```
git ls-remote https://github.com/Dobeu-tech-eco/standards 'v1.1^{}'
```

The `^{}` matters — without it you get the annotated tag object's hash, which is also 40 hex
characters but is not a commit and will not resolve.

## Deployment

Nothing auto-deploys. A new tag has zero effect on existing callers until each one bumps its
pinned SHA — a reviewable diff per repo (Dependabot-automatable for the `github-actions`
ecosystem), never a silent portfolio-wide push.

## Analytics

Amplitude rubric verdict: **SKIP** — no browser app, no user-facing surface. Per
`amplitude-instrumentation-policy.md`, no instrumentation applies.

## Documentation

- `amplitude-instrumentation-policy.md` — Amplitude rubric, implementation standard, env vars
- `repo-docs-standard.md` — required documentation set for every repo in the portfolio
