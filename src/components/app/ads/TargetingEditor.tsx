/**
 * TargetingEditor
 * ===============
 * POVR targeting controls shared by the campaign wizard and campaign editing:
 * badge tiers (with per-tier CPM), follower band, languages, Premium,
 * communities, behaviors, contextual categories and followers-of-creator.
 * Shows a LIVE audience estimate from real data (ads_estimate_audience RPC
 * over leaderboard_snapshots + membership/behavior tables) — no fictional
 * reach numbers.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getCategories } from '@/lib/api/dehub/feed';
import { useAudienceEstimate } from '@/hooks/use-ads';
import {
  AD_BEHAVIOR_OPTIONS,
  NO_BADGE_TIER,
  POVR_TIERS,
  formatCompact,
  tierLabel,
  type AdTargeting,
} from '@/lib/ads/povr';
import { getBadgeUrl } from '@/lib/staking-badges';

const LANGUAGE_OPTIONS = [
  ['en', 'English'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['fr', 'French'],
  ['de', 'German'], ['ru', 'Russian'], ['hi', 'Hindi'], ['zh', 'Chinese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['ar', 'Arabic'], ['tr', 'Turkish'],
  ['id', 'Indonesian'], ['vi', 'Vietnamese'], ['th', 'Thai'],
] as const;

interface TargetingEditorProps {
  value: AdTargeting;
  onChange: (next: AdTargeting) => void;
}

export function TargetingEditor({ value, onChange }: TargetingEditorProps) {
  const [creatorInput, setCreatorInput] = useState('');
  const [communitySearch, setCommunitySearch] = useState('');

  const { data: estimate, isFetching: estimating } = useAudienceEstimate(value);

  const { data: communities = [] } = useQuery({
    queryKey: ['ads-communities-list'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('communities' as never)
        .select('id, name, member_count' as never)
        .order('member_count' as never, { ascending: false })
        .limit(100);
      return (data as unknown as Array<{ id: string; name: string; member_count: number | null }>) ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['ads-categories-list'],
    staleTime: 300_000,
    queryFn: async () => {
      try {
        const cats = await getCategories();
        return cats.map((c) => c.name.toLowerCase()).slice(0, 30);
      } catch {
        return [] as string[];
      }
    },
  });

  const patch = (p: Partial<AdTargeting>) => {
    const next: AdTargeting = { ...value, ...p };
    // Drop empty keys so "{}" stays the honest "everyone" default.
    (Object.keys(next) as Array<keyof AdTargeting>).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === false) {
        delete next[k];
      }
    });
    onChange(next);
  };

  const toggleInArray = (key: 'tiers' | 'languages' | 'communities' | 'behaviors' | 'categories', item: string) => {
    const current = (value[key] as string[] | undefined) ?? [];
    patch({
      [key]: current.includes(item) ? current.filter((x) => x !== item) : [...current, item],
    } as Partial<AdTargeting>);
  };

  const addCreator = () => {
    const wallet = creatorInput.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) return;
    const current = value.followedCreators ?? [];
    if (!current.includes(wallet)) patch({ followedCreators: [...current, wallet] });
    setCreatorInput('');
  };

  const filteredCommunities = useMemo(() => {
    const q = communitySearch.trim().toLowerCase();
    const list = q ? communities.filter((c) => c.name?.toLowerCase().includes(q)) : communities;
    return list.slice(0, 12);
  }, [communities, communitySearch]);

  const allTiers = [
    { name: NO_BADGE_TIER.name, label: NO_BADGE_TIER.label, cpm: NO_BADGE_TIER.cpmUsd, min: 0 },
    ...POVR_TIERS.map((t) => ({ name: t.name, label: t.name, cpm: t.cpmUsd, min: t.min })),
  ];

  return (
    <div className="space-y-6">
      {/* Live estimate */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
          {estimating ? (
            <Loader2 className="w-5 h-5 text-foreground/70 animate-spin" />
          ) : (
            <Users className="w-5 h-5 text-foreground/70" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground leading-tight">
            {formatCompact(estimate?.audience ?? 0)} <span className="text-sm font-medium text-muted-foreground">tracked wallets</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Live estimate from on-chain holdings snapshots — No Badge &amp; guest reach is additional
            {value.followedCreators?.length ? ' · follower audiences resolve at approval' : ''}
          </p>
        </div>
      </div>

      {/* Badge tiers */}
      <div>
        <Label className="text-foreground">POVR badge tiers</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Target by verified DHB holdings. You pay each tier's CPM only when that tier sees your ad. Leave empty to reach everyone.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allTiers.map((tier) => {
            const selected = (value.tiers ?? []).includes(tier.name);
            const badgeUrl = tier.min >= 10_000 ? getBadgeUrl(tier.min) : null;
            return (
              <button
                key={tier.name}
                type="button"
                onClick={() => toggleInArray('tiers', tier.name)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                  selected
                    ? 'border-foreground/40 bg-foreground/10'
                    : 'border-foreground/10 bg-transparent hover:bg-foreground/5',
                )}
              >
                {badgeUrl ? (
                  <img src={badgeUrl} alt={tier.label} className="w-5 h-5 object-contain shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-foreground/15 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground truncate">{tier.label}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {/* Snapshots only discover ≥10k DHB wallets, so a count for
                        "No Badge" would drastically undersell it — it's the
                        whole remaining userbase + guests. */}
                    ${tier.cpm.toFixed(2)} CPM
                    {tier.name === NO_BADGE_TIER.name
                      ? ' · all other users & guests'
                      : estimate?.byTier?.[tier.name] !== undefined
                        ? ` · ${formatCompact(estimate.byTier[tier.name])}`
                        : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Follower band */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ads-follower-min" className="text-foreground">Min followers</Label>
          <Input
            id="ads-follower-min"
            type="number"
            min={0}
            placeholder="Any"
            value={value.followerMin ?? ''}
            onChange={(e) => patch({ followerMin: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ads-follower-max" className="text-foreground">Max followers</Label>
          <Input
            id="ads-follower-max"
            type="number"
            min={0}
            placeholder="Any"
            value={value.followerMax ?? ''}
            onChange={(e) => patch({ followerMax: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            className="mt-1"
          />
        </div>
      </div>

      {/* Behaviors */}
      <div>
        <Label className="text-foreground">Behaviors</Label>
        <p className="text-xs text-muted-foreground mb-2">Match users with real on-platform activity (all selected must match).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AD_BEHAVIOR_OPTIONS.map((b) => {
            const selected = (value.behaviors ?? []).includes(b.value);
            return (
              <label
                key={b.value}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors',
                  selected ? 'border-foreground/40 bg-foreground/10' : 'border-foreground/10 hover:bg-foreground/5',
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggleInArray('behaviors', b.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Premium + languages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={cn(
          'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors h-fit',
          value.premium ? 'border-foreground/40 bg-foreground/10' : 'border-foreground/10 hover:bg-foreground/5',
        )}>
          <Checkbox checked={!!value.premium} onCheckedChange={(c) => patch({ premium: c === true ? true : undefined })} className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium text-foreground">Premium subscribers only</span>
            <span className="block text-xs text-muted-foreground">Active DeHub Premium members</span>
          </span>
        </label>

        <div>
          <Label className="text-foreground">Languages</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {LANGUAGE_OPTIONS.map(([code, name]) => {
              const selected = (value.languages ?? []).includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleInArray('languages', code)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                    selected
                      ? 'border-foreground/40 bg-foreground/10 text-foreground'
                      : 'border-foreground/10 text-muted-foreground hover:bg-foreground/5',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Communities */}
      <div>
        <Label className="text-foreground">Communities</Label>
        <p className="text-xs text-muted-foreground mb-2">Reach active members of specific DeHub communities.</p>
        <Input
          placeholder="Search communities…"
          value={communitySearch}
          onChange={(e) => setCommunitySearch(e.target.value)}
          className="mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {filteredCommunities.map((c) => {
            const selected = (value.communities ?? []).includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleInArray('communities', c.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                  selected
                    ? 'border-foreground/40 bg-foreground/10 text-foreground'
                    : 'border-foreground/10 text-muted-foreground hover:bg-foreground/5',
                )}
              >
                {c.name}{c.member_count ? ` · ${formatCompact(c.member_count)}` : ''}
              </button>
            );
          })}
          {filteredCommunities.length === 0 && (
            <span className="text-xs text-muted-foreground">No communities found</span>
          )}
        </div>
      </div>

      {/* Contextual categories */}
      {categories.length > 0 && (
        <div>
          <Label className="text-foreground">Content categories (contextual)</Label>
          <p className="text-xs text-muted-foreground mb-2">Prefer placements next to matching content.</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const selected = (value.categories ?? []).includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleInArray('categories', cat)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs border transition-colors capitalize',
                    selected
                      ? 'border-foreground/40 bg-foreground/10 text-foreground'
                      : 'border-foreground/10 text-muted-foreground hover:bg-foreground/5',
                  )}
                >
                  #{cat}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Followers of creators */}
      <div>
        <Label htmlFor="ads-creator-input" className="text-foreground">Followers of creators</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Target the follower base of specific creators (wallet addresses). Audiences are materialized when your campaign is approved.
        </p>
        <div className="flex gap-2">
          <Input
            id="ads-creator-input"
            placeholder="0x… creator wallet"
            value={creatorInput}
            onChange={(e) => setCreatorInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCreator(); } }}
          />
          <button
            type="button"
            onClick={addCreator}
            className="px-4 rounded-xl text-sm font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground border border-foreground/10 transition-colors shrink-0"
          >
            Add
          </button>
        </div>
        {(value.followedCreators ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(value.followedCreators ?? []).map((w) => (
              <Badge key={w} variant="outline" className="font-mono text-[11px] gap-1 border-foreground/15 text-foreground">
                {w.slice(0, 6)}…{w.slice(-4)}
                <button
                  type="button"
                  onClick={() => patch({ followedCreators: (value.followedCreators ?? []).filter((x) => x !== w) })}
                  className="hover:text-destructive"
                  aria-label={`Remove ${w}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Summary of tier labels for review contexts */}
      {(value.tiers ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Selected tiers: {(value.tiers ?? []).map(tierLabel).join(', ')}
        </p>
      )}
    </div>
  );
}
