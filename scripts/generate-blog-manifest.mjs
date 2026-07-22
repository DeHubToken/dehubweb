/**
 * generate-blog-manifest.mjs
 * ==========================
 * Runs at buildStart (vite.config.ts blogManifestPlugin) and regenerates every
 * bot-facing blog artifact from the single source of truth in src/data +
 * src/data/blogSource.ts (generator-only — article bodies never ship in the
 * runtime JS bundle):
 *
 *   public/blog-manifest.json        — post metadata consumed by the ssr-seo
 *                                      edge function (title/excerpt/dates/banner)
 *   public/blog-content/<slug>.json  — per-post article body rendered to HTML
 *                                      (`html`, inlined by the edge fn so
 *                                      Googlebot gets the full text) PLUS the
 *                                      raw markdown (`md`) the SPA fetches on
 *                                      demand and renders client-side
 *   src/data/blog-metadata.generated.ts — content-free post metadata arrays;
 *                                      the ONLY blog data the runtime bundles
 *   public/sitemap-static.xml        — blog <url> entries refreshed with real
 *                                      lastmod dates (canonical /guides/<slug>)
 *   public/rss.xml                   — latest 20 posts
 *
 * Blog data lives in TypeScript modules, so we bundle a tiny entry with esbuild
 * (already a vite dependency) and import the result — no ts-node required.
 */

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const APP_URL = 'https://dehub.io';
// Hand-built React guide pages that also live under /guides/ — never touch
// their sitemap entries and never treat them as manifest posts.
const STANDALONE_GUIDES = new Set([
  'best-decentralized-social-media',
  'best-web3-social-media-dapps',
]);

