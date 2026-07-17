/**
 * CampaignWizard
 * ==============
 * Four-step campaign creation: (1) creative — upload media, write copy, see a
 * LIVE native-card preview; (2) POVR targeting with real audience estimates;
 * (3) budget & schedule with honest projections from published CPMs;
 * (4) review → save draft or submit for moderation. Creates the ad account
 * row on first use.
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, ImageIcon, Film, Type, ChevronLeft, ChevronRight, Rocket, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCreateCampaign,
  useCreateCreative,
  useEnsureAdAccount,
  useAudienceEstimate,
  uploadAdMedia,
} from '@/hooks/use-ads';
import { TargetingEditor } from '@/components/app/ads/TargetingEditor';
import { SponsoredAdCard } from '@/components/app/cards/SponsoredAdCard';
import {
  blendedCpmUsd,
  formatCompact,
  formatUsd,
  type AdTargeting,
  type CreativeKind,
  type ServedAd,
} from '@/lib/ads/povr';

interface CampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (campaignId: string) => void;
}

const STEPS = ['Creative', 'Audience', 'Budget', 'Review'] as const;

export function CampaignWizard({ open, onOpenChange, onCreated }: CampaignWizardProps) {
  const { walletAddress } = useAuth();
  const [step, setStep] = useState(0);

  // Step 1 — creative
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('awareness');
  const [kind, setKind] = useState<CreativeKind>('image');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'media' | 'thumb' | null>(null);
  const [headline, setHeadline] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Learn more');
  const [ctaUrl, setCtaUrl] = useState('');

  // Step 2 — targeting
  const [targeting, setTargeting] = useState<AdTargeting>({});

  // Step 3 — budget (defaults sized to crypto-native CPMs — $100+ per 1000)
  const [dailyBudget, setDailyBudget] = useState(250);
  const [totalBudget, setTotalBudget] = useState(2500);
  const [durationDays, setDurationDays] = useState(14);
  const [frequencyCap, setFrequencyCap] = useState(4);

  const [submitting, setSubmitting] = useState(false);

  const createCampaign = useCreateCampaign();
  const createCreative = useCreateCreative();
  const ensureAccount = useEnsureAdAccount();
  const { data: estimate } = useAudienceEstimate(targeting, open && step >= 1);

  const previewAd: ServedAd = useMemo(() => ({
    serveId: 'preview',
    token: '',
    campaignId: 'preview',
    creativeId: 'preview',
    kind,
    mediaUrl,
    thumbnailUrl,
    headline: headline || 'Your headline appears here',
    body: bodyText || null,
    ctaLabel: ctaLabel || 'Learn more',
    ctaUrl: ctaUrl || null,
    advertiser: 'Your brand',
    width: null,
    height: null,
    durationSeconds: null,
  }), [kind, mediaUrl, thumbnailUrl, headline, bodyText, ctaLabel, ctaUrl]);

  const projections = useMemo(() => {
    const cpm = blendedCpmUsd(targeting.tiers ?? []);
    const audience = estimate?.audience ?? 0;
    const budgetImpressionsPerDay = (dailyBudget / cpm) * 1000;
    const capImpressionsPerDay = audience > 0 ? audience * frequencyCap : Infinity;
    const impressionsPerDay = Math.min(budgetImpressionsPerDay, capImpressionsPerDay);
    const days = Math.max(1, Math.min(durationDays, Math.ceil(totalBudget / dailyBudget)));
    return {
      cpm,
      impressionsPerDay,
      totalImpressions: impressionsPerDay * days,
      estClicks: impressionsPerDay * days * 0.008, // conservative 0.8% CTR
      effectiveDays: days,
      audienceLimited: capImpressionsPerDay < budgetImpressionsPerDay,
    };
  }, [targeting.tiers, estimate?.audience, dailyBudget, totalBudget, durationDays, frequencyCap]);

  const handleUpload = async (file: File, kindOf: 'media' | 'thumb') => {
    if (!walletAddress) { toast.error('Connect a wallet first'); return; }
    const isVideo = file.type.startsWith('video/');
    if (kindOf === 'media' && kind === 'image' && isVideo) setKind('video');
    if (kindOf === 'media' && kind === 'video' && !isVideo) setKind('image');
    setUploading(kindOf);
    try {
      const url = await uploadAdMedia(walletAddress, file, file.type);
      if (kindOf === 'media') setMediaUrl(url);
      else setThumbnailUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const stepValid = (): boolean => {
    if (step === 0) {
      if (!name.trim()) return false;
      if (!headline.trim()) return false;
      if (kind !== 'text' && !mediaUrl) return false;
      return true;
    }
    if (step === 2) {
      return dailyBudget >= 1 && totalBudget >= dailyBudget;
    }
    return true;
  };

  const reset = () => {
    setStep(0); setName(''); setObjective('awareness'); setKind('image');
    setMediaUrl(null); setThumbnailUrl(null); setHeadline(''); setBodyText('');
    setCtaLabel('Learn more'); setCtaUrl(''); setTargeting({});
    setDailyBudget(250); setTotalBudget(2500); setDurationDays(14); setFrequencyCap(4);
  };

  const submit = async (asDraft: boolean) => {
    if (!walletAddress) { toast.error('Connect a wallet first'); return; }
    setSubmitting(true);
    try {
      await ensureAccount.mutateAsync(undefined);
      const endAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        objective,
        status: asDraft ? 'draft' : 'pending_review',
        daily_budget_usd: dailyBudget,
        total_budget_usd: totalBudget,
        end_at: endAt,
        targeting,
        frequency_cap: frequencyCap,
        cta_url: ctaUrl.trim() || null,
      });
      await createCreative.mutateAsync({
        campaign_id: campaign.id,
        kind,
        media_url: kind === 'text' ? null : mediaUrl,
        thumbnail_url: thumbnailUrl,
        headline: headline.trim(),
        body: bodyText.trim() || null,
        cta_label: ctaLabel.trim() || 'Learn more',
        cta_url: ctaUrl.trim() || null,
      });
      toast.success(asDraft ? 'Campaign saved as draft' : 'Campaign submitted for review');
      onOpenChange(false);
      onCreated?.(campaign.id);
      reset();
    } catch {
      /* hooks already toast */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto bg-black/70 backdrop-blur-[24px] border border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            New campaign
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 rounded-full flex-1 transition-colors',
                i <= step ? 'bg-white/80' : 'bg-white/15',
              )}
            />
          ))}
        </div>

        {/* STEP 1 — creative */}
        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
            <div className="space-y-4">
              <div>
                <Label htmlFor="wiz-name" className="text-white">Campaign name</Label>
                <Input id="wiz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring launch" className="mt-1" />
              </div>
              <div>
                <Label className="text-white">Objective</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="awareness">Brand awareness</SelectItem>
                    <SelectItem value="traffic">Website traffic</SelectItem>
                    <SelectItem value="engagement">Engagement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white">Format</Label>
                <div className="flex gap-2 mt-1">
                  {([['image', ImageIcon, 'Image'], ['video', Film, 'Video'], ['text', Type, 'Text']] as const).map(([k, Icon, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors',
                        kind === k ? 'border-white/50 bg-white/10 text-white' : 'border-white/10 text-zinc-400 hover:bg-white/5',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {kind !== 'text' && (
                <div>
                  <Label className="text-white">{kind === 'video' ? 'Video' : 'Image'}</Label>
                  <label className={cn(
                    'mt-1 flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-6 cursor-pointer transition-colors',
                    mediaUrl ? 'border-white/30 bg-white/5' : 'border-white/15 hover:bg-white/5',
                  )}>
                    {uploading === 'media' ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm text-zinc-400">{mediaUrl ? 'Replace file' : `Upload ${kind}`}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'}
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'media'); e.target.value = ''; }}
                    />
                  </label>
                </div>
              )}

              {kind === 'video' && (
                <div>
                  <Label className="text-white">Thumbnail (optional)</Label>
                  <label className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-3 cursor-pointer hover:bg-white/5 transition-colors">
                    {uploading === 'thumb' ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <span className="text-xs text-zinc-400">{thumbnailUrl ? 'Replace thumbnail' : 'Upload thumbnail'}</span>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'thumb'); e.target.value = ''; }}
                    />
                  </label>
                </div>
              )}

              <div>
                <Label htmlFor="wiz-headline" className="text-white">Headline</Label>
                <Input id="wiz-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} placeholder="Say it in one line" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="wiz-body" className="text-white">Body (optional)</Label>
                <Textarea id="wiz-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} maxLength={280} rows={3} placeholder="Add supporting copy" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="wiz-cta-label" className="text-white">CTA label</Label>
                  <Input id="wiz-cta-label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={24} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="wiz-cta-url" className="text-white">CTA link</Label>
                  <Input id="wiz-cta-url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" className="mt-1" />
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Feed preview</p>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 pointer-events-none">
                <SponsoredAdCard ad={previewAd} />
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Exactly how your ad renders between posts — labeled AD, billed per POVR impression.
              </p>
            </div>
          </div>
        )}

        {/* STEP 2 — targeting */}
        {step === 1 && (
          <div className="py-2">
            <TargetingEditor value={targeting} onChange={setTargeting} />
          </div>
        )}

        {/* STEP 3 — budget */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="wiz-daily" className="text-white">Daily budget (USD)</Label>
                <Input
                  id="wiz-daily" type="number" min={1} step={5} value={dailyBudget}
                  onChange={(e) => setDailyBudget(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="wiz-total" className="text-white">Total budget (USD)</Label>
                <Input
                  id="wiz-total" type="number" min={dailyBudget} step={25} value={totalBudget}
                  onChange={(e) => setTotalBudget(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1"
                />
                {totalBudget < dailyBudget && (
                  <p className="text-xs text-red-400 mt-1">Total must be at least the daily budget</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-white">Duration: {durationDays} days</Label>
              <Slider value={[durationDays]} onValueChange={(v) => setDurationDays(v[0])} min={1} max={60} step={1} className="mt-2" />
            </div>

            <div>
              <Label className="text-white">Frequency cap: {frequencyCap} views / person / day</Label>
              <Slider value={[frequencyCap]} onValueChange={(v) => setFrequencyCap(v[0])} min={1} max={10} step={1} className="mt-2" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[11px] text-zinc-500">Blended CPM</p>
                <p className="text-base font-bold text-white">{formatUsd(projections.cpm)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Est. impressions / day</p>
                <p className="text-base font-bold text-white">{formatCompact(projections.impressionsPerDay)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Est. total impressions</p>
                <p className="text-base font-bold text-white">{formatCompact(projections.totalImpressions)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Est. clicks (0.8% CTR)</p>
                <p className="text-base font-bold text-white">{formatCompact(projections.estClicks)}</p>
              </div>
            </div>
            {projections.audienceLimited && (
              <p className="text-xs text-yellow-500">
                Your budget exceeds what this audience can deliver at the chosen frequency cap — delivery will be audience-limited. Widen targeting or lower the daily budget.
              </p>
            )}
          </div>
        )}

        {/* STEP 4 — review */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2 text-sm">
                <p className="text-white font-semibold">{name || 'Untitled campaign'}</p>
                <p className="text-zinc-400">Objective: <span className="text-white capitalize">{objective}</span></p>
                <p className="text-zinc-400">Budget: <span className="text-white">{formatUsd(dailyBudget)}/day · {formatUsd(totalBudget)} total</span></p>
                <p className="text-zinc-400">Duration: <span className="text-white">{durationDays} days</span> · Cap: <span className="text-white">{frequencyCap}/day</span></p>
                <p className="text-zinc-400">Audience: <span className="text-white">{formatCompact(estimate?.audience ?? 0)} tracked wallets</span></p>
                <p className="text-zinc-400">Tiers: <span className="text-white">{(targeting.tiers ?? []).length ? (targeting.tiers ?? []).join(', ') : 'All'}</span></p>
                <p className="text-[11px] text-zinc-500 pt-2">
                  Ads go live after moderation approves both campaign and creative, and only while your ads balance stays funded. You pay per verified viewable impression at the viewer's tier CPM.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 pointer-events-none">
                <SponsoredAdCard ad={previewAd} />
              </div>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
            disabled={step === 0 || submitting}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              variant="glass"
              disabled={!stepValid() || uploading !== null}
              onClick={() => setStep((s) => s + 1)}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
                disabled={submitting}
                onClick={() => submit(true)}
              >
                <Save className="w-4 h-4 mr-1.5" /> Save draft
              </Button>
              <Button variant="glass" disabled={submitting} onClick={() => submit(false)}>
                {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Rocket className="w-4 h-4 mr-1.5" />}
                Submit for review
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
