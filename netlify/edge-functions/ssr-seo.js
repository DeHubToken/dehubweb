/**
 * Netlify Edge Function for DeHub Dynamic SEO/SSR
 */

const SUPABASE_FUNCTION_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo';

// Enhanced bot detection for social media crawlers
const BOT_AGENTS = [
  'facebookexternalhit',
  'facebookcatalog',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'discordbot',
  'googlebot',
  'bingbot',
  'crawler',
  'spider',
  'bot',
  'facebot', // Newer Facebook crawler
  'oggrabber'
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('User-Agent') || '';
  const isBot = BOT_AGENTS.some(bot => userAgent.toLowerCase().includes(bot));

  // Profile paths: /@username
  const isProfilePath = url.pathname.startsWith('/@');
  
  // Post paths: /post/:id or /video/:id
  const isPostPath = url.pathname.includes('/post/') || url.pathname.includes('/video/');

  if (isBot && (isProfilePath || isPostPath)) {
    // Forward the original URL to Supabase so it can generate proper og:url
    const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(url.pathname)}&original_url=${encodeURIComponent(request.url)}`;
    
    try {
      const response = await fetch(ssrUrl, {
        headers: {
          'User-Agent': userAgent,
        }
      });
      
      if (!response.ok) return context.next();

      const html = await response.text();
      
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Robots-Tag': 'index, follow',
          'Vary': 'User-Agent' // Crucial for bots vs users
        },
      });
    } catch (e) {
      return context.next();
    }
  }

  return context.next();
};

export const config = {
  path: "/*",
};
