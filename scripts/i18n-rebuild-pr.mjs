#!/usr/bin/env node
/**
 * Rebuilds a translation-fill PR branch onto the current checkout (main).
 *
 *   node scripts/i18n-rebuild-pr.mjs --branch i18n-fanout-27 --kind app
 *   node scripts/i18n-rebuild-pr.mjs --branch docs-i18n-fill-14 --kind docs
 *
 * Fill runs take hours and main keeps moving underneath them, so their PRs
 * routinely conflict on locale files someone else touched in the meantime. A
 * git merge cannot resolve that sensibly (one JSON file, thousands of keys),
 * so this does it key by key, three-way, against the run's merge base:
 *
 *   - a key the run did not change is left as main has it;
 *   - a key main changed since the run started keeps main's value;
 *   - a key the run pruned but could not refill keeps main's value — some
 *     tests require certain keys in every locale;
 *   - otherwise the run's value is taken, after the same last-line guards the
 *     fill uses: quotes the English lacked are stripped, a value that gained an
 *     emoji the English lacked is dropped, Georgian Mtavruli is lowercased.
 *
 * Docs bundles (.ts) are taken whole when main has not touched them since the
 * run started; otherwise they are skipped and reported. Derived files
 * (widget-fallback-locales.ts, seo-i18n.json) are left to the caller to
 * regenerate. Run from a clean checkout of main with the branch fetched.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const branch = value('branch');
const kind = value('kind');
if (!branch || !['app', 'docs'].includes(kind)) {
  console.error('usage: i18n-rebuild-pr.mjs --branch <name> --kind app|docs');
  process.exit(1);
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const show = (ref, file) => { try { return git('show', `${ref}:${file}`); } catch { return null; } };
const head = `origin/${branch}`;
const base = git('merge-base', 'HEAD', head);
const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const flatten = (o, p = '', out = new Map()) => {
  for (const [k, v] of Object.entries(o)) { const K = p ? `${p}.${k}` : k; if (isObj(v)) flatten(v, K, out); else out.set(K, v); }
  return out;
};
const setDeep = (o, k, v) => { const ps = k.split('.'); let c = o; for (const p of ps.slice(0, -1)) { if (!isObj(c[p])) c[p] = {}; c = c[p]; } c[ps.at(-1)] = v; };
const reorderLike = (tpl, obj) => {
  const out = {};
  for (const k of Object.keys(tpl)) if (k in obj) out[k] = isObj(tpl[k]) && isObj(obj[k]) ? reorderLike(tpl[k], obj[k]) : obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
};
const EMOJI = /\p{Extended_Pictographic}/gu;
const QUOTES = [['"', '"'], ['“', '”'], ['„', '“'], ['«', '»'], ['「', '」']];
const MTAV = /[Ა-Ჿ]/g;

const enTpl = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8'));
const enFlat = flatten(enTpl);
const stats = { base: base.slice(0, 8), files: 0, changed: 0, keptMain: 0, unwrapped: 0, emojiDropped: 0, mtav: 0, skipped: [] };

for (const file of files) {
  if (kind === 'app' && /^src\/i18n\/locales\/[a-z_]+\.json$/.test(file) && !file.endsWith('/en.json')) {
    const main = JSON.parse(fs.readFileSync(file, 'utf8'));
    const b = flatten(JSON.parse(show(base, file) ?? '{}'));
    const p = flatten(JSON.parse(show(head, file)));
    const m = flatten(main);
    const locale = file.match(/([a-z_]+)\.json$/)[1];
    const result = new Map(m);
    for (const k of new Set([...b.keys(), ...p.keys()])) {
      if (JSON.stringify(p.get(k)) === JSON.stringify(b.get(k))) continue;
      if (JSON.stringify(m.get(k)) !== JSON.stringify(b.get(k))) { stats.keptMain++; continue; }
      let v = p.get(k);
      if (v === undefined) { if (m.has(k)) continue; result.delete(k); continue; }
      if (typeof v === 'string') {
        const src = enFlat.get(k) ?? '';
        for (const [o, c] of QUOTES) if (v.length > 2 && v.startsWith(o) && v.endsWith(c) && !src.trim().startsWith(o)) { v = v.slice(o.length, -c.length).trim(); stats.unwrapped++; break; }
        const had = new Set(src.match(EMOJI) ?? []);
        if ((v.match(EMOJI) ?? []).some((e) => !had.has(e))) { stats.emojiDropped++; continue; }
        if (locale === 'ka' && /[Ა-Ჿ]/.test(v)) { v = v.replace(MTAV, (ch) => ch.toLowerCase()); stats.mtav++; }
      }
      result.set(k, v);
      stats.changed++;
    }
    const obj = {};
    for (const [k, v] of result) setDeep(obj, k, v);
    fs.writeFileSync(file, JSON.stringify(reorderLike(enTpl, obj), null, 2) + '\n');
    stats.files++;
  } else if (kind === 'docs' && /^src\/i18n\/[a-z_]+\.ts$/.test(file)) {
    if (fs.readFileSync(file, 'utf8').trim() !== show(base, file)) { stats.skipped.push(file); continue; }
    let txt = show(head, file) + '\n';
    if (file.endsWith('/ka.ts')) txt = txt.replace(MTAV, (c) => c.toLowerCase());
    fs.writeFileSync(file, txt);
    stats.files++;
  }
}
console.log(JSON.stringify(stats));
