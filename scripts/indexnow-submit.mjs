#!/usr/bin/env node
/**
 * Tells Bing, Yandex, Seznam, Naver and Yep (via IndexNow) which riftn.com
 * pages are new or changed.
 *
 *   node scripts/indexnow-submit.mjs <sitemap.xml> [--previous <old-sitemap.xml>] [--dry-run]
 *
 * With --previous, only URLs that are new or whose <lastmod> moved are sent.
 * Without it, every URL in the sitemap is sent (the "IndexNow full submit"
 * workflow). The key file lives at public/<KEY>.txt and is served from
 * riftn.com/<KEY>.txt.
 */
import fs from 'node:fs';

const HOST = 'riftn.com';
const KEY = '6d8657e98f6c69ec4c61e1ae682fd592';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH = 10000;

/** Map of <loc> to <lastmod> ('' when the entry has none). */
export function parseSitemap(xml) {
  const out = new Map();
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    out.set(loc.replace(/&amp;/g, '&'), body.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] || '');
  }
  return out;
}

/** URLs on HOST that are new in `current` or whose lastmod changed. */
export function changedUrls(current, previous) {
  const urls = [];
  for (const [loc, lastmod] of current) {
    let host;
    try { host = new URL(loc).hostname; } catch { continue; }
    if (host !== HOST) continue;
    if (!previous || !previous.has(loc) || previous.get(loc) !== lastmod) urls.push(loc);
  }
  return urls;
}

async function submit(urls) {
  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
    });
    // 200 and 202 both mean accepted.
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`IndexNow answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    console.log(`IndexNow accepted ${urlList.length} URL(s) (HTTP ${res.status})`);
  }
}

async function main(argv) {
  const args = argv.slice(2);
  const sitemapPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--previous');
  const prevIdx = args.indexOf('--previous');
  const previousPath = prevIdx >= 0 ? args[prevIdx + 1] : null;
  const dryRun = args.includes('--dry-run');
  if (!sitemapPath) throw new Error('Usage: indexnow-submit.mjs <sitemap.xml> [--previous <old.xml>] [--dry-run]');

  const current = parseSitemap(fs.readFileSync(sitemapPath, 'utf8'));
  let previous = null;
  if (previousPath) {
    // A missing or empty live copy means we could not read it: send nothing
    // rather than resubmitting the whole site on every deploy.
    if (!fs.existsSync(previousPath) || !fs.statSync(previousPath).size) {
      console.log('No previous sitemap to compare with; skipping.');
      return;
    }
    previous = parseSitemap(fs.readFileSync(previousPath, 'utf8'));
  }
  const urls = changedUrls(current, previous);
  console.log(`${urls.length} of ${current.size} URL(s) to submit`);
  if (!urls.length) return;
  if (dryRun) { urls.slice(0, 20).forEach((u) => console.log(u)); return; }
  await submit(urls);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => { console.error(err.message); process.exit(1); });
}
