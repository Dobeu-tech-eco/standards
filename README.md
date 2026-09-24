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
    uses: Dobeu-tech-eco/standards/.github/workflows/ci-baseline.yml@v1
```

The workflow detects the stack from `pyproject.toml` / `package.json` and the package manager
from the lockfile. Override any gate when detection is wrong:

```yaml
    with:
      test-cmd: ./gradlew test
      typecheck-cmd: ''        # empty string skips the gate
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

Callers pin `@v1`, a moving tag. Never publish a caller stub pinned to `@main` — every push here
would reach every consumer with no staging step. Move `v1` only after the change is green on a
pilot repo.

## Deployment

Nothing deploys. Changes take effect for consumers when the `v1` tag moves.

## Analytics

Amplitude rubric verdict: **SKIP** — no browser app, no user-facing surface. Per
`amplitude-instrumentation-policy.md`, no instrumentation applies.

## Documentation

- `amplitude-instrumentation-policy.md` — Amplitude rubric, implementation standard, env vars
- `repo-docs-standard.md` — required documentation set for every repo in the portfolio
