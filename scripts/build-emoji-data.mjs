#!/usr/bin/env node
/**
 * Builds the emoji picker's dataset.
 *
 *   node scripts/build-emoji-data.mjs [--mobile <dehub-mobile checkout>]
 *
 * Sources, both pinned so a rebuild is reproducible:
 *   - Emojibase (MIT, milesj/emojibase): every emoji, its group, the Unicode
 *     version it arrived in, skin-tone variants, and keywords in 26 languages.
 *   - Noto Emoji Animation (CC BY 4.0, Google): which emoji have an animated
 *     version, shown as the picker's hover/long-press preview.
 *
 * Writes:
 *   src/lib/emoji/data/emoji.json   every emoji + skins + animated codepoints (~60 KB)
 *   src/lib/emoji/data/locales.json app locale → keyword file
 *   src/lib/emoji/data/shortcodes.json  :shortcode: → emoji, every name Slack,
 *     GitHub, Discord and JoyPixels use, so text pasted from any of them
 *     (":thumbsup:", ":+1:", ":fire:") renders as the emoji
 *   public/emoji-data/<VERSION>/names/<file>.json
 *     one per Emojibase language, index-aligned with emoji.json, each entry
 *     "label|keyword keyword ...". They are 150-300 KB apiece, so neither app
 *     bundles them: both fetch only the viewer's language from this versioned,
 *     immutable path on first open.
 *   --mobile also writes emoji.json, locales.json and the English keywords
 *   (the offline fallback) into dehub-mobile's libs/emoji/data.
 *
 * Bump VERSION to pick up a new Unicode release; the old public folder is
 * replaced, so bump the mobile copy in the same change.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '17.0.0';
const CDN = `https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION}`;
const NOTO_ANIMATED = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json';

/** Emojibase group ids → the picker's category keys, in display order. */
const GROUPS = { 0: 'smileys', 1: 'people', 3: 'animals', 4: 'food', 5: 'travel', 6: 'activities', 7: 'objects', 8: 'symbols', 9: 'flags' };
const GROUP_ORDER = ['smileys', 'people', 'animals', 'food', 'travel', 'activities', 'objects', 'symbols', 'flags'];

/**
 * App locale → Emojibase language whose keywords it searches with. Regional
 * languages borrow the closest dataset their speakers also read (Bhojpuri,
 * Chhattisgarhi and Magahi → Hindi; Sylheti, Chittagonian and Rangpuri →
 * Bengali; Swiss German → German; Wu, Min Bei and Jin → Mandarin; Cantonese →
 * Traditional Chinese). Every locale searches English keywords as well.
 */
const LOCALES = {
  en: 'en', bn: 'bn', da: 'da', de: 'de', es: 'es', et: 'et', fi: 'fi', fr: 'fr',
  hi: 'hi', hu: 'hu', it: 'it', ja: 'ja', ko: 'ko', lt: 'lt', ms: 'ms', nl: 'nl',
  no: 'nb', pl: 'pl', pt: 'pt', ru: 'ru', sv: 'sv', th: 'th', uk: 'uk', vi: 'vi',
  zh: 'zh', yue: 'zh-hant',
  bho: 'hi', hne: 'hi', mag: 'hi',
  syl: 'bn', ctg: 'bn', rkt: 'bn',
  gsw: 'de',
  wuu: 'zh', mnp: 'zh', cjy: 'zh',
};

/** How people on DeHub actually search. Merged into the English keywords. */
const EXTRA_KEYWORDS = {
  '🚀': 'moon pump send it launch lfg',
  '💎': 'diamond hands hodl',
  '🙌': 'diamond hands hodl',
  '🌕': 'moon wen',
  '🌙': 'moon wen',
  '📈': 'pump bullish chart up gains',
  '📉': 'dump bearish chart down rekt',
  '🐂': 'bull bullish',
  '🐻': 'bear bearish',
  '🐋': 'whale',
  '🦍': 'ape',
  '🐸': 'pepe',
  '🪙': 'coin token crypto',
  '💰': 'bag bags money crypto',
  '🤑': 'rich money',
  '🔥': 'lit fire hot',
  '💀': 'dead lmao skull dying',
  '☠️': 'dead rekt',
  '🤡': 'clown',
  '🧢': 'cap lie',
  '🫡': 'salute respect',
  '🗿': 'moai stone face chad',
  '🧠': 'galaxy brain big brain',
  '🤝': 'deal partnership',
  '👀': 'eyes watching looking',
  '🔫': 'gun pistol revolver',
  '🥶': 'cold ice',
  '🫶': 'heart hands love',
  '💯': 'hundred facts',
  '🎰': 'gamble casino degen',
  '🎲': 'gamble degen',
  '🧻': 'paper hands',
  '⚡': 'zap fast lightning',
  '👑': 'king queen crown',
  '🏆': 'win winner trophy',
};

