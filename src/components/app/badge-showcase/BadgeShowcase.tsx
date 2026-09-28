/**
 * BadgeShowcase — what a click on a holder badge opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a staking tier: what it costs, a token slider that
 * answers "what does this much buy", and what the tier grants.
 *
 * Loaded on demand by BadgeShowcaseHost; three.js lives in this chunk only.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Eye,
  HardDrive,
  Images,
  Landmark,
  Lock,
  Mic,
  Newspaper,
  Percent,
  Share2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { DhbCoin } from '@/components/app/DhbAmount';
import { useBadgeLadderPrice, useBadgeScale } from '@/hooks/use-badge-scale';
import { preferLiveBalance, useSelfBadge } from '@/hooks/use-self-badge-balance';
import {
  BADGE_ORDER,
  badgeImage,
  badgeThresholds,
  getBadgeStanding,
  type BadgeStanding,
} from '@/lib/staking-badges';
import { badgePerksForIndex, type BadgePerks } from '@/lib/badge-perks';
import { shortDhb } from '@/lib/badge-motion';
import { fetchVoiceClonePrice } from '@/lib/stage-voice-clone';
import { cn } from '@/lib/utils';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { ShowcaseShell, type ShowcaseApi, type ShowcaseEntry } from './ShowcaseShell';
import { BENTO, BENTO_IDLE, BENTO_LIT, tiltAt } from './showcase-ui';
import type { StickerFinish } from './sticker-stage';

interface BadgeShowcaseProps {
  /** Tier that was clicked; the showcase opens on it. */
  tier: string | null;
  /** The badge element that was clicked, flown out of and back into. */
  anchor: HTMLElement | null;
  onClose: () => void;
}

// The 256px light exports are the sharpest art there is; the sticker and the
// flying copy both use them so the hand-off between the two is seamless.
const LIGHT_ART = import.meta.glob<string>('../../../assets/badges/light/*.webp', {
  eager: true,
  import: 'default',
});
const artFor = (tier: string) =>
  LIGHT_ART[`../../../assets/badges/light/${tier}.webp`] ?? badgeImage(tier) ?? '';

/** Finishes get fancier up the ladder. */
const finishFor = (i: number): StickerFinish => (i < 4 ? 'glitter' : i < 8 ? 'holo' : 'foil');

const SLIDER_STEPS = 1000;
/** Slider positions this close to a threshold snap onto it. */
const SNAP = 12;

/** Three significant figures, so a dragged amount reads as a price. */
function roundAmount(value: number): number {
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)) - 2);
  return Math.round(value / magnitude) * magnitude;
}

