#!/usr/bin/env node
/**
 * Fills every docs/marketing string a `src/i18n/<lang>.ts` bundle is missing.
 *
 *   node scripts/docs-i18n-fill.mjs --check                 # gap per locale, no network, no writes
 *   node scripts/docs-i18n-fill.mjs --locales ar,tr         # fill these
 *   node scripts/docs-i18n-fill.mjs --all --limit 8         # the 8 furthest behind
 *   node scripts/docs-i18n-fill.mjs --locales ar --keys 200 # cap the work per locale
 *
 * Everything under `src/pages/docs/` reads these bundles through useLanguage(),
 * which falls back to English one key at a time. Most bundles carried only part
 * of en.ts (31 of them only `nav`), so those pages rendered almost entirely in
 * English. scripts/docs-i18n-fanout.mjs fills named keys next to an anchor; this
 * fills the whole gap, including sections a bundle does not have yet.
 *
 * It does no translating of its own. The bundles are exported to JSON in a
 * scratch directory and scripts/i18n-fanout.mjs runs over them, so the docs get
 * exactly the guards the app strings get: placeholders must survive, English
 * echoes and wrong-script answers are dropped, an existing value is never
 * overwritten. Only the new values are then written back into the .ts file:
 *
 *   - each one is inserted just before the closing brace of the deepest object
 *     the bundle already has on that path, so existing lines never move;
 *   - arrays are all-or-nothing — a half-translated list is left in English;
 *   - the rewritten file is imported again and compared with what was meant to
 *     be written. Any difference and the file is restored untouched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const I18N = 'src/i18n';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : args[i + 1];
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

async function load(locale) {
  const url = `${pathToFileURL(path.resolve(I18N, `${locale}.ts`)).href}?v=${Date.now()}${Math.random()}`;
  const mod = await import(url);
  if (!isObj(mod[locale])) throw new Error(`${locale}.ts does not export const ${locale}`);
  return mod[locale];
}

/** Every bundle that exports its own code. Helper modules in src/i18n do not. */
function bundleLocales() {
  return fs
    .readdirSync(I18N)
    .filter((f) => /^[a-z]+(?:_[a-z]+)?\.ts$/.test(f))
    .map((f) => f.slice(0, -3))
    .filter((l) => l !== 'en' && l !== 'index')
    .filter((l) => new RegExp(`^export const ${l}\\b`, 'm').test(fs.readFileSync(path.join(I18N, `${l}.ts`), 'utf8')));
}

/* ---------- JSON round trip ---------- */

/** Arrays become {0:…,1:…} so the JSON fill treats each element as a key. */
const toJson = (node) =>
  Array.isArray(node)
    ? Object.fromEntries(node.map((v, i) => [String(i), toJson(v)]))
    : isObj(node)
      ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toJson(v)]))
      : node;

/**
 * What the fill added, shaped like en.ts. A leaf the bundle already had is not
 * an addition, and an array only counts when every element came back.
 */
function additions(enNode, have, filled) {
  const out = {};
  for (const [k, enV] of Object.entries(enNode)) {
    const h = have?.[k];
    const f = filled?.[k];
    if (Array.isArray(enV)) {
      if (h !== undefined || !isObj(f)) continue;
      const items = enV.map((_, i) => f[String(i)]);
      if (enV.every((e, i) => typeof e === 'string' && typeof items[i] === 'string')) out[k] = items;
    } else if (isObj(enV)) {
      if (h !== undefined && !isObj(h)) continue;
      const sub = additions(enV, h, f);
      if (Object.keys(sub).length) out[k] = sub;
    } else if (typeof enV === 'string' && h === undefined && typeof f === 'string') {
      out[k] = f;
    }
  }
  return out;
}

/* ---------- writing back into the .ts ---------- */

const KEY_LINE = /^(\s*)(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)"): ([{[])\s*$/;

