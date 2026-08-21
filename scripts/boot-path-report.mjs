#!/usr/bin/env node
/**
 * Boot-path ratchet.
 * =================
 *
 * `check-entry-bundle.mjs` catches one heavy dependency falling into the boot
 * path. It cannot catch the thing that actually happens: fifty small modules
 * arriving over a fortnight, none of them individually alarming. Between 6 and
 * 21 Aug 2026 the boot path grew 408 -> 481 modules and 3,565 -> 4,368 KB of
 * source with the ceilings never once firing.
 *
 * So this walks the static import graph from `src/main.tsx` — following
 * `import x from` and `export x from`, never `await import()` or `React.lazy`,
 * because that boundary is exactly what a bundler puts in the entry chunk — and
 * compares it to a committed baseline. Growth past the tolerance fails, and the
 * failure names the modules that joined.
 *
 * It reads source, not `dist`, so it needs no build and cannot wedge a deploy.
 * Run it in CI, not in the Workers build.
 *
 *   node scripts/boot-path-report.mjs            # check against the baseline
 *   node scripts/boot-path-report.mjs --update   # accept the current graph
 *
 * Raising the baseline is a normal thing to do — a feature genuinely on the
 * first-paint path belongs there. Do it in the PR that adds the weight, so the
 * diff says who paid for what, rather than in a later tidy-up.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve as resolvePath, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ENTRY = join(SRC, 'main.tsx');
const BASELINE = join(ROOT, 'scripts', 'boot-path-baseline.json');

/** Bytes may drift a little on a dependency bump; this is not a byte budget. */
const BYTE_TOLERANCE = 0.03;

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
const ASSET = /\.(css|svg|png|jpe?g|webp|gif|avif|mp[34]|woff2?|json)$/;

/** `@/x` and `./x` only — a bare specifier is a package, not our source. */
function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolvePath(dirname(fromFile), spec);
  else return null;

  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTS) {
      const candidate = join(base, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

/** Comments first, or a commented-out import counts as a real edge. */
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// `(?!type\s)` keeps `import type { X } from` out — type-only edges vanish at
// build time, and counting them fills the report with modules that never ship.
const STATIC_EDGE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;

function walk(entry) {
  const seen = new Set();
  const stack = [entry];
  let bytes = 0;

  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    bytes += statSync(file).size;

    const code = stripComments(readFileSync(file, 'utf8'));
    STATIC_EDGE.lastIndex = 0;
    let match;
    while ((match = STATIC_EDGE.exec(code))) {
      const spec = match[1];
      if (ASSET.test(spec)) continue;
      const target = resolveSpecifier(spec, file);
      if (target && !seen.has(target)) stack.push(target);
    }
  }

  const files = [...seen]
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    .sort();
  return { modules: files.length, sourceBytes: bytes, files };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const current = walk(ENTRY);

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`boot-path baseline written: ${current.modules} modules, ${kb(current.sourceBytes)}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('No scripts/boot-path-baseline.json. Create it with --update.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const was = new Set(baseline.files);
const now = new Set(current.files);
const added = current.files.filter((f) => !was.has(f));
const removed = baseline.files.filter((f) => !now.has(f));

console.log(
  `boot path: ${current.modules} modules, ${kb(current.sourceBytes)} ` +
    `(baseline ${baseline.modules}, ${kb(baseline.sourceBytes)})`,
);
if (removed.length) console.log(`  ${removed.length} module(s) left the boot path`);

const allowedBytes = Math.round(baseline.sourceBytes * (1 + BYTE_TOLERANCE));
if (current.sourceBytes <= allowedBytes) {
  if (added.length) {
    console.log(`  ${added.length} module(s) joined, within tolerance:`);
    for (const f of added) console.log(`    + ${f}`);
  }
  process.exit(0);
}

console.error('');
console.error(
  `Boot path is ${kb(current.sourceBytes - baseline.sourceBytes)} over baseline ` +
    `(tolerance ${kb(allowedBytes - baseline.sourceBytes)}). Every byte here is ` +
    'downloaded and parsed before anything paints.',
);
console.error('');
console.error('Modules that joined the boot path:');
const sized = added
  .map((f) => ({ f, bytes: statSync(join(ROOT, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);
for (const { f, bytes } of sized) console.error(`  ${kb(bytes).padStart(7)}  ${f}`);
console.error('');
console.error(
  'Usually one static import of something only shown on demand — a modal, a ' +
    'sheet, a viewer. Reach it through `React.lazy` or `await import()`, and ' +
    'import the component directly rather than through a barrel. If the weight ' +
    'genuinely belongs on first paint, run `node scripts/boot-path-report.mjs ' +
    '--update` in this PR.',
);
process.exit(1);