// ---------------------------------------------------------------- load posts
// Mirrors the SPA's resolution exactly: BlogPost.tsx serves
// `getNewPostBySlug(slug) || getPostBySlug(slug)`, so the manifest must be the
// slug-level UNION of newPosts and blogUtils posts (newPosts win on collision).
// Building from getPublishedPosts() alone 404'd 17 live newPosts articles.
async function loadBlogData() {
  const outfile = path.join(ROOT, 'node_modules', '.cache', 'dehub-blog-data.mjs');
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await build({
    stdin: {
      contents: [
        `import { getPublishedPosts, getLatestPost } from '@/data/blogSource';`,
        `import { newPosts, excludedTitles } from '@/data/newPosts';`,
        `const bySlug = new Map();`,
        `for (const p of getPublishedPosts()) if (!p.status || p.status === 'published') bySlug.set(p.slug, p);`,
        `for (const p of newPosts) if (!p.status || p.status === 'published') bySlug.set(p.slug, p);`,
        `export const posts = [...bySlug.values()];`,
        `export const publishedPosts = getPublishedPosts();`,
        `export const latestPost = getLatestPost();`,
        `export { newPosts, excludedTitles };`,
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    alias: { '@': path.join(ROOT, 'src') },
    logLevel: 'silent',
  });
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  return mod;
}

function applyManifestDisplayOverrides(posts) {
  // Display overrides applied by useBlogData.ts at runtime — keep titles/dates
  // in the manifest consistent with what users see in the SPA.
  return posts.map((p) => {
    if (p.title === 'Entrepreneurial Spirit: Co-Founders Launch TikTok Agency') return { ...p, publishedAt: '2024-01-09T12:00:00.000Z' };
    if (p.title === 'Back in Action: DeHub V2 Trading Resumes on Gate.io') return { ...p, publishedAt: '2023-02-16T12:00:00.000Z' };
    if (p.title === 'Faster and Sleeker: UI Overhaul and 200% Backend Speed Boost') {
      return { ...p, title: 'Faster and Sleeker: major app upgrade reveals UI Overhaul and 200% Backend Speed Boost', publishedAt: '2024-10-28T12:00:00.000Z' };
    }
    if (p.title === 'Revolutionizing Access: On-Chain Tradable Subscriptions Launch') return { ...p, publishedAt: '2024-10-30T12:00:00.000Z' };
    if (p.slug === 'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025') {
      return { ...p, title: 'Scaling New Heights: Livepeer Integration for initially 50k+ Concurrent Viewers With Unlimited Viewer abilities as we scale up.' };
    }
    if (p.slug === 'dhb-tradable-on-coinbase-soon') return { ...p, title: 'Confirmed! $DHB To Be Available Directly On Coinbase CEX' };
    return p;
  });
}

// ------------------------------------------------------------- mini markdown
const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const absolutize = (url) => {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

function inlineMd(text) {
  let s = escHtml(text);
  // Captures below come from the ALREADY-ESCAPED string — un-escape &amp;
  // before re-escaping, or URLs with query params ship as &amp;amp;.
  const unesc = (u) => u.replace(/&amp;/g, '&');
  // images first (so their alt/src aren't re-parsed as links)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const cleanAlt = alt.split('|')[0].trim(); // "Name|avatar" convention
    return `<img src="${escHtml(absolutize(unesc(src)))}" alt="${escHtml(unesc(cleanAlt))}" loading="lazy" style="max-width:100%">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) =>
    `<a href="${escHtml(absolutize(unesc(href)))}">${txt}</a>`);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s>])\*([^*\n]+)\*(?=[\s.,!?<]|$)/g, '$1<em>$2</em>');
  return s;
}

function mdToHtml(md) {
  const src = String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/\[TEAM_SECTION_START\]|\[TEAM_SECTION_END\]/g, '');
  const lines = src.split('\n');
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  let inFence = false;
  let fence = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      if (inFence) {
        out.push(`<pre><code>${escHtml(fence.join('\n'))}</code></pre>`);
        fence = [];
        inFence = false;
      } else {
        flushPara(); flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) { fence.push(raw); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(h[1].length + 1, 6); // page h1 is the post title
      out.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { flushList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inlineMd((ul || ol)[1])}</li>`);
      continue;
    }
    if (line.match(/^\s*>\s?(.*)$/)) {
      flushPara(); flushList();
      out.push(`<blockquote>${inlineMd(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}

// --------------------------------------------------------------------- emit
const blogData = await loadBlogData();
const posts = applyManifestDisplayOverrides(blogData.posts);
const sorted = [...posts].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
);

// 1. manifest (metadata only — shape consumed by CLOUDFLARE_WORKER_SEO.js)
const manifest = sorted.map((p) => ({
  slug: p.slug,
  title: p.title,
  seoTitle: p.seoTitle || undefined,
  seoDescription: p.seoDescription || undefined,
  excerpt: p.excerpt || '',
  author: p.author?.name || 'DeHub Team',
  publishedAt: p.publishedAt,
  updatedAt: p.updatedAt || undefined,
  bannerImage: p.bannerImage || undefined,
  bannerImageAlt: p.bannerImageAlt || undefined,
  readingTime: p.readingTime || undefined,
  tags: p.tags && p.tags.length ? p.tags : undefined,
}));
fs.writeFileSync(path.join(PUBLIC, 'blog-manifest.json'), JSON.stringify(manifest));

// 2. per-post rendered bodies
const contentDir = path.join(PUBLIC, 'blog-content');
fs.rmSync(contentDir, { recursive: true, force: true });
fs.mkdirSync(contentDir, { recursive: true });
for (const p of sorted) {
  const html = mdToHtml(p.content);
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  fs.writeFileSync(
    path.join(contentDir, `${p.slug}.json`),
    // `html` feeds the SEO pipelines (ssr-seo edge fn + CF worker) — keep it
    // exactly as before. `md` is the raw markdown (post-overrides, same string
    // the SPA used to bundle) fetched on demand by BlogPost.tsx.
    JSON.stringify({ slug: p.slug, title: p.title, html, md: p.content, wordCount })
  );
}

// 2a. runtime metadata module — every post object the SPA needs, with the
//     bodies stripped (content: ''). This is the ONLY blog data the runtime
//     bundles; article markdown is fetched from blog-content/<slug>.json.
{
  const stripContent = (p) => ({
    ...p,
    content: '',
    excerpt: p.excerpt ?? '',
    bannerImage: p.bannerImage ?? '',
    bannerImageAlt: p.bannerImageAlt ?? '',
    author: p.author ?? { name: 'DeHub Team' },
    tags: Array.isArray(p.tags) ? p.tags : [],
    readingTime: p.readingTime ?? 0,
    featured: !!p.featured,
  });
  const ser = (v) => JSON.stringify(v, null, 2);
  const metaTs = `// AUTO-GENERATED by scripts/generate-blog-manifest.mjs — DO NOT EDIT.
// Regenerated at buildStart (vite.config.ts blogManifestPlugin) from the
// generator-only full-content modules (src/data/blogSource.ts et al).
// Every post here has content: '' — BlogPost.tsx fetches the markdown body
// on demand from /blog-content/<slug>.json (md field).
import type { BlogPost } from '@/types/blog';

// getPublishedPosts() corpus: overrides applied, published only, newest first.
export const blogPostsMetadata: BlogPost[] = ${ser(blogData.publishedPosts.map(stripContent))};

// src/data/newPosts.ts array, source order preserved (getNewPostBySlug wins
// over blogPostsMetadata on slug collisions — same as the old runtime).
// The /docs/blog list corpus (getAllBlogListPosts) is combined from these two
// arrays at runtime in blogUtils.ts — metadata-only logic, no third copy here.
export const newPostsMetadata: BlogPost[] = ${ser(blogData.newPosts.map(stripContent))};

// getLatestPost() result — docs home hero.
export const latestPostMetadata: BlogPost | undefined = ${blogData.latestPost ? ser(stripContent(blogData.latestPost)) : 'undefined'};

export const excludedTitles: string[] = ${ser(blogData.excludedTitles)};
`;
  const metaPath = path.join(ROOT, 'src', 'data', 'blog-metadata.generated.ts');
  // Only rewrite when the content changes so the vite dev server doesn't see a
  // touched module (and trigger a reload loop) on every start.
  const prev = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '';
  if (prev !== metaTs) fs.writeFileSync(metaPath, metaTs);
}

// 2b. docs pages — public/dehub-docs-content.txt is the full docs text with
//     ===-fenced section headers. Split it into per-route JSON so the edge fn
//     can serve real documentation text to bots instead of the SPA shell
//     (11 sitemap docs URLs were presenting as homepage duplicates).
const DOCS_SECTION_TO_ROUTE = {
  'OVERVIEW': 'overview',
  "D'APP - A COMPLETE ECOSYSTEM": 'dapps',
  'GAMES': 'games',
  'TOKEN ECONOMICS & EMISSIONS': 'token/economics',
  'STAKING': 'token/stake',
  'ROADMAP': 'roadmap',
  'FAQ - FREQUENTLY ASKED QUESTIONS': 'faq',
  'TEAM': 'team',
  'CONTACT': 'contact',
  'PRIVACY POLICY': 'privacy',
  'LEGAL DISCLAIMER': 'terms',
};
const docsTxtPath = path.join(PUBLIC, 'dehub-docs-content.txt');
const docsRoutes = [];
if (fs.existsSync(docsTxtPath)) {
  const docsDir = path.join(PUBLIC, 'docs-content');
  fs.rmSync(docsDir, { recursive: true, force: true });
  fs.mkdirSync(docsDir, { recursive: true });
  const lines = fs.readFileSync(docsTxtPath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const sections = new Map();
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^={10,}$/.test(lines[i].trim())) {
      const name = (lines[i + 1] || '').trim();
      if (name && /^={10,}$/.test((lines[i + 2] || '').trim())) {
        current = name;
        sections.set(current, []);
        i += 2;
        continue;
      }
      continue;
    }
    if (current) sections.get(current).push(lines[i]);
  }
  for (const [name, route] of Object.entries(DOCS_SECTION_TO_ROUTE)) {
    const body = sections.get(name);
    if (!body) { console.warn(`[blog-manifest] docs section missing: ${name}`); continue; }
    const html = mdToHtml(body.join('\n'));
    const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    fs.writeFileSync(
      path.join(docsDir, `${route.replace(/\//g, '-')}.json`),
      JSON.stringify({ route, section: name, html, wordCount })
    );
    docsRoutes.push(route);
  }
}

// 3. sitemap-static.xml — drop every /guides/<slug> blog entry, re-append fresh
//    ones with real lastmod (standalone guide pages keep their hand-set entries)
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const smPath = path.join(PUBLIC, 'sitemap-static.xml');
let sm = fs.readFileSync(smPath, 'utf8');
sm = sm.replace(
  /\s*<url>\s*<loc>https:\/\/dehub\.io\/guides\/([^<]+)<\/loc>[\s\S]*?<\/url>/g,
  (block, slug) => (STANDALONE_GUIDES.has(decodeURIComponent(slug.trim())) ? block : '')
);
const blogUrls = sorted.map((p) => {
  const lastmod = p.updatedAt || p.publishedAt;
  return `  <url>\n    <loc>${APP_URL}/guides/${xmlEsc(encodeURIComponent(p.slug))}</loc>\n    <lastmod>${xmlEsc(lastmod)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
}).join('\n');
sm = sm.replace(/\s*<\/urlset>\s*$/, `\n${blogUrls}\n</urlset>\n`);

// 3b. docs URLs: the hand-written sitemap listed phantom routes
//     (/docs/quick-start, /docs/token-economics) that don't exist in the SPA.
//     Replace all /docs/* entries (except /docs and /docs/blog) with the real
//     route list: extracted-content routes + curated meta-only routes.
// Every real, indexable /docs route, mirroring the route table in DocsSurface.tsx.
// Deliberately excluded:
//   - ComingSoonPage placeholders (token, website, app, dehub, x, instagram,
//     architecture, configuration, data-models, auth, webhooks, best-practices,
//     troubleshooting, examples) — no content to index.
//   - depin / e2e-encryption / ai-toolkits — consolidated into /docs/dapps and now
//     redirect there; redirects don't belong in a sitemap.
const DOCS_META_ONLY = [
  'overview', 'dapps', 'games',
  'token/economics', 'token/utility', 'token/where-to-buy',
  'token/governance', 'token/stake', 'token/bridge',
  'advertising', 'team', 'security', 'roadmap', 'contact',
  'terms', 'terms-of-service', 'privacy',
  'brand-assets', 'brand-guidelines', 'featured-in',
  'quickstart', 'installation', 'endpoints', 'faq', 'donate',
];
const allDocsRoutes = [...new Set([...docsRoutes, ...DOCS_META_ONLY])];
sm = sm.replace(
  /\s*<url>\s*<loc>https:\/\/dehub\.io\/docs\/([^<]+)<\/loc>[\s\S]*?<\/url>/g,
  (block, sub) => (sub.trim() === 'blog' ? block : '')
);
const docsUrls = allDocsRoutes.map((r) =>
  `  <url>\n    <loc>${APP_URL}/docs/${r}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
).join('\n');
sm = sm.replace(/\s*<\/urlset>\s*$/, `\n${docsUrls}\n</urlset>\n`);
fs.writeFileSync(smPath, sm);

// 4. rss.xml — latest 20
const rfc822 = (iso) => new Date(iso).toUTCString();
const items = sorted.slice(0, 20).map((p) => `    <item>
      <title>${xmlEsc(p.title)}</title>
      <description>${xmlEsc(p.seoDescription || p.excerpt || '')}</description>
      <link>${APP_URL}/guides/${xmlEsc(encodeURIComponent(p.slug))}</link>
      <guid>${APP_URL}/guides/${xmlEsc(encodeURIComponent(p.slug))}</guid>
      <pubDate>${rfc822(p.publishedAt)}</pubDate>
      <dc:creator>${xmlEsc(p.author?.name || 'DeHub Team')}</dc:creator>
    </item>`).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>DeHub Blog</title>
    <description>News, product updates and Web3 guides from DeHub — the open source, user-owned social platform.</description>
    <link>${APP_URL}/docs/blog</link>
    <atom:link href="${APP_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-US</language>
    <copyright>Copyright ${new Date(sorted[0]?.publishedAt || Date.now()).getFullYear()} DeHub</copyright>
    <managingEditor>team@dehub.io (DeHub Team)</managingEditor>
    <webMaster>team@dehub.io (DeHub Team)</webMaster>
    <lastBuildDate>${rfc822(sorted[0]?.publishedAt || Date.now())}</lastBuildDate>
${items}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(PUBLIC, 'rss.xml'), rss);

console.log(`[blog-manifest] ${manifest.length} posts → manifest, blog-content/ (html+md), blog-metadata.generated.ts, sitemap-static.xml, rss.xml`);
