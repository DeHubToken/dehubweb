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
];

const BOT_UA_PATTERN = /bot|crawl|spider|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i;

function shouldServeSSR(pathname) {
  // Always SSR for post pages
  if (pathname.includes('/post/')) return true;
  // Always SSR for community pages
  if (pathname.includes('/communities/')) return true;
  // Always SSR for affiliate referral landings (/r/{code})
  if (/^\/r\/[A-Za-z0-9]+/.test(pathname)) return true;
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
