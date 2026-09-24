#!/usr/bin/env node
/**
 * check-ci-coverage.mjs — portfolio sweep: which repos gate test/lint/typecheck in CI.
 * Usage: node check-ci-coverage.mjs [repos-path] [--json]
 * Always exits 0. This reports coverage; it does not assert a policy.
 * Companion to: _standards/.github/workflows/ci-baseline.yml
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || '.';
const asJson = process.argv.includes('--json');
const HOLDING_AREAS = new Set(['_staging', '_standards', '_to_delete']);

// A gate counts when CI runs it. Sources are checked in order: a ci-baseline
// caller covers everything; otherwise we read the workflow `run:` lines, then
// fall back to package.json scripts / Makefile targets those lines invoke.
const GATES = {
  test: /\b(pytest|jest|vitest|mocha|go test|cargo test|gradlew (test|check)|phpunit|rspec|(npm|pnpm|yarn)( run)? test)\b/i,
  lint: /\b(ruff|eslint|biome|clippy|golangci|ktlint|detekt|stylelint|(npm|pnpm|yarn)( run)? lint)\b/i,
  typecheck: /\b(mypy|pyright|tsc|(npm|pnpm|yarn)( run)? (typecheck|type-check))\b/i,
  build: /\b((npm|pnpm|yarn)( run)? build|uv build|go build|cargo build|gradlew (assemble|build)|docker build|next build|vite build)\b/i,
};

function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

function workflowText(repo) {
  const dir = join(repo, '.github', 'workflows');
  if (!existsSync(dir)) return { text: '', count: 0 };
  const files = readdirSync(dir).filter(f => /\.ya?ml$/i.test(f));
  return { text: files.map(f => read(join(dir, f))).join('\n'), count: files.length };
}

/** Script/target bodies the workflow could be invoking indirectly. */
function indirectText(repo, wf) {
  let out = '';
  const pkg = join(repo, 'package.json');
  if (existsSync(pkg)) {
    try {
      const scripts = JSON.parse(read(pkg)).scripts || {};
      // Only pull in scripts CI actually calls, so an unused script isn't credited.
      for (const [name, body] of Object.entries(scripts)) {
        if (new RegExp(`run ${name}\b|\b(npm|pnpm|yarn) ${name}\b`).test(wf)) out += `\n${body}`;
      }
    } catch { /* malformed package.json — treat as no scripts */ }
  }
  for (const f of ['Makefile', 'justfile', 'Justfile']) {
    if (existsSync(join(repo, f)) && /\b(make|just)\b/.test(wf)) out += `\n${read(join(repo, f))}`;
  }
  return out;
}

const repos = readdirSync(root)
  .filter(name => !HOLDING_AREAS.has(name))
  .filter(name => { try { return statSync(join(root, name)).isDirectory(); } catch { return false; } })
  .filter(name => existsSync(join(root, name, '.git')))
  .sort();

const rows = [];
for (const name of repos) {
  const repo = join(root, name);
  const { text: wf, count } = workflowText(repo);
  const baseline = /uses:\s*\S*ci-baseline\.ya?ml/i.test(wf);
  const haystack = wf + indirectText(repo, wf);
  const row = { repo: name, workflows: count, baseline };
  for (const [gate, re] of Object.entries(GATES)) {
    row[gate] = baseline || (count > 0 && re.test(haystack));
  }
  row.gates = ['test', 'lint', 'typecheck', 'build'].filter(g => row[g]).length;
  rows.push(row);
}

if (asJson) {
  console.log(JSON.stringify({ root, scanned: rows.length, repos: rows }, null, 2));
  process.exit(0);
}

const mark = b => (b ? 'yes' : '-');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('REPO', 38) + pad('WF', 4) + pad('TEST', 6) + pad('LINT', 6) + pad('TYPES', 7) + pad('BUILD', 6) + 'BASELINE');
for (const r of rows) {
  console.log(
    pad(r.repo, 38) + pad(r.workflows || '-', 4) + pad(mark(r.test), 6) +
    pad(mark(r.lint), 6) + pad(mark(r.typecheck), 7) + pad(mark(r.build), 6) + mark(r.baseline)
  );
}

const withWf = rows.filter(r => r.workflows > 0);
const full = rows.filter(r => r.gates === 4);
const onBaseline = rows.filter(r => r.baseline);
const hollow = withWf.filter(r => r.gates === 0);
console.log(`\nINFO  scanned ${rows.length} repos under ${root}`);
console.log(`INFO  ${withWf.length} have CI workflows, ${rows.length - withWf.length} have none`);
console.log(`INFO  ${full.length} gate all four (test/lint/typecheck/build)`);
console.log(`INFO  ${onBaseline.length} call the shared ci-baseline workflow`);
if (hollow.length) {
  console.log(`WARN  ${hollow.length} have workflows but no quality gate: ${hollow.map(r => r.repo).join(', ')}`);
}
console.log('\nRESULT: report only — no policy asserted, exit 0');
process.exit(0);
