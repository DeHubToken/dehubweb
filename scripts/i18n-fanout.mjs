#!/usr/bin/env node
/**
 * Fills the keys a locale is missing from en.json, using the deployed
 * translate-text edge function.
 *
 *   node scripts/i18n-fanout.mjs --check                 # report only, no writes, no network
 *   node scripts/i18n-fanout.mjs --locale de             # fill one locale
 *   node scripts/i18n-fanout.mjs --locales de,fr,pt      # fill several
 *   node scripts/i18n-fanout.mjs --all --limit 8         # the 8 furthest-behind locales
 *   node scripts/i18n-fanout.mjs --locale de --keys 200  # cap the work in one run
 *
 * Why this exists: extracting a page into `t()` calls makes it translatable, it
 * does not make it translated. A key that reaches only en.json renders English
 * in the other 109 languages, and scripts/i18n-coverage.mjs cannot fail the
 * build for it as long as one locale carries the key. This script closes that
 * gap in bulk.
 *
 * Three rules it will not break:
 *
 *   1. An existing translation is never overwritten. Only missing keys are sent.
 *   2. A string whose placeholders do not survive the round trip is DROPPED, not
 *      written. Machine translation reorders and mangles `{{count}}`, `{amount}`
 *      and `<b>` — observed live, e.g. "{{count}} day" coming back as
 *      "{\n{count}} Tag". A missing key falls back to English and looks fine; a
 *      corrupted placeholder renders literal braces at the user, or breaks
 *      <Trans>. English is the better failure.
 *   3. The file is rewritten from a parsed object, so a malformed response can
 *      never produce malformed JSON.
 *
 * Placeholders are swapped for @@n@@ sentinels before sending, because the
 * translator handles those far better than raw braces or tags — but sentinels
 * are corrupted too sometimes ("@ @ 0 @ @"), which is what rule 2 catches.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = 'src/i18n/locales';
const FN_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/translate-text';

/** Batching. Larger batches are cheaper but lose more work when one line drifts. */
const BATCH_LINES = 30;
const PAUSE_MS = 350;
const MAX_RETRIES = 3;

/** Anything i18next or <Trans> reads back out of the string. */
const PLACEHOLDER = /\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|<\/?[a-zA-Z][a-zA-Z0-9]*>/g;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

const CHECK_ONLY = flag('check');
const KEY_BUDGET = Number(value('keys') || Infinity);

/** The publishable key the browser bundle already ships — not a secret. */
function anonKey() {
  if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  const client = fs.readFileSync('src/integrations/supabase/client.ts', 'utf8');
  const found = client.match(/"(ey[A-Za-z0-9._-]{40,})"/);
  if (!found) throw new Error('No publishable key found in src/integrations/supabase/client.ts');
  return found[1];
}

/* ---------- flatten / rebuild ---------- */

