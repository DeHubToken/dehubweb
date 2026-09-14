#!/usr/bin/env node
/**
 * Fills docs/marketing keys a `src/i18n/<lang>.ts` locale is missing.
 *
 *   node scripts/docs-i18n-fanout.mjs --keys spNameBoost,spDescBoost --all
 *   node scripts/docs-i18n-fanout.mjs --keys-file new-keys.txt --locales ar,tr
 *   node scripts/docs-i18n-fanout.mjs --keys-file new-keys.txt --all --check
 *
 * The sibling of scripts/i18n-fanout.mjs, which serves the OTHER translation
 * system — i18next + `src/i18n/locales/*.json`, read through `t()` in the app.
 * Everything under `src/pages/docs/` reads `useLanguage()` against these `.ts`
 * bundles instead, and nothing filled them in bulk before, so a docs string
 * added to `en.ts` stayed English in all 110 languages.
 *
 * Three rules, the same ones the JSON fanout keeps:
 *
 *   1. An existing translation is never overwritten. Only missing keys are sent.
 *   2. A locale that does not already carry the ANCHOR key is skipped, not
 *      grown. These bundles are partial by design — 31 of them hold only the
 *      `nav` block — and a stray key landing in a section the file does not
 *      otherwise have would render one translated line inside an English page.
 *   3. Writes are line insertions after a known sibling key inside the same
 *      block, so a malformed response can never restructure the module.
 *
 * A translation carrying a quote, a newline or a backslash is escaped on the
 * way in; one that comes back empty or unchanged from the English is dropped,
 * because a missing key already falls back to English and does it cleanly.
 */
import fs from 'node:fs';
import path from 'node:path';

const I18N = 'src/i18n';
const FN_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/translate-text';
const BATCH_LINES = 20;
const PAUSE_MS = 350;
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : args[i + 1];
};

const CHECK_ONLY = flag('check');

/** The publishable key the browser bundle already ships — not a secret. */
function anonKey() {
  if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  const client = fs.readFileSync('src/integrations/supabase/client.ts', 'utf8');
  const found = client.match(/"(ey[A-Za-z0-9._-]{40,})"/);
  if (!found) throw new Error('No publishable key found in src/integrations/supabase/client.ts');
  return found[1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `key: 'value',` on one line — the only shape these bundles use, except that
 * `en.ts` writes single quotes and every translated locale writes double ones.
 * Both are matched, and a file is written back in the style it already has.
 */
function lineFor(key, source) {
  const m = new RegExp(
    "^([ \\t]*)" + key + ": (['\"])((?:[^'\"\\\\]|\\\\.|(?!\\2)['\"])*)\\2,[ \\t]*$",
    'm',
  ).exec(source);
  return m && { line: m[0], indent: m[1], quote: m[2], value: m[3] };
}

const unescape = (v) => v.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
const escape = (v, q) =>
  v.replace(/\\/g, '\\\\').split(q).join('\\' + q).replace(/\n/g, '\\n');

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
      return out.length === lines.length ? out : null;
    } catch {
      await sleep(600 * attempt);
    }
  }
  return null;
}

/* ---------- inputs ---------- */

const keysArg = value('keys');
const keysFile = value('keys-file');
if (!keysArg && !keysFile) throw new Error('Pass --keys a,b,c or --keys-file <path>');
const KEYS = (keysArg ? keysArg.split(',') : fs.readFileSync(keysFile, 'utf8').split('\n'))
  .map((k) => k.trim())
  .filter(Boolean);

/**
 * The key each new one is written beside. A locale missing the anchor is a
 * locale that does not carry this section at all, and is skipped (rule 2).
 */
const ANCHOR = value('anchor') || KEYS[0];

const enSrc = fs.readFileSync(path.join(I18N, 'en.ts'), 'utf8');
const english = new Map();
for (const key of KEYS) {
  const m = lineFor(key, enSrc);
  if (!m) throw new Error(`en.ts has no key ${key}`);
  english.set(key, unescape(m.value));
}

const locales = (value('locales')
  ? value('locales').split(',')
  : fs.readdirSync(I18N).filter((f) => /^[a-z_]+\.ts$/.test(f)).map((f) => f.replace(/\.ts$/, ''))
).filter((l) => l !== 'en' && l !== 'index');

/* ---------- run ---------- */

const key = CHECK_ONLY ? null : anonKey();
let filled = 0;
let skipped = 0;

for (const locale of locales) {
  const file = path.join(I18N, `${locale}.ts`);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');

  const anchorLine = lineFor(ANCHOR, src);
  if (!anchorLine) { skipped++; continue; }
  const { indent, quote } = anchorLine;

  const missing = KEYS.filter((k) => !lineFor(k, src));
  if (!missing.length) continue;

  if (CHECK_ONLY) {
    console.log(`${locale.padEnd(6)} ${String(missing.length).padStart(3)} missing`);
    continue;
  }

  const out = new Map();
  for (let i = 0; i < missing.length; i += BATCH_LINES) {
    const slice = missing.slice(i, i + BATCH_LINES);
    // One line per key, so a batch that comes back a different length is
    // unaligned and thrown away whole rather than written to wrong keys.
    const got = await translateBatch(slice.map((k) => english.get(k)), locale, key);
    if (got) {
      slice.forEach((k, n) => {
        const v = got[n]?.trim();
        if (v && v !== english.get(k)) out.set(k, v);
      });
    }
    await sleep(PAUSE_MS);
  }
  if (!out.size) { skipped++; continue; }

  // Insert in the declared order, all immediately after the anchor line, so
  // the block stays readable and the file's own ordering is never rewritten.
  const added = KEYS.filter((k) => out.has(k))
    .map((k) => `${indent}${k}: ${quote}${escape(out.get(k), quote)}${quote},`)
    .join('\n');
  src = src.replace(anchorLine.line, (m) => `${m}\n${added}`);
  fs.writeFileSync(file, src);
  filled += out.size;
  console.log(`${locale.padEnd(6)} +${out.size}`);
}

console.log(`\n${filled} strings written, ${skipped} locales skipped`);
