/**
 * use-ad-serving
 * ==============
 * Feed-side ad delivery: fetches served ads from the ads-serve edge function
 * and reports viewability impressions / clicks to ads-track. Each served ad
 * carries a signed token; the server prices and dedupes — the client only
 * decides *when* an ad became viewable (50% visible for ≥1s, IAB-style).
 * Logged-out viewers get a persistent anon id for frequency capping.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ServedAd } from '@/lib/ads/povr';

const ANON_KEY = 'dehub_ads_anon_id';

function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

function trackUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ads-track`;
}

/** serveIds already reported this session (server dedupes too). */
const reported = new Set<string>();

export function trackAdEvent(ad: ServedAd, event: 'impression' | 'click'): void {
  const dedupeKey = `${ad.serveId}:${event}`;
  if (reported.has(dedupeKey)) return;
  reported.add(dedupeKey);

  const body = JSON.stringify({ token: ad.token, event });
  const url = trackUrl();
  const headers = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };

  // keepalive so click beacons survive the CTA navigation.
  fetch(url, { method: 'POST', headers, body, keepalive: true }).catch(() => {
    reported.delete(dedupeKey); // allow retry on transient failure
  });
}

export interface UseServedAdsOptions {
  count?: number;
  categories?: string[];
  enabled?: boolean;
}

/**
 * Fetch ads for a surface. Refetches every 2 minutes so long sessions rotate
 * inventory; serve tokens outlive the cache window (30 min TTL server-side).
 */
export function useServedAds(surface: string, options: UseServedAdsOptions = {}) {
  const { walletAddress } = useAuth();
  const { count = 3, categories, enabled = true } = options;

  return useQuery({
    queryKey: ['served-ads', surface, walletAddress?.toLowerCase() ?? 'anon', count],
    enabled,
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<ServedAd[]> => {
      const { data, error } = await supabase.functions.invoke('ads-serve', {
        body: {
          viewerWallet: walletAddress?.toLowerCase() || undefined,
          anonId: getAnonId(),
          surface,
          categories,
          count,
        },
      });
      if (error || data?.error) return []; // ad failures must never break feeds
      return (data?.ads as ServedAd[]) ?? [];
    },
  });
}

/**
 * Viewability tracker: fires the impression beacon once the element has been
 * ≥50% visible for 1 continuous second.
 */
export function useAdImpression(ad: ServedAd | null | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ad) return;
    if (reported.has(`${ad.serveId}:impression`)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timerRef.current) {
            timerRef.current = setTimeout(() => {
              trackAdEvent(ad, 'impression');
              observer.disconnect();
            }, 1000);
          }
        } else if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ad]);

  const onClick = useCallback(() => {
    if (!ad) return;
    trackAdEvent(ad, 'click');
    const url = ad.ctaUrl;
    if (url) {
      window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
    }
  }, [ad]);

  return { ref, onClick };
}
