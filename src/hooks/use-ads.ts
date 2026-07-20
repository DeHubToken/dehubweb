/**
 * use-ads
 * =======
 * Data layer for the POVR ads portal (/app/ads): advertiser account,
 * campaigns, creatives, media upload, stats, payments, top-ups and live
 * audience estimates. All owner-scoped reads/writes go through the
 * x-wallet-address header (withWalletHeader) per house RLS convention.
 *
 * The ad tables are newer than the generated Database types, so queries run
 * through an untyped alias (adsDb) with hand-written row types from
 * src/lib/ads/povr.ts — regenerating types.ts later is optional sugar.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  AdAccount,
  AdCampaign,
  AdCreative,
  AdDailyStat,
  AdPayment,
  AdTargeting,
  AudienceEstimate,
  CreativeKind,
} from '@/lib/ads/povr';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adsDb = supabase as unknown as SupabaseClient<any, 'public', any>;

const keys = {
  account: (w: string | null) => ['ads', 'account', w] as const,
  campaigns: (w: string | null) => ['ads', 'campaigns', w] as const,
  campaign: (id: string) => ['ads', 'campaign', id] as const,
  creatives: (campaignId: string) => ['ads', 'creatives', campaignId] as const,
  stats: (campaignId: string) => ['ads', 'stats', campaignId] as const,
  allStats: (w: string | null) => ['ads', 'all-stats', w] as const,
  payments: (w: string | null) => ['ads', 'payments', w] as const,
  estimate: (t: AdTargeting) => ['ads', 'estimate', JSON.stringify(t)] as const,
};

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export function useAdAccount() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  return useQuery({
    queryKey: keys.account(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdAccount | null> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_accounts').select('*').eq('wallet_address', wallet!).maybeSingle(),
        wallet,
      );
      if (error) throw error;
      return (data as AdAccount) ?? null;
    },
  });
}

export function useEnsureAdAccount() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields?: { company_name?: string; website?: string }) => {
      if (!wallet) throw new Error('Connect a wallet first');
      // Insert-ignore first: merge-duplicates upsert would try to UPDATE
      // wallet_address, which clients hold no column grant for.
      const { error: insErr } = await withWalletHeader(
        adsDb.from('ad_accounts').upsert(
          { wallet_address: wallet },
          { onConflict: 'wallet_address', ignoreDuplicates: true },
        ),
        wallet,
      );
      if (insErr) throw insErr;
      if (fields && Object.keys(fields).length > 0) {
        const { error: updErr } = await withWalletHeader(
          adsDb.from('ad_accounts').update(fields).eq('wallet_address', wallet),
          wallet,
        );
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.account(wallet) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function useAdCampaigns() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  return useQuery({
    queryKey: keys.campaigns(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdCampaign[]> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
        wallet,
      );
      if (error) throw error;
      return (data as AdCampaign[]) ?? [];
    },
  });
}

export function useAdCampaign(id: string | undefined) {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  return useQuery({
    queryKey: keys.campaign(id ?? 'none'),
    enabled: !!wallet && !!id,
    queryFn: async (): Promise<AdCampaign | null> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_campaigns').select('*').eq('id', id!).maybeSingle(),
        wallet,
      );
      if (error) throw error;
      return (data as AdCampaign) ?? null;
    },
  });
}

export interface CampaignDraft {
  name: string;
  objective: string;
  daily_budget_usd: number;
  total_budget_usd: number;
  start_at?: string;
  end_at?: string | null;
  targeting: AdTargeting;
  frequency_cap?: number;
  cta_url?: string | null;
  status?: 'draft' | 'pending_review';
}

export function useCreateCampaign() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CampaignDraft): Promise<AdCampaign> => {
      if (!wallet) throw new Error('Connect a wallet first');
      const { data, error } = await withWalletHeader(
        adsDb
          .from('ad_campaigns')
          .insert({ ...draft, wallet_address: wallet })
          .select('*')
          .single(),
        wallet,
      );
      if (error) throw error;
      return data as AdCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(wallet) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCampaign() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Omit<Partial<CampaignDraft>, 'status'> & { id: string; status?: string }) => {
      const { error } = await withWalletHeader(
        adsDb.from('ad_campaigns').update(patch).eq('id', id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.campaigns(wallet) });
      qc.invalidateQueries({ queryKey: keys.campaign(vars.id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCampaign() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await withWalletHeader(
        adsDb.from('ad_campaigns').delete().eq('id', id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(wallet) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Creatives + media upload
// ---------------------------------------------------------------------------

export function useAdCreatives(campaignId: string | undefined) {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  return useQuery({
    queryKey: keys.creatives(campaignId ?? 'none'),
    enabled: !!wallet && !!campaignId,
    queryFn: async (): Promise<AdCreative[]> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_creatives').select('*').eq('campaign_id', campaignId!).order('created_at'),
        wallet,
      );
      if (error) throw error;
      return (data as AdCreative[]) ?? [];
    },
  });
}

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

/** Upload creative media to the public ad-media bucket → public URL. */
export async function uploadAdMedia(wallet: string, file: File | Blob, contentType: string): Promise<string> {
  const ext = MEDIA_EXT[contentType] ?? contentType.split('/')[1] ?? 'bin';
  const path = `${wallet.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('ad-media').upload(path, file, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ad-media').getPublicUrl(path);
  return data.publicUrl;
}

export interface CreativeDraft {
  campaign_id: string;
  kind: CreativeKind;
  media_url?: string | null;
  thumbnail_url?: string | null;
  headline: string;
  body?: string | null;
  cta_label?: string;
  cta_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
}

export function useCreateCreative() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CreativeDraft): Promise<AdCreative> => {
      if (!wallet) throw new Error('Connect a wallet first');
      const { data, error } = await withWalletHeader(
        adsDb
          .from('ad_creatives')
          .insert({ ...draft, wallet_address: wallet })
          .select('*')
          .single(),
        wallet,
      );
      if (error) throw error;
      return data as AdCreative;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: keys.creatives(d.campaign_id) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCreative() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id, ...patch }: Partial<CreativeDraft> & { id: string; campaign_id: string }) => {
      const { error } = await withWalletHeader(
        adsDb.from('ad_creatives').update(patch).eq('id', id),
        wallet,
      );
      if (error) throw error;
      return campaign_id;
    },
    onSuccess: (campaignId) => qc.invalidateQueries({ queryKey: keys.creatives(campaignId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCreative() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id }: { id: string; campaign_id: string }) => {
      const { error } = await withWalletHeader(
        adsDb.from('ad_creatives').delete().eq('id', id),
        wallet,
      );
      if (error) throw error;
      return campaign_id;
    },
    onSuccess: (campaignId) => qc.invalidateQueries({ queryKey: keys.creatives(campaignId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * /app/ads lives in PersistentPageCache (never unmounts), so stats polling
 * must stop when the user navigates away — otherwise one visit to the ads
 * portal leaves 30s Supabase polls running for the whole session. Reactive:
 * returning to the route restarts the interval.
 */
function useIsAdsRouteActive(): boolean {
  const { pathname } = useLocation();
  return pathname === '/app/ads';
}

export function useCampaignStats(campaignId: string | undefined) {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const isAdsRouteActive = useIsAdsRouteActive();
  return useQuery({
    queryKey: keys.stats(campaignId ?? 'none'),
    enabled: !!wallet && !!campaignId,
    refetchInterval: isAdsRouteActive ? 30_000 : false,
    queryFn: async (): Promise<AdDailyStat[]> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_daily_stats').select('*').eq('campaign_id', campaignId!).order('day'),
        wallet,
      );
      if (error) throw error;
      return (data as AdDailyStat[]) ?? [];
    },
  });
}

/** All stats across the advertiser's campaigns (dashboard KPIs). */
export function useAllCampaignStats(campaignIds: string[]) {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const isAdsRouteActive = useIsAdsRouteActive();
  return useQuery({
    queryKey: [...keys.allStats(wallet), campaignIds.join(',')],
    enabled: !!wallet && campaignIds.length > 0,
    refetchInterval: isAdsRouteActive ? 30_000 : false,
    queryFn: async (): Promise<AdDailyStat[]> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_daily_stats').select('*').in('campaign_id', campaignIds).order('day'),
        wallet,
      );
      if (error) throw error;
      return (data as AdDailyStat[]) ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Payments + top-up
// ---------------------------------------------------------------------------

export function useAdPayments() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  return useQuery({
    queryKey: keys.payments(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdPayment[]> => {
      const { data, error } = await withWalletHeader(
        adsDb.from('ad_payments').select('*').order('created_at', { ascending: false }).limit(50),
        wallet,
      );
      if (error) throw error;
      return (data as AdPayment[]) ?? [];
    },
  });
}

/** Verify an on-chain DHB transfer & credit the ad account. */
export function useTopUpCredit() {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txHash: string) => {
      if (!wallet) throw new Error('Connect a wallet first');
      const { data, error } = await supabase.functions.invoke('ads-topup', {
        body: { txHash },
        headers: { 'x-wallet-address': wallet },
      });
      if (error) {
        // Surface the function's JSON error body when present.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any)?.context;
        let msg = error.message;
        try {
          const parsed = typeof ctx?.body === 'string' ? JSON.parse(ctx.body) : null;
          if (parsed?.error) msg = parsed.error;
        } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data as { ok: true; usdCredited: number; balanceUsd: number; dhbAmount: number; chain: string };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: keys.account(wallet) });
      qc.invalidateQueries({ queryKey: keys.payments(wallet) });
      toast.success(`Credited $${d.usdCredited.toFixed(2)} to your ads balance`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Audience estimation (live counts from real data)
// ---------------------------------------------------------------------------

export function useAudienceEstimate(targeting: AdTargeting, enabled = true) {
  return useQuery({
    queryKey: keys.estimate(targeting),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AudienceEstimate> => {
      const { data, error } = await adsDb.rpc('ads_estimate_audience', { p_targeting: targeting });
      if (error) throw error;
      return (data as AudienceEstimate) ?? { audience: 0, byTier: {} };
    },
  });
}