function flatten(node, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function setDeep(root, dottedKey, val) {
  const parts = dottedKey.split('.');
  let node = root;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object') node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = val;
}

/**
 * Rebuild the locale in en.json's key order, so a filled file diffs against
 * English cleanly instead of listing new keys wherever they happened to land.
 */
function reorderLike(template, filled) {
  if (Array.isArray(template) || typeof template !== 'object' || template === null) return filled;
  const out = {};
  for (const k of Object.keys(template)) {
    if (!(k in filled)) continue;
    out[k] = reorderLike(template[k], filled[k]);
  }
  for (const k of Object.keys(filled)) if (!(k in out)) out[k] = filled[k];
  return out;
}

/* ---------- placeholder protection ---------- */

function protect(text) {
  const found = [];
  const masked = text.replace(PLACEHOLDER, (m) => {
    found.push(m);
    return `@@${found.length - 1}@@`;
  });
  return { masked, found };
}

function restore(masked, found) {
  let out = masked;
  for (let i = 0; i < found.length; i++) {
    // Tolerate the translator adding spaces inside the sentinel ("@ @ 0 @ @").
    const loose = new RegExp(`@\\s*@\\s*${i}\\s*@\\s*@`, 'g');
    out = out.replace(loose, found[i]);
  }
  return out;
}

/** The check rule 2 turns on: same placeholders, same number of them. */
function placeholdersMatch(source, candidate) {
  const a = (source.match(PLACEHOLDER) || []).slice().sort();
  const b = (candidate.match(PLACEHOLDER) || []).slice().sort();
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

function looksUnfinished(candidate) {
  return candidate.includes('@@') || /@\s@/.test(candidate) || candidate.trim() === '';
}

/* ---------- network ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateBatch(lines, targetLang, key) {
  const body = JSON.stringify({ text: lines.join('\n'), targetLang, sourceLang: 'en' });
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body,
      });
      if (res.status === 429) { await sleep(2000 * attempt); continue; }
      if (!res.ok) { await sleep(600 * attempt); continue; }
      const json = await res.json();
      const text = json?.translatedText;
      if (typeof text !== 'string') return null;
      const out = text.split('\n');
      // A batch that came back a different shape is unusable as a whole; the
      // caller retries it one line at a time rather than guessing an alignment.
      return out.length === lines.length ? out : null;
    } catch {
      await sleep(600 * attempt);
    }
  }
  return null;
}

/* ---------- main ---------- */

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
const enFlat = flatten(en);

const allLocales = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'en.json')
  .map((f) => f.replace(/\.json$/, ''));

function missingFor(locale) {
  const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'));
  const flat = flatten(raw);
  const missing = [];
  for (const [k, v] of enFlat) {
    if (typeof v !== 'string') continue;
    const have = flat.get(k);
    if (typeof have !== 'string' || have.trim() === '') missing.push(k);
  }
  return { raw, missing };
}

let targets;
if (value('locale')) targets = [value('locale')];
else if (value('locales')) targets = value('locales').split(',').map((s) => s.trim()).filter(Boolean);
else targets = allLocales;

if (flag('all') || CHECK_ONLY) {
  targets = targets
    .map((l) => ({ l, n: missingFor(l).missing.length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.l);
}
const limit = Number(value('limit') || 0);
if (limit > 0) targets = targets.slice(0, limit);

const translatableTotal = [...enFlat.values()].filter((v) => typeof v === 'string').length;

if (CHECK_ONLY) {
  console.log(`en.json translatable strings: ${translatableTotal}\n`);
  let worst = 0;
  for (const locale of targets) {
    const { missing } = missingFor(locale);
    const pct = (((translatableTotal - missing.length) / translatableTotal) * 100).toFixed(1);
    if (missing.length > worst) worst = missing.length;
    console.log(`${locale.padEnd(7)} ${String(translatableTotal - missing.length).padStart(5)}/${translatableTotal}  ${pct.padStart(5)}%  missing ${missing.length}`);
  }
  console.log(`\nlargest gap: ${worst} keys`);
  process.exit(0);
}

const key = anonKey();

for (const locale of targets) {
  const { raw, missing } = missingFor(locale);
  if (missing.length === 0) { console.log(`${locale}: already complete`); continue; }

  const todo = missing.slice(0, KEY_BUDGET);
  console.log(`${locale}: ${missing.length} missing, translating ${todo.length}`);

  let written = 0;
  let dropped = 0;

  for (let i = 0; i < todo.length; i += BATCH_LINES) {
    const keys = todo.slice(i, i + BATCH_LINES);
    const sources = keys.map((k) => enFlat.get(k));
    const prepared = sources.map(protect);

    let out = await translateBatch(prepared.map((p) => p.masked), locale, key);

    // A drifted batch is retried per line so one bad string cannot cost 29 good ones.
    if (!out) {
      out = [];
      for (const p of prepared) {
        const single = await translateBatch([p.masked], locale, key);
        out.push(single ? single[0] : null);
        await sleep(PAUSE_MS);
      }
    }

    keys.forEach((k, j) => {
      const candidate = out[j] == null ? null : restore(out[j].trim(), prepared[j].found);
      if (
        candidate == null ||
        looksUnfinished(candidate) ||
        !placeholdersMatch(sources[j], candidate)
      ) {
        dropped++;
        return;
      }
      setDeep(raw, k, candidate);
      written++;
    });

    await sleep(PAUSE_MS);
    process.stdout.write(`  ${Math.min(i + BATCH_LINES, todo.length)}/${todo.length}\r`);
  }

  const ordered = reorderLike(en, raw);
  fs.writeFileSync(path.join(LOCALES_DIR, `${locale}.json`), JSON.stringify(ordered, null, 2) + '\n');
  console.log(`\n${locale}: wrote ${written}, dropped ${dropped} (left in English on purpose)`);
}