/** Line index of the closing brace of every multi-line object, by dotted path. */
function closers(lines) {
  const stack = [];
  const found = new Map();
  lines.forEach((line, i) => {
    if (/^export const \w+(?:\s*:[^=]+)?\s*=\s*\{\s*$/.test(line)) { stack.push(''); return; }
    const open = KEY_LINE.exec(line);
    if (open) {
      const key = open[2] ?? open[3] ?? open[4];
      const parent = stack.at(-1);
      stack.push(parent == null || parent.includes('#') ? '#' : parent ? `${parent}.${key}` : key);
      return;
    }
    if (/^\s*[{[]\s*$/.test(line)) { stack.push('#'); return; }
    if (/^\s*[}\]],?;?\s*$/.test(line) && stack.length) {
      const p = stack.pop();
      if (!p.includes('#')) found.set(p, i);
    }
  });
  return found;
}

function serialize(node, indent, quote) {
  const str = (v) => quote + v.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`).replace(/\r?\n/g, '\\n') + quote;
  const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));
  const lines = [];
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v)) {
      lines.push(`${indent}${key(k)}: [`, ...v.map((s) => `${indent}  ${str(s)},`), `${indent}],`);
    } else if (isObj(v)) {
      lines.push(`${indent}${key(k)}: {`, ...serialize(v, `${indent}  `, quote), `${indent}},`);
    } else {
      lines.push(`${indent}${key(k)}: ${str(v)},`);
    }
  }
  return lines;
}

/** Splits the additions into chunks, each keyed by the existing object it goes into. */
function chunks(add, have, at = '', out = new Map()) {
  for (const [k, v] of Object.entries(add)) {
    if (isObj(v) && isObj(have?.[k])) chunks(v, have[k], at ? `${at}.${k}` : k, out);
    else {
      if (!out.has(at)) out.set(at, {});
      out.get(at)[k] = v;
    }
  }
  return out;
}

function merge(base, add) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(add)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
}

function sameShape(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameShape(a[k], b[k]));
  }
  return a === b;
}

async function writeBack(locale, have, add) {
  const file = path.join(I18N, `${locale}.ts`);
  const original = fs.readFileSync(file, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const single = lines.filter((l) => /:\s'/.test(l)).length;
  const double = lines.filter((l) => /:\s"/.test(l)).length;
  const quote = double > single ? '"' : "'";

  const at = closers(lines);
  const plan = [...chunks(add, have)].map(([p, node]) => ({ p, node, line: at.get(p) }));
  const placed = plan.filter((c) => c.line != null);
  const unplaced = plan.length - placed.length;

  // Bottom-up, so earlier insertions do not shift the lines later ones target.
  placed.sort((a, b) => b.line - a.line);
  let written = {};
  for (const { p, node, line } of placed) {
    const indent = `${/^\s*/.exec(lines[line])[0]}  `;
    let prev = line - 1;
    while (prev > 0 && (/^\s*$/.test(lines[prev]) || /^\s*\/\//.test(lines[prev]))) prev--;
    if (!/[,{[]\s*$/.test(lines[prev])) lines[prev] += ',';
    lines.splice(line, 0, ...serialize(node, indent, quote));
    written = merge(written, p ? p.split('.').reduceRight((acc, k) => ({ [k]: acc }), node) : node);
  }

  fs.writeFileSync(file, lines.join(eol));
  let ok = false;
  try {
    ok = sameShape(await load(locale), merge(have, written));
  } catch {
    ok = false;
  }
  if (!ok) {
    fs.writeFileSync(file, original);
    return { count: 0, unplaced, failed: true };
  }
  const count = JSON.stringify(written).match(/":"/g)?.length ?? 0;
  return { count, unplaced, failed: false };
}

/* ---------- main ---------- */

const en = await load('en');
const locales = value('locales') ? value('locales').split(',').map((s) => s.trim()).filter(Boolean) : bundleLocales();
const have = new Map();
for (const l of locales) have.set(l, await load(l));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-i18n-'));
fs.writeFileSync(path.join(tmp, 'en.json'), JSON.stringify(toJson(en), null, 2));
for (const [l, obj] of have) fs.writeFileSync(path.join(tmp, `${l}.json`), JSON.stringify(toJson(obj), null, 2));

/** String leaves en.ts has and this bundle does not. */
const gap = (enNode, h) =>
  Object.entries(enNode).reduce((n, [k, v]) => {
    if (Array.isArray(v)) return n + (h?.[k] === undefined ? v.length : 0);
    if (isObj(v)) return n + gap(v, isObj(h?.[k]) ? h[k] : undefined);
    return n + (typeof v === 'string' && h?.[k] === undefined ? 1 : 0);
  }, 0);

if (flag('check')) {
  const rows = [...have].map(([l, obj]) => [l, gap(en, obj)]).sort((a, b) => b[1] - a[1]);
  const total = gap(en, {});
  for (const [l, n] of rows) console.log(`${l.padEnd(7)} ${String(total - n).padStart(5)}/${total}  missing ${n}`);
  console.log(`
total missing: ${rows.reduce((a, [, n]) => a + n, 0)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

let order = [...have.keys()];
if (flag('all')) {
  order.sort((a, b) => gap(en, have.get(b)) - gap(en, have.get(a)));
  if (value('limit')) order = order.slice(0, Number(value('limit')));
}

// One locale at a time, written back as soon as it is done, so a run that is
// cut off (the workflow has a time limit) keeps every locale it finished.
let total = 0;
for (const l of order) {
  const pass = ['--locale', l];
  if (value('keys')) pass.push('--keys', value('keys'));
  const run = spawnSync(process.execPath, ['scripts/i18n-fanout.mjs', ...pass], {
    env: { ...process.env, I18N_LOCALES_DIR: tmp },
    stdio: 'inherit',
  });
  if (run.status !== 0) { console.log(`${l}: fill failed, skipped`); continue; }
  const obj = have.get(l);
  const filled = JSON.parse(fs.readFileSync(path.join(tmp, `${l}.json`), 'utf8'));
  const add = additions(en, obj, filled);
  if (!Object.keys(add).length) continue;
  const { count, unplaced, failed } = await writeBack(l, obj, add);
  total += count;
  console.log(
    failed
      ? `${l}.ts: write-back did not round-trip, left untouched`
      : `${l}.ts: +${count}${unplaced ? ` (${unplaced} section(s) with no multi-line parent, skipped)` : ''}`,
  );
}
console.log(`
docs strings written: ${total}`);
fs.rmSync(tmp, { recursive: true, force: true });
