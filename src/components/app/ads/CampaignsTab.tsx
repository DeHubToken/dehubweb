/**
 * CampaignsTab
 * ============
 * Campaign list + full campaign detail: status lifecycle actions
 * (submit / withdraw / pause / resume / archive / delete), real analytics
 * (daily chart, per-tier POVR breakdown), budget & targeting editing, and
 * creative management (add / delete — edits re-enter moderation via the DB
 * guard trigger).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  ChevronLeft, Loader2, Pause, Play, Plus, Rocket, Trash2, Archive,
  Upload, PencilLine, AlertTriangle, ImageIcon, Film, Type,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAdCampaign, useAdCampaigns, useAdCreatives, useCampaignStats,
  useCreateCreative, useDeleteCampaign, useDeleteCreative, useUpdateCampaign,
  uploadAdMedia,
} from '@/hooks/use-ads';
import { StatusPill } from '@/components/app/ads/AdsOverviewTab';
import { TargetingEditor } from '@/components/app/ads/TargetingEditor';
import { SponsoredAdCard } from '@/components/app/cards/SponsoredAdCard';
import {
  formatCompact, formatUsd, tierLabel,
  type AdCreative, type AdTargeting, type CreativeKind, type ServedAd,
} from '@/lib/ads/povr';

interface CampaignsTabProps {
  focusCampaignId: string | null;
  onFocusHandled: () => void;
  onNewCampaign: () => void;
}

export function CampaignsTab({ focusCampaignId, onFocusHandled, onNewCampaign }: CampaignsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: campaigns = [], isLoading } = useAdCampaigns();

  useEffect(() => {
    if (focusCampaignId) {
      setSelectedId(focusCampaignId);
      onFocusHandled();
    }
  }, [focusCampaignId, onFocusHandled]);

  if (selectedId) {
    return <CampaignDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-10 text-center space-y-3">
          <Rocket className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          <Button variant="glass" size="sm" onClick={onNewCampaign}>
            <Plus className="w-4 h-4 mr-1" /> Create your first campaign
          </Button>
        </div>
      ) : (
        campaigns.map((c) => {
          const progress = Math.min(Number(c.spent_usd) / Math.max(Number(c.total_budget_usd), 0.01), 1);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className="w-full rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 hover:bg-foreground/[0.06] transition-colors text-left"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                <StatusPill status={c.status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground mb-2">
                <span>{formatUsd(c.spent_usd)} of {formatUsd(c.total_budget_usd)}</span>
                <span>{formatUsd(c.daily_budget_usd)}/day</span>
              </div>
              <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                <div className="h-full rounded-full bg-foreground/50" style={{ width: `${progress * 100}%` }} />
              </div>
              {c.status === 'rejected' && c.review_note && (
                <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {c.review_note}
                </p>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign detail
// ---------------------------------------------------------------------------

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: campaign, isLoading } = useAdCampaign(id);
  const { data: creatives = [] } = useAdCreatives(id);
  const { data: stats = [] } = useCampaignStats(id);
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const [editingTargeting, setEditingTargeting] = useState(false);
  const [targetingDraft, setTargetingDraft] = useState<AdTargeting | null>(null);
  const [addingCreative, setAddingCreative] = useState(false);

  const totals = useMemo(() => {
    let impressions = 0, clicks = 0, spend = 0;
    const byTier: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    for (const s of stats) {
      impressions += s.impressions;
      clicks += s.clicks;
      spend += Number(s.spend_usd);
      for (const [tier, v] of Object.entries(s.by_tier || {})) {
        const agg = byTier[tier] ?? { impressions: 0, clicks: 0, spend: 0 };
        agg.impressions += v.impressions ?? 0;
        agg.clicks += v.clicks ?? 0;
        agg.spend += Number(v.spend ?? 0);
        byTier[tier] = agg;
      }
    }
    return { impressions, clicks, spend, ctr: impressions ? (clicks / impressions) * 100 : 0, byTier };
  }, [stats]);

  const chartData = useMemo(() =>
    stats.map((s) => ({ day: s.day.slice(5), impressions: s.impressions, clicks: s.clicks, spend: Number(s.spend_usd) })),
  [stats]);

  if (isLoading || !campaign) {
    return (
      <div className="py-16 text-center">
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /> : (
          <p className="text-sm text-muted-foreground">Campaign not found.</p>
        )}
      </div>
    );
  }

  const setStatus = (status: string, successMsg: string) =>
    updateCampaign.mutate({ id, status }, { onSuccess: () => toast.success(successMsg) });

  const actions: Array<{ label: string; icon: typeof Play; onClick: () => void; danger?: boolean }> = [];
  if (campaign.status === 'draft') {
    actions.push({ label: 'Submit for review', icon: Rocket, onClick: () => setStatus('pending_review', 'Submitted for review') });
    actions.push({
      label: 'Delete', icon: Trash2, danger: true,
      onClick: () => deleteCampaign.mutate(id, { onSuccess: () => { toast.success('Draft deleted'); onBack(); } }),
    });
  }
  if (campaign.status === 'pending_review') {
    actions.push({ label: 'Withdraw to draft', icon: PencilLine, onClick: () => setStatus('draft', 'Moved back to draft') });
  }
  if (campaign.status === 'rejected') {
    actions.push({ label: 'Resubmit', icon: Rocket, onClick: () => setStatus('pending_review', 'Resubmitted for review') });
  }
  if (campaign.status === 'active') {
    actions.push({ label: 'Pause', icon: Pause, onClick: () => setStatus('paused', 'Campaign paused') });
  }
  if (campaign.status === 'paused') {
    actions.push({ label: 'Resume', icon: Play, onClick: () => setStatus('active', 'Campaign resumed') });
    actions.push({ label: 'Archive', icon: Archive, onClick: () => setStatus('archived', 'Campaign archived') });
  }
  if (campaign.status === 'completed') {
    actions.push({ label: 'Archive', icon: Archive, onClick: () => setStatus('archived', 'Campaign archived') });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onBack} aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground truncate">{campaign.name}</h2>
              <StatusPill status={campaign.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">{campaign.objective} · cap {campaign.frequency_cap}/day</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.danger ? 'destructive' : 'glass'}
              disabled={updateCampaign.isPending || deleteCampaign.isPending}
              onClick={a.onClick}
            >
              <a.icon className="w-3.5 h-3.5 mr-1.5" /> {a.label}
            </Button>
          ))}
        </div>
      </div>

      {campaign.status === 'rejected' && campaign.review_note && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {campaign.review_note}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Spend', `${formatUsd(totals.spend)} / ${formatUsd(campaign.total_budget_usd)}`],
          ['Impressions', formatCompact(totals.impressions)],
          ['Clicks', `${formatCompact(totals.clicks)} · ${totals.ctr.toFixed(2)}%`],
          ['Daily budget', `${formatUsd(campaign.daily_budget_usd)}/day`],
        ].map(([label, val]) => (
          <div key={label} className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-3.5">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-base font-bold text-foreground">{val}</p>
          </div>
        ))}
      </div>

      {/* Performance chart */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Daily performance</p>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No delivery yet — stats appear once the campaign serves.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.35} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.35} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={false} name="Impressions" />
              <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} name="Clicks" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* POVR tier breakdown */}
      {Object.keys(totals.byTier).length > 0 && (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Performance by badge tier</p>
          <div className="space-y-2">
            {Object.entries(totals.byTier)
              .sort((a, b) => b[1].spend - a[1].spend)
              .map(([tier, v]) => (
                <div key={tier} className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 px-3.5 py-2.5 text-sm">
                  <span className="font-medium text-foreground">{tierLabel(tier)}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatCompact(v.impressions)} imp · {formatCompact(v.clicks)} clicks · {formatUsd(v.spend)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Budget editing */}
      <BudgetEditor campaign={campaign} />

      {/* Targeting */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-foreground">Targeting</p>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (editingTargeting && targetingDraft) {
                updateCampaign.mutate(
                  { id, targeting: targetingDraft },
                  { onSuccess: () => toast.success('Targeting updated') },
                );
              }
              setTargetingDraft(editingTargeting ? null : { ...(campaign.targeting || {}) });
              setEditingTargeting((v) => !v);
            }}
          >
            <PencilLine className="w-3.5 h-3.5 mr-1" /> {editingTargeting ? 'Save targeting' : 'Edit'}
          </Button>
        </div>
        {editingTargeting && targetingDraft ? (
          <TargetingEditor value={targetingDraft} onChange={setTargetingDraft} />
        ) : (
          <TargetingSummary targeting={campaign.targeting || {}} />
        )}
      </div>

      {/* Creatives */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Creatives</p>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setAddingCreative((v) => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> {addingCreative ? 'Cancel' : 'Add creative'}
          </Button>
        </div>

        {addingCreative && (
          <InlineCreativeForm campaignId={id} onDone={() => setAddingCreative(false)} />
        )}

        {creatives.length === 0 && !addingCreative ? (
          <p className="text-sm text-muted-foreground py-3 text-center">No creatives — add one so the campaign can serve.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {creatives.map((cr) => <CreativeCard key={cr.id} creative={cr} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetingSummary({ targeting }: { targeting: AdTargeting }) {
  const rows: string[] = [];
  if (targeting.tiers?.length) rows.push(`Tiers: ${targeting.tiers.map(tierLabel).join(', ')}`);
  if (targeting.followerMin != null || targeting.followerMax != null) {
    rows.push(`Followers: ${targeting.followerMin ?? 0}–${targeting.followerMax ?? '∞'}`);
  }
  if (targeting.languages?.length) rows.push(`Languages: ${targeting.languages.join(', ')}`);
  if (targeting.premium) rows.push('Premium subscribers only');
  if (targeting.communities?.length) rows.push(`${targeting.communities.length} communit${targeting.communities.length === 1 ? 'y' : 'ies'}`);
  if (targeting.behaviors?.length) rows.push(`Behaviors: ${targeting.behaviors.join(', ')}`);
  if (targeting.categories?.length) rows.push(`Categories: ${targeting.categories.map((c) => `#${c}`).join(' ')}`);
  if (targeting.followedCreators?.length) rows.push(`Followers of ${targeting.followedCreators.length} creator(s)`);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Everyone (no filters)</p>;
  return (
    <ul className="text-sm text-muted-foreground space-y-1">
      {rows.map((r) => <li key={r}>· {r}</li>)}
    </ul>
  );
}

function BudgetEditor({ campaign }: { campaign: { id: string; daily_budget_usd: number; total_budget_usd: number; spent_usd: number } }) {
  const updateCampaign = useUpdateCampaign();
  const [daily, setDaily] = useState(String(campaign.daily_budget_usd));
  const [total, setTotal] = useState(String(campaign.total_budget_usd));
  const dirty = Number(daily) !== Number(campaign.daily_budget_usd) || Number(total) !== Number(campaign.total_budget_usd);

  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
      <p className="text-sm font-semibold text-foreground mb-3">Budget</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="det-daily" className="text-foreground text-xs">Daily (USD)</Label>
          <Input id="det-daily" type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="det-total" className="text-foreground text-xs">Total (USD)</Label>
          <Input id="det-total" type="number" min={Math.max(1, Number(campaign.spent_usd))} value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1" />
        </div>
      </div>
      {dirty && (
        <Button
          size="sm"
          variant="glass"
          className="mt-3"
          disabled={updateCampaign.isPending || Number(daily) < 1 || Number(total) < Number(campaign.spent_usd)}
          onClick={() =>
            updateCampaign.mutate(
              { id: campaign.id, daily_budget_usd: Number(daily), total_budget_usd: Number(total) },
              { onSuccess: () => toast.success('Budget updated') },
            )
          }
        >
          {updateCampaign.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save budget
        </Button>
      )}
    </div>
  );
}

const CREATIVE_STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-500',
  pending: 'bg-yellow-500/15 text-yellow-500',
  rejected: 'bg-red-500/15 text-red-500',
};

function CreativeCard({ creative }: { creative: AdCreative }) {
  const deleteCreative = useDeleteCreative();
  const ad: ServedAd = {
    serveId: `creative-${creative.id}`,
    token: '',
    campaignId: creative.campaign_id,
    creativeId: creative.id,
    kind: creative.kind,
    mediaUrl: creative.media_url,
    thumbnailUrl: creative.thumbnail_url,
    headline: creative.headline,
    body: creative.body,
    ctaLabel: creative.cta_label,
    ctaUrl: creative.cta_url,
    advertiser: 'Preview',
    width: creative.width,
    height: creative.height,
    durationSeconds: creative.duration_seconds,
  };
  return (
    <div className="rounded-xl border border-foreground/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium capitalize', CREATIVE_STATUS_STYLES[creative.status])}>
          {creative.status}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 text-muted-foreground hover:text-red-400"
          disabled={deleteCreative.isPending}
          onClick={() => deleteCreative.mutate(
            { id: creative.id, campaign_id: creative.campaign_id },
            { onSuccess: () => toast.success('Creative deleted') },
          )}
          aria-label="Delete creative"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      {creative.status === 'rejected' && creative.review_note && (
        <p className="text-xs text-red-400">{creative.review_note}</p>
      )}
      <div className="pointer-events-none">
        <SponsoredAdCard ad={ad} />
      </div>
    </div>
  );
}

function InlineCreativeForm({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const { walletAddress } = useAuth();
  const createCreative = useCreateCreative();
  const [kind, setKind] = useState<CreativeKind>('image');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Learn more');
  const [ctaUrl, setCtaUrl] = useState('');

  const valid = headline.trim() && (kind === 'text' || mediaUrl);

  return (
    <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-3.5 space-y-3">
      <div className="flex gap-2">
        {([['image', ImageIcon], ['video', Film], ['text', Type]] as const).map(([k, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs capitalize transition-colors',
              kind === k ? 'border-foreground/40 bg-foreground/10 text-foreground' : 'border-foreground/10 text-muted-foreground hover:bg-foreground/5',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {k}
          </button>
        ))}
      </div>
      {kind !== 'text' && (
        <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/15 px-3 py-4 cursor-pointer hover:bg-foreground/5 transition-colors">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-foreground" /> : (
            <>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{mediaUrl ? 'Replace file' : `Upload ${kind}`}</span>
            </>
          )}
          <input
            type="file"
            accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !walletAddress) return;
              setUploading(true);
              try {
                setMediaUrl(await uploadAdMedia(walletAddress, f, f.type));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Upload failed');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
      )}
      <Input placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} />
      <Textarea placeholder="Body (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={280} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="CTA label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={24} />
        <Input placeholder="CTA link (https://…)" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onDone}>Cancel</Button>
        <Button
          size="sm"
          variant="glass"
          disabled={!valid || createCreative.isPending || uploading}
          onClick={() =>
            createCreative.mutate({
              campaign_id: campaignId,
              kind,
              media_url: kind === 'text' ? null : mediaUrl,
              headline: headline.trim(),
              body: body.trim() || null,
              cta_label: ctaLabel.trim() || 'Learn more',
              cta_url: ctaUrl.trim() || null,
            }, {
              onSuccess: () => { toast.success('Creative added — pending review'); onDone(); },
            })
          }
        >
          {createCreative.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Add creative
        </Button>
      </div>
    </div>
  );
}
