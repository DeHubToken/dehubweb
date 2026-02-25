/**
 * Cloudflare Worker for DeHub Dynamic SEO/SSR
 * 
 * This worker intercepts requests to profiles and posts and:
 * 1. Checks if the user agent is a bot/crawler.
 * 2. If it is a bot, fetches meta tags from the Supabase Edge Function.
 * 3. If it is NOT a bot, it passes the request through to the main application.
 */

const SUPABASE_FUNCTION_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo';
const SUPABASE_BACKEND_ORIGIN = 'https://aigxuutjaqsywioxjefr.supabase.co';

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
  'spider',
  'bot',
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Same-origin proxy for backend requests from custom domain (avoids direct browser path issues)
    if (url.pathname.startsWith('/__backend/')) {
      const proxiedPath = url.pathname.replace('/__backend', '') || '/';
      const targetUrl = `${SUPABASE_BACKEND_ORIGIN}${proxiedPath}${url.search}`;
      return fetch(new Request(targetUrl, request));
    }

    const userAgent = request.headers.get('User-Agent') || '';
    const isBot = BOT_AGENTS.some(bot => userAgent.toLowerCase().includes(bot));

    // Define paths that need dynamic SEO
    const isProfilePath = url.pathname.length > 1 && !url.pathname.includes('.') && !url.pathname.startsWith('/app/') && !['explore', 'notifications', 'messages'].some(p => url.pathname.startsWith('/' + p));
    const isPostPath = url.pathname.includes('/post/') || url.pathname.includes('/video/');

    if (isBot && (isProfilePath || isPostPath)) {
      // Fetch from Supabase SSR function
      const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(url.pathname)}`;
      
      try {
        const response = await fetch(ssrUrl, {
          headers: {
            'User-Agent': userAgent,
          }
        });
        
        // Return the SSR response directly (HTML with meta tags)
        return response;
      } catch (error) {
        console.error('Error fetching from SSR function:', error);
      }
    }

    // Default: Continue to the original request (the SPA)
    return fetch(request);
  },
};
