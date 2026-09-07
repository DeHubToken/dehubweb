#!/usr/bin/env node
/**
 * Catches text that has been through a bad encoding round-trip.
 *
 * When a tool reads a UTF-8 file as Latin-1 or cp1252 and writes it back out as
 * UTF-8, every non-ASCII character is replaced by the two or three characters
 * its bytes happen to spell. An em dash becomes "a-hat euro double-quote", and
 * a tool doing it twice mangles that again into six characters. The file still
 * parses, every test still passes, and the damage only shows up on screen.
 * en.json shipped that way in #1073 and sat on main for two days, because the
 * one review signal — the diff — was 349 lines of characters nobody reads.
 *
 *   node scripts/mojibake-check.mjs          # exits 1 on any hit
 *   node scripts/mojibake-check.mjs --fix    # repair in place
 *
 * Detection is a round-trip, not a blocklist of bad-looking characters: a run
 * is reported only when re-encoding it as cp1252 or Latin-1 yields valid UTF-8
 * that decodes to something different. Genuine accented text fails that test —
 * a lone "e-acute" is not valid UTF-8 on its own — so real translations in the
 * other 109 locale files do not trip it.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * What bytes 0x80-0x9F mean in cp1252. Everything outside that range is
 * Latin-1, where the byte and the code point are the same number.
 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];
const CP1252_BYTE = new Map(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]));

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** The characters a bad round-trip can produce; anything else ends the run. */
const RUN = new RegExp(
  `[\\u0080-\\u00ff${CP1252_HIGH.filter((cp) => cp > 0xff)
    .map((cp) => `\\u${cp.toString(16).padStart(4, '0')}`)
    .join('')}]+`,
  'g',
);

function toBytes(text, cp1252) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const mapped = cp1252 ? CP1252_BYTE.get(code) : undefined;
    if (mapped !== undefined) out[i] = mapped;
    else if (code <= 0xff) out[i] = code;
    else return null;
  }
  return out;
}

/** Peel off however many bad round-trips a run has been through. */
function unmangle(run) {
  let text = run;
  for (let round = 0; round < 6; round++) {
    let moved = false;
    for (const cp1252 of [true, false]) {
      const bytes = toBytes(text, cp1252);
      if (!bytes) continue;
      let decoded;
      try {
        decoded = UTF8.decode(bytes);
      } catch {
        continue;
      }
      if (decoded === text) continue;
      text = decoded;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return text;
}

const ROOTS = ['src', 'public/blog-content'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.json', '.md']);
/** Minified third-party bundles are not ours to rewrite. */
const SKIP = ['node_modules', 'vendor'];

function walk(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP.includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (EXTENSIONS.has(extname(entry))) found.push(path);
  }
  return found;
}

const fix = process.argv.includes('--fix');
let mangled = 0;
let files = 0;

for (const file of ROOTS.flatMap((root) => walk(root))) {
  const original = readFileSync(file, 'utf8');
  const hits = [];
  const repaired = original.replace(RUN, (run) => {
    const clean = unmangle(run);
    if (clean === run) return run;
    hits.push([run, clean]);
    return clean;
  });
  if (!hits.length) continue;
  mangled += hits.length;
  files += 1;
  console.log(`${fix ? 'repaired' : 'MANGLED '} ${file}  (${hits.length})`);
  for (const [run, clean] of hits.slice(0, 3)) console.log(`    ${run}  ->  ${clean}`);
  if (fix) writeFileSync(file, repaired, 'utf8');
}

if (!mangled) {
  console.log('No mangled text.');
  process.exit(0);
}
if (fix) {
  console.log(`\nRepaired ${mangled} run(s) across ${files} file(s).`);
  process.exit(0);
}
console.log(
  `\n${mangled} run(s) of mangled text across ${files} file(s). Something ` +
    `rewrote these in the wrong encoding — the characters are a symptom, so ` +
    `do not patch them one at a time. Run: node scripts/mojibake-check.mjs --fix`,
);
process.exit(1);
