// DeHub's custom emoji, in the formats other apps already read.
//
//   GET /custom-emojis                  Mastodon /api/v1/custom_emojis shape —
//                                       what Mastodon, Pleroma, Akkoma and
//                                       most fediverse clients and bridges
//                                       consume.
//   GET /custom-emojis?format=misskey   Misskey /api/emojis shape ({ emojis }).
//   GET /custom-emojis?format=discord   Discord bot-friendly list (name, url,
//                                       animated) for bridges that re-upload.
//
// Public and read-only; the table is already world-readable through RLS, this
// only reshapes it and adds CORS + caching so a third-party client can point
// at one URL.
import { handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return jsonResponse({ error: 'GET only' }, 405);

  const format = new URL(req.url).searchParams.get('format') ?? 'mastodon';
  const { data, error } = await serviceClient()
    .from('custom_emojis')
    .select('shortcode, image_url, animated, category, source')
    .order('shortcode')
    .limit(10000);
  if (error) {
    console.error('[custom-emojis]', error.message);
    return jsonResponse({ error: 'Could not load emoji.' }, 503);
  }
  const rows = data ?? [];

  const body =
    format === 'misskey'
      ? { emojis: rows.map((e) => ({ name: e.shortcode, url: e.image_url, category: e.category, aliases: [] })) }
      : format === 'discord'
        ? rows.map((e) => ({ name: e.shortcode, url: e.image_url, animated: e.animated }))
        : rows.map((e) => ({
            shortcode: e.shortcode,
            url: e.image_url,
            static_url: e.image_url,
            visible_in_picker: true,
            category: e.category ?? undefined,
          }));

  const res = jsonResponse(body);
  res.headers.set('Cache-Control', 'public, max-age=300');
  return res;
});
