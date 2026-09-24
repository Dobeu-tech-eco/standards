#!/usr/bin/env node
/**
 * check-ci-coverage.mjs — sweep: which repos gate test/lint/typecheck/build in CI.
 *
 * Usage:
 *   node check-ci-coverage.mjs [repos-path] [--json]   scan a local directory of clones
 *   node check-ci-coverage.mjs --org <name> [--json]   scan a GitHub org (needs GITHUB_TOKEN)
 *
 * Always exits 0. This reports coverage; it does not assert a policy.
 * The two modes do not see the same set: local mode sees clones that were never
 * pushed, org mode sees repos that were never cloned. Expect the totals to differ.
 * Companion to: .github/workflows/ci-baseline.yml
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const orgFlag = args.indexOf('--org');
const org = orgFlag === -1 ? null : args[orgFlag + 1];
const root = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--org') || '.';
const HOLDING_AREAS = new Set(['_staging', '_standards', '_to_delete']);

// A gate counts when CI runs it. A ci-baseline caller covers everything; otherwise
// we read the workflow text, then the package.json scripts / Makefile targets it
// invokes.
const GATES = {
  test: /\b(pytest|jest|vitest|mocha|go test|cargo test|gradlew (test|check)|phpunit|rspec|(npm|pnpm|yarn)( run)? test)\b/i,
  lint: /\b(ruff|eslint|biome|clippy|golangci|ktlint|detekt|stylelint|(npm|pnpm|yarn)( run)? lint)\b/i,
  typecheck: /\b(mypy|pyright|tsc|(npm|pnpm|yarn)( run)? (typecheck|type-check))\b/i,
  build: /\b((npm|pnpm|yarn)( run)? build|uv build|go build|cargo build|gradlew (assemble|build)|docker build|next build|vite build)\b/i,
};

/** Drop whole-line YAML comments so a documented example is not read as a gate. */
function stripComments(text) {
  return text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
}

/** Score one repo from its workflow text plus any indirectly invoked script bodies. */
function evaluate(name, workflowText, indirectText, workflowCount) {
  const code = stripComments(workflowText);
  const baseline = /uses:\s*\S*ci-baseline\.ya?ml/i.test(code);
  const haystack = code + indirectText;
  // A baseline caller can be trusted for test/lint/typecheck unconditionally:
  // ci-baseline.yml has a real default for each on every supported stack, so
  // adopting it means the gate runs (or SKIPs with a visible line) regardless
  // of what the repo looks like. Build is NOT like that — python|both has no
  // default at all, and node only runs it if package.json declares a "build"
  // script. Crediting `baseline` for build unconditionally overstates every
  // caller that doesn't happen to have one, so build still needs its own
  // evidence from the workflow/script text even when baseline is true.
  const row = { repo: name, workflows: workflowCount, baseline };
  for (const [gate, re] of Object.entries(GATES)) {
    const trustBaseline = baseline && gate !== 'build';
    row[gate] = trustBaseline || (workflowCount > 0 && re.test(haystack));
  }
  row.gates = ['test', 'lint', 'typecheck', 'build'].filter(g => row[g]).length;
  return row;
}

function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

/** Script/target bodies the workflow could be invoking indirectly. */
function indirectLocal(repo, wf) {
  let out = '';
  const pkg = join(repo, 'package.json');
  if (existsSync(pkg)) {
    try {
      const scripts = JSON.parse(read(pkg)).scripts || {};
      for (const [name, body] of Object.entries(scripts)) {
        if (new RegExp(`run ${name}\\b|\\b(npm|pnpm|yarn) ${name}\\b`).test(wf)) out += `\n${body}`;
      }
    } catch { /* malformed package.json, treat as no scripts */ }
  }
  for (const f of ['Makefile', 'justfile', 'Justfile']) {
    if (existsSync(join(repo, f)) && /\b(make|just)\b/.test(wf)) out += `\n${read(join(repo, f))}`;
  }
  return out;
}

function scanLocal(dir) {
  const names = readdirSync(dir)
    .filter(n => !HOLDING_AREAS.has(n))
    .filter(n => { try { return statSync(join(dir, n)).isDirectory(); } catch { return false; } })
    .filter(n => existsSync(join(dir, n, '.git')))
    .sort();
  return names.map(name => {
    const repo = join(dir, name);
    const wfDir = join(repo, '.github', 'workflows');
    let text = '';
    let count = 0;
    if (existsSync(wfDir)) {
      const files = readdirSync(wfDir).filter(f => /\.ya?ml$/i.test(f));
      count = files.length;
      text = files.map(f => read(join(wfDir, f))).join('\n');
    }
    return evaluate(name, text, indirectLocal(repo, text), count);
  });
}

const API = 'https://api.github.com';

async function gh(path) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('org mode needs GITHUB_TOKEN or GH_TOKEN in the environment');
  const res = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dobeu-standards-ci-coverage',
    },
  });
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error('GitHub API rate limit or permission denied');
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return res.json();
}

async function scanOrg(orgName) {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/orgs/${orgName}/repos?per_page=100&page=${page}&type=all`);
    if (!batch || batch.length === 0) break;
    repos.push(...batch.filter(r => !r.archived));
    if (batch.length < 100) break;
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));

  const rows = [];
  for (const r of repos) {
    const listing = await gh(`/repos/${orgName}/${r.name}/contents/.github/workflows`);
    if (!listing || !Array.isArray(listing)) {
      rows.push(evaluate(r.name, '', '', 0));
      continue;
    }
    const files = listing.filter(f => f.type === 'file' && /\.ya?ml$/i.test(f.name));
    const texts = [];
    for (const f of files) {
      const blob = await gh(`/repos/${orgName}/${r.name}/contents/${f.path}`);
      if (blob && blob.content) texts.push(Buffer.from(blob.content, 'base64').toString('utf8'));
    }
    // Indirect lookup is filesystem-only, so a repo whose gates hide behind a
    // package.json script may under-report in org mode.
    rows.push(evaluate(r.name, texts.join('\n'), '', files.length));
  }
  return rows;
}

function report(rows, source) {
  if (asJson) {
    console.log(JSON.stringify({ source, scanned: rows.length, repos: rows }, null, 2));
    return;
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
  console.log(`\nINFO  scanned ${rows.length} repos (${source})`);
  console.log(`INFO  ${withWf.length} have CI workflows, ${rows.length - withWf.length} have none`);
  console.log(`INFO  ${full.length} gate all four (test/lint/typecheck/build)`);
  console.log(`INFO  ${onBaseline.length} call the shared ci-baseline workflow`);
  if (hollow.length) {
    console.log(`WARN  ${hollow.length} have workflows but no quality gate: ${hollow.map(r => r.repo).join(', ')}`);
  }
  console.log('\nRESULT: report only, no policy asserted, exit 0');
}

try {
  report(org ? await scanOrg(org) : scanLocal(root), org ? `github.com/${org}` : root);
} catch (error) {
  console.log(`WARN  sweep could not complete: ${error.message}`);
  console.log('\nRESULT: report only, no policy asserted, exit 0');
}
process.exit(0);
