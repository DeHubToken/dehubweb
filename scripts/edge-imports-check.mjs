#!/usr/bin/env node
/**
 * Every import in supabase/functions must resolve.
 *
 * Nothing else in CI looks at these files. `tsc` is aimed at `src` through
 * tsconfig.app.json, vitest never loads them, and edge-cors-check.mjs only
 * reads the header lists a function declares — so a function whose import
 * cannot resolve passes every gate and then fails at module load, returning a
 * boot error on every request with no build ever having gone red.
 *
 * That is not hypothetical. `preview-transactional-email` shipped importing
 * `npm:@supabase/supabase-js@2/cors`, a subpath that does not exist: the
 * package exports `.`, `./dist/*` and `./package.json` and nothing else. Deno
 * resolves npm specifiers through the exports map, so the function could never
 * have started.
 *
 * Two things are checked, both cheap and both offline:
 *
 * - a relative specifier names a file that is actually there
 * - an `npm:` subpath is one the installed package's exports map admits
 *
 * Bare npm packages with no subpath are skipped — the version is pinned in the
 * specifier and resolved at deploy time, so there is nothing to compare
 * against here. Packages absent from node_modules are skipped too, for the
 * same reason: a missing local copy is not evidence of a bad import.
 *
 * Deliberately dependency-free (node builtins, no install), like
 * scripts/edge-cors-check.mjs and scripts/i18n-coverage.mjs, so it stays a ~2s
 * CI job immune to lockfile drift.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = 'supabase/functions';
const MODULES = 'node_modules';

const posix = (p) => p.split('\\').join('/');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g;

/** Splits `npm:@scope/pkg@2/sub/path` into its package name and subpath. */
function parseNpmSpecifier(spec) {
  const rest = spec.slice('npm:'.length);
  const parts = rest.split('/');
  const scoped = rest.startsWith('@');
  let name = scoped ? parts.slice(0, 2).join('/') : parts[0];
  const sub = parts.slice(scoped ? 2 : 1).join('/');
  // Strip the version range: `react@18.3.1` -> `react`, `@scope/p@2` -> `@scope/p`.
  const at = name.lastIndexOf('@');
  if (at > 0) name = name.slice(0, at);
  return { name, sub };
}

/** Does an exports map admit `./<sub>`? Handles the `*` wildcard form. */
function exportsAdmit(map, sub) {
  const wanted = './' + sub;
  return Object.keys(map).some((key) => {
    if (key === wanted) return true;
    if (!key.includes('*')) return false;
    const pattern = key
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp('^' + pattern + '$').test(wanted);
  });
}

const failures = [];
let checked = 0;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const match of src.matchAll(IMPORT)) {
    const spec = match[1];
    const at = () => `${posix(file)}:${src.slice(0, match.index).split('\n').length + 1}`;

    if (spec.startsWith('.')) {
      checked++;
      if (!existsSync(resolve(dirname(file), spec))) {
        failures.push(`${at()} — ${spec} does not exist`);
      }
      continue;
    }

    if (!spec.startsWith('npm:')) continue;
    const { name, sub } = parseNpmSpecifier(spec);
    if (!sub) continue;

    const manifest = join(MODULES, name, 'package.json');
    if (!existsSync(manifest)) continue;

    let json;
    try {
      json = JSON.parse(readFileSync(manifest, 'utf8'));
    } catch {
      continue;
    }
    if (!json.exports || typeof json.exports !== 'object') continue;

    checked++;
    if (!exportsAdmit(json.exports, sub)) {
      failures.push(
        `${at()} — ${spec}\n      ${name} exports only: ${Object.keys(json.exports).join(', ')}`,
      );
    }
  }
}

if (failures.length) {
  console.error(`\nEdge function imports that cannot resolve (${failures.length}):\n`);
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nThe function will fail at module load and answer every request with a' +
      '\nboot error. Point the import at a path that exists — _shared/cors.ts is' +
      '\nthe canonical CORS list — or at an entry point the package really has.\n',
  );
  process.exit(1);
}

console.log(`Edge imports: ${checked} resolvable, none broken.`);
