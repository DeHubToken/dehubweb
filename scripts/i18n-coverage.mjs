#!/usr/bin/env node
/**
 * Reports how much of en.json each locale actually carries at runtime.
 *
 * A key added to en.json and nowhere else silently renders in English for
 * every other language — invisible in review and in the build. Run this after
 * touching en.json:
 *
 *   node scripts/i18n-coverage.mjs            # summary
 *   node scripts/i18n-coverage.mjs --missing  # list the English-only keys
 *   node scripts/i18n-coverage.mjs --locale fr
 *
 * Exits 1 when a key in en.json reaches no locale at all, unless that key is
 * already listed in src/i18n/orphan-baseline.json. The baseline is the backlog
 * being worked through; a key outside it is a feature that shipped English-only,
 * and CI fails so it cannot merge that way.
 *
 *   node scripts/i18n-coverage.mjs --baseline  # rewrite the baseline to today
 *
 * Only ever shrink the baseline. Adding to it hides exactly the fault this
 * script exists to catch.
 *
 * Note the second source of translations: staking-translations.ts,
 * community-translations.ts and auth-toast-translations.ts are merged over the
 * locale JSON at runtime (see loadLanguage in src/i18n/index.ts), so a key can
 * be absent from fr.json and still render in French. This script reads those
 * bundles too — counting their keys as missing would bury the real gaps under
 * ~170 false ones per locale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const I18N = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const LOCALES = path.join(I18N, 'locales');

const flatten = (obj, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
};

/** Leaf key names the feature bundles define, per language. */
function bundleKeys() {
  const supplied = {};
  const block = (src, from) => {
    let depth = 0;
    for (let i = src.indexOf('{', from); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && !--depth) return src.slice(src.indexOf('{', from) + 1, i);
    }
    return '';
  };
  for (const file of ['staking-translations.ts', 'community-translations.ts', 'auth-toast-translations.ts']) {
    const src = fs.readFileSync(path.join(I18N, file), 'utf8');
    for (const lang of src.matchAll(/^ {2}([a-z_]{2,7}): \{$/gm)) {
      const body = block(src, lang.index);
      supplied[lang[1]] ??= new Set();
      for (const ns of body.matchAll(/^ {4}([A-Za-z_]\w*): \{$/gm)) {
        for (const key of block(body, ns.index).matchAll(/^\s*([A-Za-z_]\w*)\s*:\s*['"`]/gm)) {
          supplied[lang[1]].add(`${ns[1]}.${key[1]}`);
        }
      }
    }
  }
  return supplied;
}

const en = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8')));
const enKeys = Object.keys(en);
const supplied = bundleKeys();
const codes = fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.slice(0, -5));

const missingIn = new Map();
const rows = codes.map((code) => {
  const locale = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, `${code}.json`), 'utf8')));
  const fromBundle = supplied[code] ?? new Set();
  const missing = enKeys.filter((k) => (typeof locale[k] !== 'string' || !locale[k].trim()) && !fromBundle.has(k));
  for (const key of missing) missingIn.set(key, (missingIn.get(key) ?? 0) + 1);
  return { code, missing, pct: +(100 * (enKeys.length - missing.length) / enKeys.length).toFixed(1) };
});

const args = process.argv.slice(2);
const one = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;

if (one) {
  const row = rows.find((r) => r.code === one);
  if (!row) { console.error(`no locale "${one}"`); process.exit(1); }
  console.log(`${one}: ${row.pct}% (${row.missing.length} missing of ${enKeys.length})`);
  row.missing.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  process.exit(0);
}

const orphans = [...missingIn.entries()].filter(([, n]) => n === codes.length).map(([k]) => k);

console.log(`en.json: ${enKeys.length} keys across ${codes.length} locales`);
console.log(`complete locales: ${rows.filter((r) => !r.missing.length).length}/${codes.length}`);
const worst = rows.slice().sort((a, b) => a.pct - b.pct).slice(0, 10);
if (worst[0]?.missing.length) {
  console.log('lowest coverage:');
  worst.forEach((r) => console.log(`  ${r.code.padEnd(5)} ${String(r.pct).padStart(5)}%  ${r.missing.length} missing`));
}


const BASELINE = path.join(I18N, 'orphan-baseline.json');

if (args.includes('--baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(orphans.slice().sort(), null, 2)}\n`);
  console.log(`\nbaseline rewritten: ${orphans.length} key(s)`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8'))) : new Set();
const unbaselined = orphans.filter((k) => !baseline.has(k));
const cleared = [...baseline].filter((k) => !orphans.includes(k));

if (orphans.length) {
  console.log(`\n${orphans.length} key(s) exist only in English — every other language falls back:`);
  const show = args.includes('--missing') ? orphans : orphans.slice(0, 20);
  show.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  if (show.length < orphans.length) console.log(`  … ${orphans.length - show.length} more (--missing to list all)`);
}

if (cleared.length) {
  console.log(`\n${cleared.length} baselined key(s) are now translated — run --baseline to shrink the baseline.`);
}

if (unbaselined.length) {
  console.log(`\n${unbaselined.length} key(s) shipped English-only and are not in the baseline:`);
  unbaselined.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  console.log('\nTranslate them into the locale files. The baseline is the backlog being worked through, not somewhere to add to.');
  process.exit(1);
}

if (orphans.length) {
  console.log(`\nall ${orphans.length} English-only key(s) are in the baseline backlog`);
  process.exit(0);
}

console.log('\nno English-only keys');
