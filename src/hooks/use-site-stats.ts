/**
 * Live site stats
 * ===============
 * Reads /api/stats — the Cloudflare Worker endpoint that queries Cloudflare's
 * GraphQL Analytics API for this zone (see CLOUDFLARE_WORKER_SEO.js). The
 * numbers are measured at the edge, so this hook is a reader, never a counter:
 * nothing here contributes to the figures it displays.
 */

import { useQuery } from '@tanstack/react-query';

export interface SiteStatsDay {
  date: string;
  visitors: number;
  pageViews: number;
  requests: number;
  bytes: number;
}

export interface SiteStatsHour {
  hour: string;
  visitors: number;
  pageViews: number;
  requests: number;
}

export interface SiteStatsProvenance {
  source: string;
  endpoint: string;
  datasets: string[];
  measuredAt: string;
  zoneTag: string;
  cfRay: { daily: string | null; hourly: string | null; breakdown: string | null };
  queries: { daily: string; hourly: string; breakdown: string };
  variables: Record<string, string>;
  rawUrl: string;
  note: string;
}

export interface SiteStats {
  ok: true;
  fetchedAt: string;
  window: { dailyDays: number; breakdownDays: number; hourlyHours: number; firstDay: string | null };
  totals: { visitorDays: number; pageViews: number; requests: number; bytes: number; days: number };
  today: { date: string; visitors: number; pageViews: number; requests: number } | null;
  /**
   * `visitorHours` is the sum of per-hour unique counts, so someone browsing
   * across three hours counts three times. It is NOT a distinct-visitor figure
   * and must never be labelled as one — Cloudflare's adaptive dataset exposes
   * no `uniq` field, so a true rolling-24h unique count isn't available at all.
   */
  last24h: { visitorHours: number; pageViews: number; requests: number };
  daily: SiteStatsDay[];
  hourly: SiteStatsHour[];
  countries: { code: string; requests: number }[];
  browsers: { name: string; pageViews: number }[];
  security: { requests: number; cachedRequests: number; encryptedRequests: number; threats: number };
  provenance: SiteStatsProvenance;
}

export interface SiteStatsUnavailable {
  ok: false;
  /** 'unconfigured' when the analytics token isn't set on the Worker yet. */
  reason: string;
  message?: string;
}

export type SiteStatsResponse = SiteStats | SiteStatsUnavailable;

/**
 * The Worker sits in front of dehub.io in production only — `vite dev` and
 * `vite preview` serve the SPA directly, so /api/stats 404s there with an HTML
 * body. Read the deployed endpoint instead when running locally; it answers
 * with `Access-Control-Allow-Origin: *` precisely so this works.
 */
const STATS_ENDPOINT = import.meta.env.DEV ? 'https://dehub.io/api/stats' : '/api/stats';

export const STATS_REFRESH_MS = 60_000;

async function fetchSiteStats(): Promise<SiteStatsResponse> {
  const res = await fetch(STATS_ENDPOINT, { headers: { Accept: 'application/json' } });
  const text = await res.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // An HTML body here means the request never reached the Worker (dev server,
    // preview build, or a route that isn't deployed yet).
    throw new Error(`stats endpoint returned ${res.status} (${res.headers.get('content-type') || 'unknown type'})`);
  }

  const payload = body as SiteStatsResponse;
  if (!payload || typeof payload !== 'object' || !('ok' in payload)) {
    throw new Error('stats endpoint returned an unexpected shape');
  }
  // `ok: false` is a real answer, not a failure — the page renders a specific
  // state for it rather than a generic error.
  return payload;
}

export function useSiteStats() {
  return useQuery({
    queryKey: ['site-stats'],
    queryFn: fetchSiteStats,
    // Matches the endpoint's own 60s edge cache — polling faster only re-reads
    // the same cached response.
    refetchInterval: STATS_REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 45_000,
    retry: 1,
  });
}
