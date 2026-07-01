/**
 * Netlify Edge Function for DeHub Dynamic SEO/SSR
 *
 * Serves pre-rendered HTML with OG meta tags to social crawlers (bots) for:
 *   - Root /
 *   - /app/post/:id
 *   - /app/communities/:slug
 *   - /:username (profile pages)
 *
 * Regular browsers always fall through to the React SPA via context.next().
 * Serving SSR HTML to browsers caused an infinite reload loop because the
 * embedded `window.location.href` redirect pointed back to the same URL.
 */

const SUPABASE_FUNCTION_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo';
const DEHUB_LOGO = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png';
const APP_URL = 'https://dehub.io';
const BLOG_SHARE_IMAGE_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/blog-share-image';

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function absolutize(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildBlogShareImage(post) {
  const p = new URLSearchParams();
  p.set('slug', post.slug);
  p.set('title', (post.title || '').slice(0, 240));
  if (post.author) p.set('author', String(post.author).slice(0, 60));
  if (post.publishedAt) {
    try {
      const d = new Date(post.publishedAt);
      p.set('date', d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
    } catch {}
  }
  const banner = absolutize(post.bannerImage);
  if (banner) p.set('banner', banner);
  p.set('width', '1200');
  p.set('height', '630');
  p.set('format', 'png');
  return `${BLOG_SHARE_IMAGE_BASE}?${p.toString()}`;
}

let _blogManifestCache = null;
let _blogManifestFetchedAt = 0;
async function getBlogManifest(request) {
  const now = Date.now();
  if (_blogManifestCache && now - _blogManifestFetchedAt < 5 * 60 * 1000) {
    return _blogManifestCache;
  }
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/blog-manifest.json`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const map = new Map();
      for (const p of data) map.set(p.slug, p);
      _blogManifestCache = map;
      _blogManifestFetchedAt = now;
      return map;
    }
  } catch (e) {
    console.error('[Edge] blog manifest fetch failed', e);
  }
  return _blogManifestCache || new Map();
}

function buildBlogHtml(post, canonicalUrl) {
  const image = buildBlogShareImage(post);
  const title = `${post.title} — DeHub Blog`;
  const description = (post.excerpt || `${post.title} — read on DeHub.`).slice(0, 280);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="${escHtml(canonicalUrl)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escHtml(canonicalUrl)}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:image" content="${escHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escHtml(post.title)}">
<meta property="article:published_time" content="${escHtml(post.publishedAt || '')}">
<meta property="article:author" content="${escHtml(post.author || 'DeHub Team')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta name="twitter:image" content="${escHtml(image)}">
<meta name="twitter:site" content="@DeHubApp">
<script type="application/ld+json">${JSON.stringify({
  '@context':'https://schema.org','@type':'Article',
  headline: post.title, image: [image], datePublished: post.publishedAt,
  author: { '@type':'Person', name: post.author || 'DeHub Team' },
  publisher: { '@type':'Organization', name:'DeHub' },
  mainEntityOfPage: canonicalUrl,
})}</script>
</head>
<body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p><a href="${escHtml(canonicalUrl)}" style="color:#0f0">${escHtml(post.title)}</a></p>
</body>
</html>`;
}


/** Minimal OG HTML served to bots when SSR times out or fails.
 *  Prevents them from caching the generic React SPA index.html,
 *  which has no post-specific image and causes the 2-3 hour re-scrape delay.
 */
function buildFallbackHtml(pathname, canonicalUrl) {
  const postMatch = pathname.match(/\/post\/(\d+)/);
  const postId = postMatch ? postMatch[1] : null;
  const title = postId
    ? `Post #${postId} on DeHub`
    : 'DeHub — Open Source, User Owned & Censorship Resistant Media';
  const description = 'Open source, user owned and censorship resistant media.';
  const image = DEHUB_LOGO;
  const url = canonicalUrl || `${APP_URL}${pathname}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="200">
  <meta property="og:image:height" content="200">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:site" content="@DeHubApp">
  <meta http-equiv="refresh" content="0; url=${url}">
  <script>window.location.href = '${url}';</script>
</head>
<body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p><a href="${url}" style="color:#0f0">${title}</a></p>
</body>
</html>`;
}

const SYSTEM_ROUTES = [
  'app', 'post', 'explore', 'notifications', 'messages', 'settings',
  'delete-account', 'creators', 'jobs', 'features', 'skill.md',
  '_netlify', 'favicon.ico', 'assets', 'og-image.png',
  'radio', 'tv', 'governance', 'stake', 'leaderboard', 'music',
  'top-100', 'glossary', 'bridge', 'agents', 'assistant', 'buy',
  'docs', 'prompt', 'premium', 'affiliate', 'work', 'editor',
];


const BOT_UA_PATTERN = /bot|crawl|spider|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i;

function shouldServeSSR(pathname) {
  // Always SSR for post pages
  if (pathname.includes('/post/')) return true;
  // Always SSR for community pages
  if (pathname.includes('/communities/')) return true;
  // Always SSR for affiliate referral landings (/r/{code})
  if (/^\/r\/[A-Za-z0-9]+/.test(pathname)) return true;
  // Always SSR for blog posts
  if (/^\/docs\/blog\/[^/]+/.test(pathname)) return true;
  // Always SSR for root
  if (pathname === '/') return true;
  // Always SSR for profile pages (top-level non-system routes)
  const first = pathname.replace(/^\//, '').split('/')[0].toLowerCase().replace('@', '');
  if (first && !SYSTEM_ROUTES.includes(first) && !first.includes('.')) return true;
  return false;
}


export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Skip static assets immediately
  if (pathname.startsWith('/assets/') || pathname.startsWith('/_') ||
      (pathname.includes('.') && !pathname.includes('/post/'))) {
    return context.next();
  }

  if (!shouldServeSSR(pathname)) {
    return context.next();
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const isBot = BOT_UA_PATTERN.test(userAgent);

  // Non-bots (regular browsers) always get the React SPA directly.
  // The SSR HTML contains `window.location.href = '<same-url>'` for non-bots,
  // which causes an infinite reload loop on every route (/, /app/communities/x,
  // /app/post/x, /username, etc.). The React SPA handles all routing itself.
  if (!isBot) {
    return context.next();
  }

  // Blog posts: build OG HTML directly from manifest (no Supabase SSR involved).
  const blogMatch = pathname.match(/^\/docs\/blog\/([^/?#]+)/);
  if (blogMatch) {
    const slug = decodeURIComponent(blogMatch[1]);
    const manifest = await getBlogManifest(request);
    const post = manifest.get(slug);
    if (post) {
      const canonical = `${APP_URL}/docs/blog/${slug}`;
      return new Response(buildBlogHtml(post, canonical), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Vary': 'User-Agent',
          'X-Powered-By': 'DeHub-Edge-SEO-Blog',
        },
      });
    }
    // Fall through to generic fallback if manifest missing.
    return new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    });
  }

  const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(pathname)}&original_url=${encodeURIComponent(request.url)}`;


  try {
    const controller = new AbortController();
    // Increased from 8s → 12s: api.dehub.io is slow for new/uncached posts.
    // The 8s limit was causing timeouts → bots fell through to the React SPA
    // (generic OG image) → 2-3 hour re-scrape delay before seeing the real image.
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(ssrUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'X-Is-Bot': isBot ? '1' : '0',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.error(`[Edge] SSR returned ${response.status} for ${pathname}`);
      return new Response(buildFallbackHtml(pathname, request.url), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'Vary': 'User-Agent',
        },
      });
    }

    let html = await response.text();

    if (!html.includes('og:url')) {
      html = html.replace('</head>', `<meta property="og:url" content="${request.url}"></head>`);
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': isBot
          ? 'public, s-maxage=300, stale-while-revalidate=600'
          : 'no-store',
        'Vary': 'User-Agent',
        'X-Powered-By': 'DeHub-Edge-SEO',
      },
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[Edge] SSR timeout for ${pathname}`);
    } else {
      console.error('[Edge] Error:', e);
    }
    // On timeout/error, serve a minimal branded OG page so bots don't cache
    // the generic React SPA index.html (which causes the 2-3 hr re-scrape delay).
    return new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short cache on fallback so bots re-scrape soon and get the real image
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    });
  }
};

export const config = {
  path: "/*",
};
