#!/usr/bin/env node
/**
 * Writes public/docs-content/<route>.json for every developer docs page in
 * src/data/developer-docs.json — the body the worker serves crawlers for
 * /docs/<route>. Run it after editing the data file; the docs-content test
 * fails if a page and its crawler copy disagree.
 *
 *   node scripts/build-developer-docs-content.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_URL = 'https://dehub.io';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same inline marks DeveloperDoc renders: `code`, **bold**, [text](href). */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const url = href.startsWith('/') ? `${APP_URL}${href}` : href;
      return `<a href="${url}">${label}</a>`;
    });
}

function block(b) {
  if ('p' in b) return `<p>${inline(b.p)}</p>`;
  if ('code' in b) return `<pre><code>${esc(b.code)}</code></pre>`;
  if ('list' in b) return `<ul>\n${b.list.map((i) => `<li>${inline(i)}</li>`).join('\n')}\n</ul>`;
  if ('table' in b) {
    const head = `<tr>${b.table.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr>`;
    const rows = b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
    return `<table>\n${head}\n${rows}\n</table>`;
  }
  if ('cards' in b) {
    return `<ul>\n${b.cards.map((c) => `<li><a href="${APP_URL}${c.to}">${esc(c.title)}</a>: ${esc(c.body)}</li>`).join('\n')}\n</ul>`;
  }
  throw new Error(`Unknown block: ${JSON.stringify(b).slice(0, 80)}`);
}

export function pageHtml(page) {
  const parts = [`<p>${inline(page.intro)}</p>`];
  for (const s of page.sections) {
    parts.push(`<h2 id="${esc(s.id)}">${esc(s.heading)}</h2>`);
    for (const b of s.blocks) parts.push(block(b));
  }
  return parts.join('\n');
}

export function contentFor(page) {
  const html = pageHtml(page);
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return { route: page.route, section: page.section, html, wordCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pages } = JSON.parse(readFileSync(resolve(root, 'src/data/developer-docs.json'), 'utf8'));
  for (const page of pages) {
    const file = resolve(root, 'public/docs-content', `${page.route.replace(/\//g, '-')}.json`);
    writeFileSync(file, `${JSON.stringify(contentFor(page))}\n`);
    console.log(`wrote ${file.replace(`${root}/`, '')}`);
  }
}
