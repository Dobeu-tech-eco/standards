#!/usr/bin/env node
/**
 * check-amplitude.mjs — fair-evaluation + policy check for Amplitude instrumentation.
 * Usage: node check-amplitude.mjs <repo-path>
 * Exit 0 = pass or not-applicable (skip). Exit 1 = policy violation.
 * Policy: _standards/amplitude-instrumentation-policy.md
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repo = process.argv[2] || '.';
const problems = [];
const warnings = [];
const info = [];

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const pkgPath = join(repo, 'package.json');
if (!existsSync(pkgPath)) {
  console.log('SKIP: no package.json — not a JavaScript project. Per policy, no code changes.');
  process.exit(0);
}
const pkg = readJSON(pkgPath) || {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

// ---- classify ----
const isBrowserApp =
  !!(deps.react || deps.next || deps.vite || deps['react-dom'] || deps.svelte || deps.vue) ||
  existsSync(join(repo, 'index.html'));
const isServerOnly = !isBrowserApp && !!(deps.express || deps.fastify || deps.koa || deps.hono);

if (!isBrowserApp) {
  console.log(isServerOnly
    ? 'EVALUATE: server-only JS project. Amplitude applies only for product events via @amplitude/analytics-node. No Session Replay. Manual decision required.'
    : 'SKIP: no browser app signals (react/next/vite/index.html). Amplitude Unified SDK not applicable.');
  process.exit(0);
}

info.push('Classified as browser web app -> Amplitude Unified SDK REQUIRED by policy.');

// ---- dependency check ----
if (!deps['@amplitude/unified']) {
  problems.push('Missing dependency "@amplitude/unified" (npm install @amplitude/unified).');
}

// ---- source scan ----
const SRC_DIRS = ['src', 'app', 'pages', 'components', 'lib'].map(d => join(repo, d)).filter(existsSync);
const SERVER_DIR_RE = /(^|[\\/])(api|server|functions|worker|backend)([\\/]|$)/i;
const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const files = [];
function walk(dir, depth = 0) {
  if (depth > 6) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, depth + 1);
    else if (exts.has(name.slice(name.lastIndexOf('.')))) files.push(p);
  }
}
SRC_DIRS.forEach(d => walk(d));

const initSites = [];
const serverImports = [];
let hardcodedKey = false;

for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const rel = relative(repo, f);
  if (/\binitAll\s*\(/.test(text)) initSites.push(rel);
  if (/@amplitude\/unified/.test(text) && SERVER_DIR_RE.test(rel)) serverImports.push(rel);
  if (/initAll\s*\(\s*['"][0-9a-f]{32}['"]/.test(text)) { hardcodedKey = true; warnings.push(`Hardcoded API key in ${rel} — move to NEXT_PUBLIC_/VITE_ env var.`); }
}

if (deps['@amplitude/unified'] && initSites.length === 0) {
  problems.push('Dependency present but no initAll() call found — SDK never initialized.');
}
if (initSites.length > 1) {
  problems.push(`Multiple initAll() call sites (${initSites.join(', ')}) — policy requires exactly one initialization per app lifecycle.`);
}
if (serverImports.length > 0) {
  problems.push(`@amplitude/unified imported in server-side paths: ${serverImports.join(', ')} — client-side only.`);
}
if (initSites.length === 1) {
  const text = readFileSync(join(repo, initSites[0]), 'utf8');
  if (!/typeof\s+window/.test(text) && !/['"]use client['"]/.test(text)) {
    warnings.push(`${initSites[0]}: no 'typeof window' guard or "use client" directive — verify it cannot run server-side.`);
  }
  info.push(`initAll() found once at ${initSites[0]} ✓`);
}

// ---- report ----
info.forEach(m => console.log('INFO ', m));
warnings.forEach(m => console.log('WARN ', m));
problems.forEach(m => console.log('FAIL ', m));
if (problems.length) { console.log(`\nRESULT: FAIL (${problems.length} violation${problems.length > 1 ? 's' : ''})`); process.exit(1); }
console.log(`\nRESULT: ${deps['@amplitude/unified'] ? 'PASS' : 'ACTION REQUIRED — install per policy §3'}`);
process.exit(deps['@amplitude/unified'] ? 0 : 1);
