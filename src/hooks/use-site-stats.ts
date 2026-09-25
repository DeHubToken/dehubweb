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
  /** True when `visitors` is rebuilt from page views — see estimateRelayedVisitors. */
  estimated?: boolean;
  /** Cloudflare's own unique count for an estimated bucket, kept for the record. */
  measuredVisitors?: number;
}

export interface SiteStatsHour {
  hour: string;
  visitors: number;
  pageViews: number;
  requests: number;
  estimated?: boolean;
  measuredVisitors?: number;
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

/** One day's country/browser split, kept per-day so any range can be totalled. */
export interface SiteStatsBreakdownDay {
  date: string;
  requests: number;
  cachedRequests: number;
  encryptedRequests: number;
  threats: number;
  countries: { code: string; requests: number }[];
  browsers: { name: string; pageViews: number }[];
}

export interface SiteStatsWindow {
  firstDay: string | null;
  lastDay: string | null;
  /** Counts actually returned, not requested — used to label ranges honestly. */
  dailyDays: number;
  hourlyHours: number;
  breakdownDays: number;
  /** Cloudflare's ceilings: hourly can't span more than 3 days on this plan. */
  hourlyMaxHours: number;
  breakdownMaxDays: number;
}

export interface SiteStats {
  ok: true;
  fetchedAt: string;
  window: SiteStatsWindow;
  /** Every day Cloudflare still retains, oldest first. */
  daily: SiteStatsDay[];
  /** Up to 72 hourly buckets — Cloudflare's hard limit for this resolution. */
  hourly: SiteStatsHour[];
  breakdown: SiteStatsBreakdownDay[];
  provenance: SiteStatsProvenance;
  /** Set when any day was estimated: the first such day and the ratio used. */
  estimate?: { since: string; ratio: number; baselineDays: number } | null;
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

/**
 * Below this visitors-per-page-view ratio a day was served through the direct
 * relay (ops/DIRECT-RECOVERY.md): every visitor reaches Cloudflare from the
 * relay's one address, so its unique count collapses to ~100 while page views
 * carry on. Edge-direct days sit between 0.11 and 0.37, relayed days between
 * 0.006 and 0.036, so the gap is wide enough for a fixed cut.
 */
const RELAYED_RATIO = 0.06;
const BASELINE_DAYS = 28;

/**
 * Rebuilds visitor counts for relayed buckets as page views times the median
 * visitors-per-page-view ratio of the last clean days. Page views are still
 * measured at the edge, so the shape is real; only the unique count is
 * inferred, and every such bucket is flagged so the page can say so. Detection
 * is by ratio rather than a date, so it stops by itself once the apex is back
 * behind Cloudflare.
 */
export function estimateRelayedVisitors(stats: SiteStats): SiteStats {
  const ratioOf = (d: SiteStatsDay) => (d.pageViews > 0 ? d.visitors / d.pageViews : null);
  const relayed = (d: SiteStatsDay) => {
    const r = ratioOf(d);
    return r != null && r < RELAYED_RATIO;
  };

  const clean = stats.daily.filter((d) => ratioOf(d) != null && !relayed(d)).slice(-BASELINE_DAYS);
  if (!clean.length || !stats.daily.some(relayed)) return { ...stats, estimate: null };

  const ratios = clean.map((d) => ratioOf(d) as number).sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const ratio = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;

  const relayedDates = new Set<string>();
  const daily = stats.daily.map((d) => {
    if (!relayed(d)) return d;
    relayedDates.add(d.date);
    return { ...d, visitors: Math.round(d.pageViews * ratio), measuredVisitors: d.visitors, estimated: true };
  });
  // Hourly uniques can't be classified by ratio on their own, so an hour
  // follows the day it falls in.
  const hourly = stats.hourly.map((h) =>
    relayedDates.has(h.hour.slice(0, 10))
      ? { ...h, visitors: Math.round(h.pageViews * ratio), measuredVisitors: h.visitors, estimated: true }
      : h,
  );

  const since = daily.find((d) => d.estimated)?.date ?? null;
  return {
    ...stats,
    daily,
    hourly,
    estimate: since ? { since, ratio, baselineDays: clean.length } : null,
  };
}

function withEstimates(res: SiteStatsResponse): SiteStatsResponse {
  return res.ok ? estimateRelayedVisitors(res) : res;
}

export function useSiteStats() {
  return useQuery({
    queryKey: ['site-stats'],
    queryFn: fetchSiteStats,
    select: withEstimates,
    // Matches the endpoint's own 60s edge cache — polling faster only re-reads
    // the same cached response.
    refetchInterval: STATS_REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 45_000,
    retry: 1,
  });
}
