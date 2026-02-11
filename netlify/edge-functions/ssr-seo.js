/**
 * Netlify Edge Function for DeHub Dynamic SEO/SSR
 */

const SUPABASE_FUNCTION_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo';

const BOT_AGENTS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'discordbot',
  'googlebot',
  'bingbot',
  'crawler',
  'facebot',
  'oggrabber'
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('User-Agent') || '';
  const isBot = BOT_AGENTS.some(bot => userAgent.toLowerCase().includes(bot));

  const isProfilePath = url.pathname.startsWith('/@');
  const isPostPath = url.pathname.includes('/post/') || url.pathname.includes('/video/');

  if (isBot && (isProfilePath || isPostPath)) {
    // We pass both path and original_url to ensure Supabase has everything it needs
    const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(url.pathname)}&original_url=${encodeURIComponent(request.url)}`;
    
    try {
      const response = await fetch(ssrUrl, {
        headers: { 'User-Agent': userAgent }
      });
      
      if (!response.ok) return context.next();

      let html = await response.text();
      
      // Inject missing properties that Facebook expects if they aren't there
      if (!html.includes('og:url')) {
        html = html.replace('</head>', `<meta property="og:url" content="${request.url}"></head>`);
      }
      
      // Return the final SEO HTML
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate', // No cache for testing
          'Vary': 'User-Agent',
          'X-Powered-By': 'DeHub-Edge-SEO'
        },
      });
    } catch (e) {
      console.error('[Edge] Error:', e);
      return context.next();
    }
  }

  return context.next();
};

export const config = {
  path: "/*",
};
