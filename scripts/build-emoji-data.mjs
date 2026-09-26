#!/usr/bin/env node
/**
 * Regenerates src/lib/emoji/emoji-data.json from Emojibase (MIT).
 *
 *   node scripts/build-emoji-data.mjs            # latest emojibase-data
 *   node scripts/build-emoji-data.mjs 17.0.0     # a pinned release
 *
 * The output is every emoji Unicode defines, in picker order, with the
 * shortcodes GitHub, Slack, Discord and JoyPixels use for it so text pasted
 * from any of them (":thumbsup:", ":+1:", ":fire:") turns back into the emoji.
 * The same file is copied into dehub-mobile (libs/emoji/emoji-data.json) so a
 * shortcode resolves identically on both.
 *
 * Row shape, kept positional to stay small:
 *   [unicode, label, group, keywords, shortcodes, skins?]
 */
import fs from 'node:fs';

const version = process.argv[2] || 'latest';
const base = `https://cdn.jsdelivr.net/npm/emojibase-data@${version}`;
const get = async (p) => {
  const res = await fetch(`${base}/${p}`);
  if (!res.ok) throw new Error(`${p}: ${res.status}`);
  return res.json();
};

const [compact, ...sets] = await Promise.all([
  get('en/compact.json'),
  // Order matters only for which shortcode is shown first: the Slack/GitHub
  // names are the ones people type, so they lead.
  get('en/shortcodes/iamcal.json'),
  get('en/shortcodes/github.json'),
  get('en/shortcodes/emojibase.json'),
  get('en/shortcodes/joypixels.json'),
  get('en/shortcodes/cldr.json'),
]);

const shortcodesFor = (hex) => {
  const out = [];
  for (const set of sets) {
    const v = set[hex];
    for (const code of Array.isArray(v) ? v : v ? [v] : []) {
      const c = String(code).toLowerCase();
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
};

const rows = compact
  // Group 2 is skin-tone swatches and hair components, which are not emoji on
  // their own; lone regional indicators have no group at all.
  .filter((e) => typeof e.group === 'number' && e.group !== 2)
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const row = [
      e.unicode,
      e.label,
      e.group,
      (e.tags || []).join(' '),
      shortcodesFor(e.hexcode),
    ];
    if (e.skins?.length) row.push(e.skins.map((s) => s.unicode));
    return row;
  });

const out = new URL('../src/lib/emoji/emoji-data.json', import.meta.url);
fs.mkdirSync(new URL('.', out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`wrote ${rows.length} emoji`);
