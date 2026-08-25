// Server-side proxy for the JustWatch Content Partner API.
//
// Two reasons this is a function and not a fetch from the app: the partner
// token authenticates every call as a query parameter (`?token=`), so it can
// never touch the browser, and apis.justwatch.com sends no CORS headers, so a
// direct call from dehub.io fails the preflight regardless. JustWatch's own
// docs tell integrators to proxy for exactly these two reasons.
//
// The token is provisioned per-partner at partners.justwatch.com. Until one is
// set the function answers 200 with `configured: false` rather than 500 —
// /cinema ships before the partnership completes and must render an honest
// "not live yet" state, not an error the user reads as a bug.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_BASE = 'https://apis.justwatch.com/contentpartner/v2/content';

// JustWatch locales are strictly `xx_YY`. Anchored because the value is
// interpolated into the upstream path — an unvalidated locale is a path
// traversal into someone else's endpoint.
const LOCALE_RE = /^[a-z]{2}_[A-Z]{2}$/;
const OBJECT_TYPES = new Set(['movie', 'show']);
const ID_TYPES = new Set(['justwatch', 'imdb', 'tmdb']);

// Providers are a slow-moving reference list; offers carry live retail prices
// and move daily. Both are public catalogue data, so they cache at the edge.
const CACHE_PROVIDERS = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_OFFERS = 'public, max-age=1800, stale-while-revalidate=3600';
const CACHE_SEARCH = 'public, max-age=600, stale-while-revalidate=3600';

function json(body: unknown, status = 200, cache?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(cache ? { 'Cache-Control': cache } : {}),
    },
  });
}

/** Upstream errors are logged in full but never returned verbatim: the request
 *  URL carries the partner token, and JustWatch echoes it back in some error
 *  bodies. */
async function callJustWatch(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('token', token);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[justwatch] ${path} -> ${res.status}`, detail.slice(0, 500));
    return { ok: false as const, status: res.status };
  }

  return { ok: true as const, data: await res.json() };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'search';
    const locale = url.searchParams.get('locale') ?? 'en_US';

    if (!LOCALE_RE.test(locale)) {
      return json({ error: 'Invalid locale. Expected a JustWatch locale such as en_US.' }, 400);
    }

    const token = Deno.env.get('JUSTWATCH_TOKEN');
    if (!token) {
      // Not an error condition — the surface is built ahead of the partnership.
      return json({ configured: false, action, locale }, 200);
    }

    if (action === 'providers') {
      const result = await callJustWatch(`/providers/all/locale/${locale}`, {}, token);
      if (!result.ok) return json({ error: 'JustWatch upstream error', status: result.status }, 502);

      // Only what the UI renders. The raw payload carries internal scheduling
      // and priority fields that would bloat every response.
      const providers = (Array.isArray(result.data) ? result.data : []).map((p: any) => ({
        id: p.id,
        technicalName: p.technical_name ?? p.short_name ?? null,
        name: p.clear_name ?? p.technical_name ?? 'Unknown',
        icon: p.icon_url ?? null,
        monetizationTypes: p.monetization_types ?? [],
      }));

      return json({ configured: true, providers }, 200, CACHE_PROVIDERS);
    }

    if (action === 'search') {
      const query = (url.searchParams.get('query') ?? '').trim();
      const objectType = url.searchParams.get('object_type') ?? 'movie';

      if (!query) return json({ error: 'A query is required.' }, 400);
      if (!OBJECT_TYPES.has(objectType)) return json({ error: 'Invalid object_type.' }, 400);

      const result = await callJustWatch(
        `/titles/object_type/${objectType}/locale/${locale}`,
        { query },
        token,
      );
      if (!result.ok) return json({ error: 'JustWatch upstream error', status: result.status }, 502);

      const raw = Array.isArray(result.data) ? result.data : (result.data?.items ?? []);
      return json({ configured: true, results: raw.map(mapTitle) }, 200, CACHE_SEARCH);
    }

    if (action === 'offers') {
      const id = (url.searchParams.get('id') ?? '').trim();
      const objectType = url.searchParams.get('object_type') ?? 'movie';
      const idType = url.searchParams.get('id_type') ?? 'justwatch';

      if (!id) return json({ error: 'An id is required.' }, 400);
      if (!OBJECT_TYPES.has(objectType)) return json({ error: 'Invalid object_type.' }, 400);
      if (!ID_TYPES.has(idType)) return json({ error: 'Invalid id_type.' }, 400);

      const result = await callJustWatch(
        `/offers/object_type/${objectType}/id_type/${idType}/locale/${locale}`,
        { id },
        token,
      );
      if (!result.ok) return json({ error: 'JustWatch upstream error', status: result.status }, 502);

      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return json({ configured: true, title: null }, 200, CACHE_OFFERS);

      return json({ configured: true, title: mapTitle(item, { withOffers: true }) }, 200, CACHE_OFFERS);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[justwatch] unhandled', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

/** Flattens a JustWatch title into the shape the app renders. Offers are only
 *  present on the detail endpoint, so they are opt-in. */
function mapTitle(t: any, opts: { withOffers?: boolean } = {}) {
  const base = {
    justwatchId: t.justwatch_id ?? t.id ?? null,
    imdbId: t.imdb_id ?? null,
    tmdbId: t.tmdb_id ?? null,
    objectType: t.object_type ?? 'movie',
    title: t.title ?? '',
    originalTitle: t.original_title ?? null,
    year: t.original_release_year ?? null,
    runtime: t.runtime ?? null,
    director: t.director ?? null,
    genreIds: t.genre_ids ?? [],
    shortDescription: t.short_description ?? t.description ?? null,
    poster: normalisePoster(t.poster ?? t.poster_url ?? null),
    // Country-specific JustWatch URL. Attribution links must point at the
    // localised path, not justwatch.com root — a partnership requirement.
    fullPath: t.full_path ?? null,
    ranks: mapRanks(t.ranks),
  };

  if (!opts.withOffers) return base;

  return {
    ...base,
    offers: (t.offers ?? []).map((o: any) => ({
      monetizationType: o.monetization_type ?? null,
      providerId: o.provider_id ?? null,
      presentationType: o.presentation_type ?? null,
      retailPrice: typeof o.retail_price === 'number' ? o.retail_price : null,
      currency: o.currency ?? null,
      // The tracking-wrapped click URL. Commission attribution lives inside
      // this URL — it must be used verbatim, never rebuilt from provider data.
      url: o.urls?.standard_web ?? null,
    })).filter((o: any) => o.url),
    // Titles with no offers yet still carry release windows, which is how a
    // film in cinemas shows a digital date instead of an empty card.
    upcoming: (t.upcoming ?? []).map((u: any) => ({
      providerId: u.provider_id ?? null,
      releaseType: u.release_type ?? null,
      from: u.release_window_from ?? null,
      to: u.release_window_to ?? null,
    })),
  };
}

function mapRanks(ranks: any) {
  if (!ranks || typeof ranks !== 'object') return null;
  const pick = (k: string) =>
    ranks[k] ? { rank: ranks[k].rank ?? null, delta: ranks[k].delta ?? null } : null;
  return { daily: pick('1d'), weekly: pick('7d'), monthly: pick('30d') };
}

/** Poster fields arrive as templates with a `{profile}` size placeholder and
 *  no host. A raw value would render as a broken image. */
function normalisePoster(poster: string | null) {
  if (!poster) return null;
  const sized = poster.replace('{profile}', 's332').replace('{format}', 'jpg');
  return sized.startsWith('http') ? sized : `https://images.justwatch.com${sized}`;
}
