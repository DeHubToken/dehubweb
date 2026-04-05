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
    const timer = setTimeout(() => controller.abort(), 8000);

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
      return context.next();
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
    return context.next();
  }
};

export const config = {
  path: "/*",
};
