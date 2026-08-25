/**
 * Client for the `justwatch` edge function, which proxies the JustWatch
 * Content Partner API.
 *
 * Calls go out as GET rather than through `supabase.functions.invoke` (which
 * POSTs) so the responses stay cacheable — catalogue data is identical for
 * every visitor in a country, and the function sets long Cache-Control values
 * that a POST would throw away.
 */

// Mirrors the fallbacks in integrations/supabase/client.ts: these are
// publishable values that ship in the bundle anyway, and hardcoding them keeps
// /cinema working in a build with no VITE_ env.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

const FN_URL = `${SUPABASE_URL}/functions/v1/justwatch`;

export type MonetizationType = 'flatrate' | 'buy' | 'rent' | 'free' | 'ads' | 'cinema';
export type ObjectType = 'movie' | 'show';

export interface JustWatchRank {
  rank: number | null;
  delta: number | null;
}

export interface JustWatchTitle {
  justwatchId: number | string | null;
  imdbId: string | null;
  tmdbId: number | null;
  objectType: ObjectType;
  title: string;
  originalTitle: string | null;
  year: number | null;
  runtime: number | null;
  director: string | null;
  genreIds: number[];
  shortDescription: string | null;
  poster: string | null;
  /** Country-specific JustWatch path, e.g. `/us/movie/the-pianist`. */
  fullPath: string | null;
  ranks: { daily: JustWatchRank | null; weekly: JustWatchRank | null; monthly: JustWatchRank | null } | null;
}

export interface JustWatchOffer {
  monetizationType: MonetizationType | null;
  providerId: number | null;
  presentationType: string | null;
  retailPrice: number | null;
  currency: string | null;
  /** Tracking-wrapped click URL. Commission attribution is encoded inside it,
   *  so it is passed through untouched and never rebuilt. */
  url: string;
}

export interface JustWatchUpcoming {
  providerId: number | null;
  releaseType: string | null;
  from: string | null;
  to: string | null;
}

export interface JustWatchTitleDetail extends JustWatchTitle {
  offers: JustWatchOffer[];
  upcoming: JustWatchUpcoming[];
}

export interface JustWatchProvider {
  id: number;
  technicalName: string | null;
  name: string;
  icon: string | null;
  monetizationTypes: string[];
}

/** Thrown when the partner token is not yet provisioned. Callers render the
 *  pre-launch state rather than an error. */
export class JustWatchNotConfiguredError extends Error {
  constructor() {
    super('JustWatch partner token is not configured');
    this.name = 'JustWatchNotConfiguredError';
  }
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(params);
  const res = await fetch(`${FN_URL}?${search}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`JustWatch request failed (${res.status})`);
  }

  const data = await res.json();
  if (data?.configured === false) throw new JustWatchNotConfiguredError();
  if (data?.error) throw new Error(data.error);

  return data as T;
}

export function searchTitles(
  query: string,
  locale: string,
  objectType: ObjectType = 'movie',
): Promise<{ results: JustWatchTitle[] }> {
  return call({ action: 'search', query, locale, object_type: objectType });
}

export function fetchTitleOffers(
  id: string,
  locale: string,
  objectType: ObjectType = 'movie',
  idType: 'justwatch' | 'imdb' | 'tmdb' = 'justwatch',
): Promise<{ title: JustWatchTitleDetail | null }> {
  return call({ action: 'offers', id, locale, object_type: objectType, id_type: idType });
}

export function fetchProviders(locale: string): Promise<{ providers: JustWatchProvider[] }> {
  return call({ action: 'providers', locale });
}

/** Absolute JustWatch URL for a title. Attribution links are required to point
 *  at the country sub-folder, which is what `fullPath` already encodes. */
export function justwatchUrl(fullPath: string | null): string {
  return fullPath ? `https://www.justwatch.com${fullPath}` : 'https://www.justwatch.com';
}

export function formatPrice(amount: number | null, currency: string | null, locale: string): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat(locale.replace('_', '-'), {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
