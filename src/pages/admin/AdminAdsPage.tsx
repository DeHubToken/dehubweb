/**
 * Admin — Ads review queue (/admin/ads)
 * =====================================
 * Moderation for POVR ads: pending campaigns (budget/targeting summary) and
 * pending creatives (full native-card preview). Actions go through the
 * ads-admin edge function, authenticated with the DeHub ADMIN bearer token —
 * the service role flips statuses only after that token validates against
 * the DeHub API. Approving a followers-of-creator campaign also materializes
 * its audience.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X, RefreshCw, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAdminToken } from '@/lib/api/dehub/admin';
import { SponsoredAdCard } from '@/components/app/cards/SponsoredAdCard';
import { formatUsd, tierLabel, type AdTargeting, type ServedAd } from '@/lib/ads/povr';

interface QueueCampaign {
  id: string;
  wallet_address: string;
  name: string;
  objective: string;
  daily_budget_usd: number;
  total_budget_usd: number;
  start_at: string;
  end_at: string | null;
  targeting: AdTargeting;
  frequency_cap: number;
  cta_url: string | null;
  created_at: string;
}

interface QueueCreative {
  id: string;
  campaign_id: string;
  wallet_address: string;
  kind: 'image' | 'video' | 'text';
  media_url: string | null;
  thumbnail_url: string | null;
  headline: string;
  body: string | null;
  cta_label: string;
  cta_url: string | null;
  created_at: string;
  campaign: { id: string; name: string; status: string } | null;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ads-admin`;

async function adsAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error('Admin session expired');
  const res = await fetch(`${FN_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

function targetingSummary(t: AdTargeting): string {
  const parts: string[] = [];
  if (t.tiers?.length) parts.push(`tiers: ${t.tiers.map(tierLabel).join(', ')}`);
  if (t.followerMin != null || t.followerMax != null) parts.push(`followers ${t.followerMin ?? 0}–${t.followerMax ?? '∞'}`);
  if (t.languages?.length) parts.push(`langs: ${t.languages.join(',')}`);
  if (t.premium) parts.push('premium');
  if (t.communities?.length) parts.push(`${t.communities.length} communities`);
  if (t.behaviors?.length) parts.push(t.behaviors.join(','));
  if (t.categories?.length) parts.push(t.categories.map((c) => `#${c}`).join(' '));
  if (t.followedCreators?.length) parts.push(`followers of ${t.followedCreators.length} creator(s)`);
  return parts.length ? parts.join(' · ') : 'everyone';
}

export default function AdminAdsPage() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-ads-queue'],
    queryFn: () => adsAdminFetch<{ campaigns: QueueCampaign[]; creatives: QueueCreative[] }>('?action=queue'),
    refetchInterval: 60_000,
  });

  const moderate = useMutation({
    mutationFn: (vars: { type: 'campaign' | 'creative'; id: string; action: 'approve' | 'reject' }) =>
      adsAdminFetch('', {
        method: 'POST',
        body: JSON.stringify({ ...vars, note: notes[vars.id]?.trim() || undefined }),
      }),
    onSuccess: (_d, vars) => {
      toast.success(`${vars.type === 'campaign' ? 'Campaign' : 'Creative'} ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ['admin-ads-queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campaigns = data?.campaigns ?? [];
  const creatives = data?.creatives ?? [];

  return (
    <AdminShell title="Ads review">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Ads review queue</h1>
            <p className="text-sm text-white/50">
              {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'} · {creatives.length} creative{creatives.length === 1 ? '' : 's'} pending
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </Button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-white/40 mx-auto" /></div>
        ) : campaigns.length === 0 && creatives.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Megaphone className="w-8 h-8 text-white/25 mx-auto" />
            <p className="text-sm text-white/50">Queue is clear. Nothing pending review.</p>
          </div>
        ) : (
          <>
            {/* Campaigns */}
            {campaigns.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Campaigns</h2>
                {campaigns.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{c.name}</p>
                        <p className="text-xs text-white/50 font-mono">{c.wallet_address}</p>
                        <p className="text-xs text-white/60 mt-1">
                          {formatUsd(c.daily_budget_usd)}/day · {formatUsd(c.total_budget_usd)} total · cap {c.frequency_cap}/day · <span className="capitalize">{c.objective}</span>
                        </p>
                        <p className="text-xs text-white/60 mt-0.5">Targeting: {targetingSummary(c.targeting || {})}</p>
                        {c.cta_url && (
                          <a href={c.cta_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all">
                            {c.cta_url}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ type: 'campaign', id: c.id, action: 'approve' })}
                        >
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ type: 'campaign', id: c.id, action: 'reject' })}
                        >
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Review note (sent to advertiser on reject)"
                      value={notes[c.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
                ))}
              </section>
            )}

            {/* Creatives */}
            {creatives.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Creatives</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {creatives.map((cr) => {
                    const previewAd: ServedAd = {
                      serveId: `admin-${cr.id}`,
                      token: '',
                      campaignId: cr.campaign_id,
                      creativeId: cr.id,
                      kind: cr.kind,
                      mediaUrl: cr.media_url,
                      thumbnailUrl: cr.thumbnail_url,
                      headline: cr.headline,
                      body: cr.body,
                      ctaLabel: cr.cta_label,
                      ctaUrl: cr.cta_url,
                      advertiser: cr.campaign?.name || cr.wallet_address.slice(0, 10),
                      width: null,
                      height: null,
                      durationSeconds: null,
                    };
                    return (
                      <div key={cr.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-white/80 truncate">
                              {cr.campaign?.name ?? 'Unknown campaign'}{' '}
                              <span className="text-white/40 capitalize">({cr.kind})</span>
                            </p>
                            <p className="text-[11px] text-white/40 font-mono truncate">{cr.wallet_address}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                              disabled={moderate.isPending}
                              onClick={() => moderate.mutate({ type: 'creative', id: cr.id, action: 'approve' })}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8"
                              disabled={moderate.isPending}
                              onClick={() => moderate.mutate({ type: 'creative', id: cr.id, action: 'reject' })}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/40 p-3 pointer-events-none dark">
                          <SponsoredAdCard ad={previewAd} />
                        </div>
                        {cr.cta_url && (
                          <a href={cr.cta_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all block">
                            CTA → {cr.cta_url}
                          </a>
                        )}
                        <Input
                          placeholder="Review note"
                          value={notes[cr.id] ?? ''}
                          onChange={(e) => setNotes((n) => ({ ...n, [cr.id]: e.target.value }))}
                          className="bg-white/5 border-white/10 text-white text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