async function getJson(url) {
  const res = await fetch(url.startsWith('http') ? url : `${CDN}/${url}`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Unicode version ×10 as an integer (0.6 → 6, 15.1 → 151). */
const v10 = (v) => Math.round((v ?? 0) * 10);

function clean(words) {
  const seen = new Set();
  for (const w of words.join(' ').toLowerCase().replace(/\|/g, ' ').split(/\s+/)) if (w) seen.add(w);
  return [...seen].join(' ');
}

async function main() {
  const mobileIdx = process.argv.indexOf('--mobile');
  const mobileRoot = mobileIdx > -1 ? process.argv[mobileIdx + 1] : null;

  const data = await getJson('en/data.json');
  const github = await getJson('en/shortcodes/github.json');
  const emojibase = await getJson('en/shortcodes/emojibase.json');
  const iamcal = await getJson('en/shortcodes/iamcal.json');
  const joypixels = await getJson('en/shortcodes/joypixels.json');
  const cldr = await getJson('en/shortcodes/cldr.json');
  const animatedSet = new Set((await getJson(NOTO_ANIMATED)).icons.map((i) => i.codepoint));

  const list = data.filter((e) => GROUPS[e.group] && e.emoji).sort((a, b) => a.order - b.order);

  /** Noto names files by lowercase hex joined with "_", with or without FE0F. */
  const animatedCode = (hexcode) => {
    const full = hexcode.toLowerCase().replace(/-/g, '_');
    if (animatedSet.has(full)) return full;
    const bare = full.replace(/_fe0f/g, '');
    return animatedSet.has(bare) ? bare : null;
  };

  // Row: [emoji, groupIndex, version×10, skins? (5 strings), skinVersion×10?]
  const rows = [];
  const animated = {};
  list.forEach((e, i) => {
    const row = [e.emoji, GROUP_ORDER.indexOf(GROUPS[e.group]), v10(e.version)];
    const tones = (e.skins || []).filter((s) => typeof s.tone === 'number').sort((a, b) => a.tone - b.tone);
    if (tones.length === 5) {
      row.push(tones.map((s) => s.emoji));
      const sv = Math.max(...tones.map((s) => v10(s.version)));
      if (sv !== row[2]) row.push(sv);
    }
    rows.push(row);
    const code = animatedCode(e.hexcode);
    if (code) animated[i] = code;
  });

  const dataset = { version: VERSION, groups: GROUP_ORDER, emoji: rows, animated };

  // Slack/GitHub names first: those are what people type, so they win a clash.
  const shortcodes = {};
  for (const set of [iamcal, github, emojibase, joypixels, cldr]) {
    for (const e of list) {
      for (const sc of [set[e.hexcode]].flat()) {
        const code = sc && String(sc).toLowerCase();
        if (code && !(code in shortcodes)) shortcodes[code] = e.emoji;
      }
    }
  }

  const names = {};
  for (const lang of new Set(Object.values(LOCALES))) {
    const byHex = Object.fromEntries((await getJson(`${lang}/compact.json`)).map((c) => [c.hexcode, c]));
    names[lang] = list.map((e) => {
      const c = byHex[e.hexcode];
      const label = (c?.label ?? (lang === 'en' ? e.label : '')).replace(/\|/g, ' ');
      const words = [label, ...(c?.tags ?? [])];
      if (lang === 'en') {
        for (const sc of [github[e.hexcode], emojibase[e.hexcode]].flat()) if (sc) words.push(sc.replace(/_/g, ' '), sc);
        if (e.emoticon) words.push(...[e.emoticon].flat());
        if (EXTRA_KEYWORDS[e.emoji]) words.push(EXTRA_KEYWORDS[e.emoji]);
      }
      return `${label}|${clean(words)}`;
    });
  }

  const json = (v) => JSON.stringify(v) + '\n';
  const dataDir = path.resolve('src/lib/emoji/data');
  const publicDir = path.resolve('public/emoji-data');
  const namesDir = path.join(publicDir, VERSION, 'names');
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(namesDir, { recursive: true });
  await writeFile(path.join(dataDir, 'emoji.json'), json(dataset));
  await writeFile(path.join(dataDir, 'locales.json'), json(LOCALES));
  await writeFile(path.join(dataDir, 'shortcodes.json'), json(shortcodes));
  for (const [file, arr] of Object.entries(names)) await writeFile(path.join(namesDir, `${file}.json`), json(arr));
  console.log(`wrote ${rows.length} emoji (${Object.keys(animated).length} animated), ${Object.keys(names).length} keyword files`);

  if (mobileRoot) {
    const dir = path.resolve(mobileRoot, 'libs/emoji/data');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'emoji.json'), json(dataset));
    await writeFile(path.join(dir, 'locales.json'), json(LOCALES));
    await writeFile(path.join(dir, 'names-en.json'), json(names.en));
    await writeFile(path.join(dir, 'shortcodes.json'), json(shortcodes));
    console.log(`wrote mobile dataset → ${dir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
