/**
 * Find machine-translated values that carry a script the locale does not use.
 *
 * The fan-out guards placeholders and English-verbatim output; it does not
 * look at the alphabet. The translator sometimes answers in the wrong script
 * entirely — Armenian for Amharic (`am` vs `hy`) — or splices CJK/Hangul/Arabic
 * fragments into an otherwise correct sentence. Both ship silently and both
 * are worse than falling back to English.
 *
 * The test is data-driven rather than a hand-written script-per-locale table:
 * a locale's own 2000+ existing values establish which blocks it legitimately
 * uses, and anything a new value introduces beyond those is contamination.
 *
 * Read-only. Exits 1 when anything is flagged, so it can gate a branch the
 * same way scripts/i18n-coverage.mjs does.
 *
 *   node scripts/i18n-script-check.mjs                      # every key
 *   node scripts/i18n-script-check.mjs src/i18n/locales converter.
 */
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'src/i18n/locales', prefix = ''] = process.argv.slice(2);
if (!dir) {
  console.error('usage: i18n-script-check.mjs [locales-dir] [key-prefix]');
  process.exit(1);
}

const BLOCKS = [
  ['Latin', /[A-Za-z]/],
  ['Cyrillic', /[Ѐ-ӿ]/],
  ['Greek', /[Ͱ-Ͽ]/],
  ['Armenian', /[԰-֏]/],
  ['Hebrew', /[֐-׿]/],
  ['Arabic', /[؀-ۿݐ-ݿ]/],
  ['Ethiopic', /[ሀ-፿]/],
  ['Devanagari', /[ऀ-ॿ]/],
  ['Bengali', /[ঀ-৿]/],
  ['Gurmukhi', /[਀-੿]/],
  ['Gujarati', /[઀-૿]/],
  ['Oriya', /[଀-୿]/],
  ['Tamil', /[஀-௿]/],
  ['Telugu', /[ఀ-౿]/],
  ['Kannada', /[ಀ-೿]/],
  ['Malayalam', /[ഀ-ൿ]/],
  ['Sinhala', /[඀-෿]/],
  ['Thai', /[฀-๿]/],
  ['Lao', /[຀-໿]/],
  ['Tibetan', /[ༀ-࿿]/],
  ['Myanmar', /[က-႟]/],
  ['Khmer', /[ក-៿]/],
  ['Georgian', /[Ⴀ-ჿ]/],
  ['Hangul', /[가-힯ᄀ-ᇿ]/],
  ['CJK', /[一-鿿㐀-䶿]/],
  ['Kana', /[぀-ヿ]/],
];

function blocksIn(text) {
  const found = new Set();
  for (const [name, re] of BLOCKS) if (re.test(text)) found.add(name);
  return found;
}

function flatten(node, pre = '', out = []) {
  for (const [k, v] of Object.entries(node)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.push([key, v]);
  }
  return out;
}

let flagged = 0;
const report = {};

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const locale = path.basename(file, '.json');
  if (locale === 'en') continue;
  const all = flatten(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));

  const mine = all.filter(([k, v]) => typeof v === 'string' && k.startsWith(prefix));
  const rest = all.filter(([k, v]) => typeof v === 'string' && !k.startsWith(prefix));
  if (!mine.length || rest.length < 200) continue;

  // Which blocks does this locale genuinely use? Count per block across the
  // existing corpus; a block appearing in fewer than 1% of values is noise
  // (a stray brand name), not part of the language.
  const counts = new Map();
  for (const [, v] of rest) for (const b of blocksIn(v)) counts.set(b, (counts.get(b) || 0) + 1);
  const native = new Set([...counts].filter(([, n]) => n / rest.length >= 0.01).map(([b]) => b));

  const bad = [];
  for (const [k, v] of mine) {
    const foreign = [...blocksIn(v)].filter(b => !native.has(b));
    if (foreign.length) bad.push([k, v, foreign]);
  }
  if (bad.length) {
    report[locale] = bad;
    flagged += bad.length;
  }
}

for (const [locale, bad] of Object.entries(report)) {
  console.log(`\n${locale} — ${bad.length} value(s) in a foreign script:`);
  for (const [k, v, foreign] of bad.slice(0, 5)) {
    console.log(`  ${k} [${foreign.join(',')}] = ${v.slice(0, 60)}`);
  }
  if (bad.length > 5) console.log(`  … and ${bad.length - 5} more`);
}
console.log(`\ntotal flagged: ${flagged} across ${Object.keys(report).length} locales`);
process.exit(flagged ? 1 : 0);