/** Short byte count for a perk tile: 1.1 GB, 750 GB, 5 TB. */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${Number(n.toFixed(n >= 100 ? 0 : 1))} ${units[i]}`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `$${Math.round(value)}`;
}

export default function BadgeShowcase({ tier, anchor, onClose }: BadgeShowcaseProps) {
  const { t } = useTranslation();
  // Read the context directly: badges render above AuthProvider in places.
  const auth = useContext(AuthContext);
  const self = useSelfBadge();
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();
  const ladder = useMemo(() => badgeThresholds(scale), [scale]);

  const signedIn = !!auth?.user;
  const ownBalance = preferLiveBalance(auth?.user?.badgeBalance, self.balance);
  const standing = useMemo(
    () =>
      signedIn
        ? getBadgeStanding(ownBalance, { username: auth?.user?.username, scale, lock: self.lock })
        : null,
    [signedIn, ownBalance, auth?.user?.username, scale, self.lock],
  );

  const [originIndex] = useState(() => {
    const clicked = BADGE_ORDER.indexOf(tier ?? '');
    return clicked >= 0 ? clicked : Math.max(0, standing?.index ?? 0);
  });

  const entries = useMemo<ShowcaseEntry[]>(
    () =>
      BADGE_ORDER.map((name, i) => ({
        key: name,
        label: name,
        art: artFor(name),
        thumb: badgeImage(name) ?? '',
        finish: finishFor(i),
        tilt: tiltAt(i),
      })),
    [],
  );

  const owned = (i: number) => !!standing && standing.index >= i;

  return (
    <ShowcaseShell
      entries={entries}
      originIndex={originIndex}
      anchor={anchor}
      onClose={onClose}
      dialogLabel={(i) => t('badgeShowcase.dialogLabel', { tier: BADGE_ORDER[i] })}
      dockLabel={t('badgeShowcase.badges')}
      owned={owned}
    >
      {(api) => (
        <HolderDetails api={api} standing={standing} ladder={ladder} price={price} scale={scale} owned={owned} />
      )}
    </ShowcaseShell>
  );
}

/** Names too long for the showcase heading, shortened for display only. */
const SHORT_NAMES: Record<string, string> = { 'Great White Shark': 'Great White' };

function HolderDetails({
  api,
  standing,
  ladder,
  price,
  scale,
  owned,
}: {
  api: ShowcaseApi;
  standing: BadgeStanding | null;
  ladder: ReturnType<typeof badgeThresholds>;
  price: number | undefined;
  scale: number;
  owned: (i: number) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { index } = api;
  const count = BADGE_ORDER.length;

  // The slider can land between thresholds; everything else snaps the amount
  // back to the tier's own price.
  const [amount, setAmount] = useState(() => ladder[index].min);
  const [clonePrice, setClonePrice] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchVoiceClonePrice().then((p) => live && setClonePrice(p));
    return () => {
      live = false;
    };
  }, []);

  const slid = useRef(false);
  useEffect(() => {
    if (slid.current) {
      slid.current = false;
      return;
    }
    setAmount(ladder[index].min);
  }, [index, ladder]);

  const lnMin = Math.log(ladder[0].min);
  const lnMax = Math.log(ladder[count - 1].min);
  const toPos = (value: number) =>
    Math.round(((Math.log(Math.max(value, ladder[0].min)) - lnMin) / (lnMax - lnMin)) * SLIDER_STEPS);
  const fromPos = (pos: number) => {
    for (const rung of ladder) if (Math.abs(toPos(rung.min) - pos) <= SNAP) return rung.min;
    return roundAmount(Math.exp(lnMin + (pos / SLIDER_STEPS) * (lnMax - lnMin)));
  };
  const tierFor = (value: number) => {
    let found = 0;
    ladder.forEach((rung, i) => {
      if (value >= rung.min) found = i;
    });
    return found;
  };

  const onSlide = (pos: number) => {
    const value = fromPos(pos);
    api.pause();
    setAmount(value);
    const next = tierFor(value);
    if (next !== index) {
      slid.current = true;
      api.goTo(next);
    }
  };

  const name = BADGE_ORDER[index];
  const threshold = ladder[index].min;
  // The quotas resolve against the live ladder, so a new price means new perks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const perks = useMemo(() => badgePerksForIndex(index), [index, scale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const below = useMemo(() => badgePerksForIndex(index - 1), [index, scale]);
  const remaining = standing ? Math.max(0, threshold - standing.balance) : 0;
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const youPos =
    standing && standing.balance > 0 ? Math.min(100, (toPos(standing.balance) / SLIDER_STEPS) * 100) : null;

  // Nine tiles, so the three-column grid never ends on a ragged row.
  const perkRows: {
    key: string;
    icon: LucideIcon;
    label: string;
    value: string;
    better: (p: BadgePerks, q: BadgePerks) => boolean;
  }[] = [
    { key: 'fee', icon: Percent, label: t('badgeShowcase.perks.fee'), value: `${perks.platformFee}%`, better: (p, q) => p.platformFee < q.platformFee },
    { key: 'votes', icon: Landmark, label: t('badgeShowcase.perks.votes'), value: `×${perks.voteWeight}`, better: (p, q) => p.voteWeight > q.voteWeight },
    { key: 'reach', icon: Eye, label: t('badgeShowcase.perks.reach'), value: `×${perks.reach}`, better: (p, q) => p.reach > q.reach },
    { key: 'feedPosts', icon: Newspaper, label: t('badgeShowcase.perks.feedPosts'), value: nf.format(perks.feedPostsPerDay), better: (p, q) => p.feedPostsPerDay > q.feedPostsPerDay },
    { key: 'images', icon: Images, label: t('badgeShowcase.perks.images'), value: nf.format(perks.imagesPerPost), better: (p, q) => p.imagesPerPost > q.imagesPerPost },
    { key: 'uploads', icon: Upload, label: t('badgeShowcase.perks.uploads'), value: formatBytes(perks.uploadBytesPerDay), better: (p, q) => p.uploadBytesPerDay > q.uploadBytesPerDay },
    { key: 'storage', icon: HardDrive, label: t('badgeShowcase.perks.storage'), value: formatBytes(perks.editorStorageBytes), better: (p, q) => p.editorStorageBytes > q.editorStorageBytes },
    { key: 'lending', icon: Share2, label: t('badgeShowcase.perks.lending'), value: nf.format(perks.lendingSlots), better: (p, q) => p.lendingSlots > q.lendingSlots },
    {
      key: 'voice',
      icon: Mic,
      label: t('badgeShowcase.perks.voice'),
      value: perks.freeVoiceCloning ? t('badgeShowcase.perks.voiceFree') : clonePrice ? shortDhb(clonePrice) : '—',
      better: (p, q) => p.freeVoiceCloning && !q.freeVoiceCloning,
    },
  ];

  return (
    <>
      <div className="flex flex-col items-center gap-1.5 text-center lg:items-start lg:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 lg:justify-start">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h2
              key={name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="text-[22px] font-black uppercase leading-none tracking-[-0.02em] lg:text-[30px]"
            >
              {SHORT_NAMES[name] ?? name}
            </motion.h2>
          </AnimatePresence>
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 pl-1.5 pr-2.5 text-[13px] font-bold tabular-nums backdrop-blur-xl">
            <DhbCoin className="h-4 w-4" />
            {shortDhb(threshold)}
            <span aria-hidden className="h-3 w-px bg-white/20" />
            {owned(index) ? <Check className="h-3 w-3" strokeWidth={3} /> : <Lock className="h-3 w-3 text-white/60" strokeWidth={2.5} />}
          </span>
        </div>
        <p className="min-h-4 text-[12px] leading-4 text-white/55">
          {standing
            ? owned(index)
              ? t('badgeShowcase.youHaveThis')
              : t('badgeShowcase.toUnlock', { amount: nf.format(Math.ceil(remaining)) })
            : t('badgeShowcase.holdToUnlock')}
          {price ? <span className="text-white/35"> (≈ {formatUsd(threshold * price)})</span> : null}
        </p>
      </div>

      {/* Token slider */}
      <div className={cn(BENTO, BENTO_IDLE, 'mt-3')}>
        <div className="flex h-5 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
            {t('badgeShowcase.sliderLabel')}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[15px] font-bold tabular-nums lg:text-[16px]">
            {nf.format(amount)}
            <DhbCoin className="h-3.5 w-3.5 shrink-0" />
            {price ? (
              <span className="hidden text-[11px] font-medium text-white/40 min-[380px]:inline">≈ {formatUsd(amount * price)}</span>
            ) : null}
          </span>
        </div>

        <SliderPrimitive.Root
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={[toPos(amount)]}
          onValueChange={(v) => onSlide(v[0])}
          className="relative mt-2.5 flex h-5 w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
            <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-white/50 to-white" />
          </SliderPrimitive.Track>
          {ladder.map((rung, i) => (
            <span
              key={rung.name}
              aria-hidden
              className={cn(
                'pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                i <= index ? 'bg-black/40' : 'bg-white/25',
              )}
              style={{ left: `${(toPos(rung.min) / SLIDER_STEPS) * 100}%` }}
            />
          ))}
          {youPos !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300 bg-black"
              style={{ left: `${youPos}%` }}
            />
          )}
          <SliderPrimitive.Thumb
            aria-label={t('badgeShowcase.sliderLabel')}
            aria-valuetext={t('badgeShowcase.sliderValue', { amount: nf.format(amount), tier: name })}
            className="block h-5 w-5 overflow-hidden rounded-full border-2 border-white bg-black shadow-[0_0_0_4px_rgba(255,255,255,0.12),0_4px_14px_rgba(0,0,0,0.5)] outline-none transition-transform focus-visible:scale-110 active:scale-110"
          >
            <img src={badgeImage(name) ?? ''} alt="" className="h-full w-full object-contain p-[1px]" />
          </SliderPrimitive.Thumb>
        </SliderPrimitive.Root>
        <div className="mt-1.5 flex h-3 items-center justify-between text-[10px] tabular-nums leading-3 text-white/35">
          <span>{shortDhb(ladder[0].min)}</span>
          {standing && standing.balance > 0 ? (
            <span className="font-semibold text-emerald-300">
              {t('badgeShowcase.you')} {shortDhb(standing.balance)}
            </span>
          ) : null}
          <span>{shortDhb(ladder[count - 1].min)}</span>
        </div>
      </div>

      {/* What it grants */}
      <h3 className="mt-3 hidden text-[10px] font-bold uppercase leading-3 tracking-[0.12em] text-white/45 lg:block">
        {t('badgeShowcase.grants')}
      </h3>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {perkRows.map((row) => {
          const Icon = row.icon;
          const up = row.better(perks, below);
          const paid = row.key === 'voice' && !perks.freeVoiceCloning && !!clonePrice;
          return (
            <li
              key={row.key}
              title={row.label}
              className={cn(
                BENTO,
                // Fixed geometry: the label always gets two lines and the
                // value one, so no tile drifts out of line with the next.
                'flex h-[68px] min-w-0 flex-col justify-between',
                up ? BENTO_LIT : BENTO_IDLE,
              )}
            >
              <div className="flex min-w-0 items-start gap-1.5 text-[10px] leading-3 text-white/50">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="line-clamp-2 h-6 min-w-0 break-words">{row.label}</span>
              </div>
              <div className="flex h-[18px] min-w-0 items-center justify-end gap-1 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={row.value}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="min-w-0 truncate text-[14px] font-bold tabular-nums leading-[18px] lg:text-[15px]"
                  >
                    {row.value}
                  </motion.span>
                </AnimatePresence>
                {paid && <DhbCoin className="h-3.5 w-3.5 shrink-0" />}
                {up && (
                  <span aria-hidden className="shrink-0 text-[9px] font-bold text-emerald-400">
                    ▲
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <LiquidGlassBubble2
          active
          label={t('badgeShowcase.buyTokens')}
          onClick={() => api.close(() => navigate('/app/buy'))}
          width="100%"
          height="40px"
          className="min-w-0"
        />
        <LiquidGlassBubble2
          label={t('badgeShowcase.details')}
          onClick={() => api.close(() => navigate('/app/glossary#badges'))}
          width="100%"
          height="40px"
          className="min-w-0"
        />
      </div>
    </>
  );
}
