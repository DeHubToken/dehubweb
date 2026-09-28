/**
 * BadgeShowcase — what a click on any badge opens.
 *
 * The badge lifts out of the name it sat next to and flies to the middle of a
 * darkened screen, the same shared-element move the promotion ceremony makes,
 * where it turns into a die-cut holographic sticker you can tilt, bend and
 * peel. Underneath sits every tier in a dock that plays through them like a
 * sticker pack, a token slider that answers "what does this much buy", and
 * what the chosen tier grants.
 *
 * Loaded on demand by BadgeShowcaseHost; three.js lives in this chunk only.
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Eye,
  HardDrive,
  Images,
  Landmark,
  Lock,
  Mic,
  Newspaper,
  Pause,
  Percent,
  Play,
  Share2,
  Upload,
  Users,
  X,
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
} from '@/lib/staking-badges';
import { FREE_VOICE_CLONING_FROM, badgePerksForIndex, type BadgePerks } from '@/lib/badge-perks';
import { shortDhb } from '@/lib/badge-motion';
import { cn } from '@/lib/utils';
import { StickerStage, stickerArtRect, type StickerFinish, type StickerItem } from './sticker-stage';

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

/** How long each badge holds before the dock plays on to the next. */
const AUTOPLAY_MS = 4800;
/** Resting tilt of each tier's dock thumbnail, in degrees. */
const TILTS = [-4, 6, -7, 5, -5, 7, -6, 4, -8, 6, -4, 7, -6];
/** Finishes get fancier up the ladder. */
const finishFor = (i: number): StickerFinish => (i < 4 ? 'glitter' : i < 8 ? 'holo' : 'foil');

const SLIDER_STEPS = 1000;
/** Slider positions this close to a threshold snap onto it. */
const SNAP = 12;

const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

interface Box {
  x: number;
  y: number;
  size: number;
}

const KEYFRAMES = `@keyframes badge-showcase-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes badge-showcase-float{0%,100%{translate:0 0}50%{translate:0 -6px}}`;

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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = !!useReducedMotion();
  // Read the context directly: badges render above AuthProvider in places.
  const auth = useContext(AuthContext);
  const self = useSelfBadge();
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();
  const ladder = useMemo(() => badgeThresholds(scale), [scale]);
  const count = BADGE_ORDER.length;

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
  const [index, setIndex] = useState(originIndex);
  const [amount, setAmount] = useState(() => ladder[originIndex].min);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [phase, setPhase] = useState<'enter' | 'open' | 'exit'>('enter');
  const [shown, setShown] = useState(false);
  const [landed, setLanded] = useState(false);
  const [stickerReady, setStickerReady] = useState(false);
  const [stickerOn, setStickerOn] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [fading, setFading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyerRef = useRef<HTMLImageElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<StickerStage | null>(null);
  const shownIndex = useRef(originIndex);
  const flightRaf = useRef(0);

  const items = useMemo<StickerItem[]>(
    () =>
      BADGE_ORDER.map((name, i) => ({
        src: artFor(name),
        finish: finishFor(i),
        tilt: TILTS[i] * 0.5,
      })),
    [],
  );

  /* ---------- geometry ---------- */

  const heroBox = useCallback((): Box | null => {
    const stage = stageBoxRef.current;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    const art = stickerArtRect(r.width, r.height);
    return { x: r.left + art.x, y: r.top + art.y, size: art.size };
  }, []);

  const anchorBox = useCallback((): Box | null => {
    if (!anchor || !anchor.isConnected) return null;
    const r = anchor.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    if (r.bottom < 0 || r.top > window.innerHeight) return null;
    return { x: r.left, y: r.top, size: Math.max(r.width, r.height) };
  }, [anchor]);

  const placeFlyer = (box: Box, rotate = 0) => {
    const el = flyerRef.current;
    if (!el) return;
    el.style.width = `${box.size}px`;
    el.style.height = `${box.size}px`;
    el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0) rotate(${rotate}deg)`;
  };

  // three.js turns counter-clockwise for positive angles, CSS clockwise.
  const restTilt = -TILTS[originIndex] * 0.5;

  const fly = (from: Box, to: Box, ms: number, mode: 'out' | 'home', done: () => void) => {
    cancelAnimationFrame(flightRaf.current);
    const start = performance.now();
    const arc = Math.min(80, window.innerHeight * 0.1);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const move = mode === 'out' ? outCubic(p) : inOutCubic(p);
      const grow = mode === 'out' ? outBack(p) : inOutCubic(p);
      const x = from.x + (to.x - from.x) * move;
      const y = from.y + (to.y - from.y) * move - Math.sin(p * Math.PI) * arc;
      const size = from.size + (to.size - from.size) * grow;
      const spin = mode === 'out' ? restTilt + (1 - move) * -18 : restTilt * (1 - move) + move * -14;
      placeFlyer({ x, y, size }, spin);
      if (p < 1) flightRaf.current = requestAnimationFrame(step);
      else done();
    };
    flightRaf.current = requestAnimationFrame(step);
  };

  /* ---------- open ---------- */

  useLayoutEffect(() => {
    const hero = heroBox();
    const from = anchorBox();
    if (anchor) anchor.style.visibility = 'hidden';
    if (hero) placeFlyer(from && !reduceMotion ? from : hero, from && !reduceMotion ? -18 : restTilt);
    const raf = requestAnimationFrame(() => {
      setShown(true);
      if (hero && from && !reduceMotion) fly(from, hero, 760, 'out', () => setLanded(true));
      else setLanded(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(flightRaf.current);
      if (anchor) anchor.style.visibility = '';
    };
    // Runs once: the flight is a one-off from where the click happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The sticker takes over from the DOM copy once both are in place.
  useEffect(() => {
    if (!landed || phase !== 'enter') return;
    if (stickerReady) {
      setStickerOn(true);
      setPhase('open');
    } else if (glFailed) {
      setPhase('open');
    }
  }, [landed, stickerReady, glFailed, phase]);

  useEffect(() => {
    if (!glFailed) return;
    const onResize = () => {
      const hero = heroBox();
      if (hero) placeFlyer(hero, restTilt);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glFailed, heroBox]);

  /* ---------- sticker stage ---------- */

  const handlers = useRef({ next: () => {}, close: () => {}, interact: () => {} });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: StickerStage;
    try {
      stage = new StickerStage(canvas, {
        onTap: () => handlers.current.next(),
        onMiss: () => handlers.current.close(),
        onInteract: () => handlers.current.interact(),
      });
    } catch {
      setGlFailed(true);
      return;
    }
    stage.setItems(items);
    stageRef.current = stage;
    stage.show(originIndex, { instant: true }).then((ok) => {
      if (stageRef.current !== stage) return;
      if (ok) setStickerReady(true);
      else setGlFailed(true);
    });
    return () => {
      stage.dispose();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, [items, originIndex]);

  useEffect(() => {
    if (!stickerOn) return;
    const stage = stageRef.current;
    stage?.preload((originIndex + 1) % count);
    stage?.preload((originIndex - 1 + count) % count);
  }, [stickerOn, originIndex, count]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || index === shownIndex.current) return;
    const forward = (index - shownIndex.current + count) % count <= count / 2;
    shownIndex.current = index;
    stage.show(index, { direction: forward ? 1 : -1 });
    stage.preload((index + (forward ? 1 : -1) + count) % count);
  }, [index, count]);

  /* ---------- navigation ---------- */

  const goTo = useCallback(
    (next: number) => {
      const i = ((next % count) + count) % count;
      setIndex(i);
      setAmount(ladder[i].min);
    },
    [count, ladder],
  );

  /* ---------- close ---------- */

  const requestClose = useCallback(() => {
    if (phase === 'exit') return;
    setPhase('exit');
    setPlaying(false);
    const home = anchorBox();
    const hero = heroBox();
    const flyHome = !!home && !!hero && !reduceMotion && index === originIndex;
    if (flyHome && hero && home) {
      placeFlyer(hero, restTilt);
      setStickerOn(false);
      fly(hero, home, 560, 'home', onClose);
    } else {
      setFading(true);
      window.setTimeout(onClose, reduceMotion ? 0 : 240);
    }
    // fly and restTilt only touch refs and the fixed origin tier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, anchorBox, heroBox, reduceMotion, index, originIndex, onClose]);

  handlers.current = {
    next: () => goTo(index + 1),
    close: requestClose,
    interact: () => {
      setPlaying(false);
      setTouched(true);
    },
  };

  // The how-to line is for the first look only, then the sticker stands alone.
  useEffect(() => {
    if (phase !== 'open') return;
    const id = window.setTimeout(() => setTouched(true), 5000);
    return () => window.clearTimeout(id);
  }, [phase]);

  /* ---------- page plumbing ---------- */

  useEffect(() => {
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="slider"]')) return;
      if (e.key === 'ArrowRight') {
        setPlaying(false);
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        goTo(index - 1);
      } else if (e.key === ' ' && (target === document.body || target === rootRef.current)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose, goTo, index]);

  // Keep the active thumbnail in view without scrolling anything else.
  useEffect(() => {
    const rail = railRef.current;
    const thumb = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    rail.scrollTo({
      left: thumb.offsetLeft - rail.clientWidth / 2 + thumb.clientWidth / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [index, reduceMotion]);

  /* ---------- slider ---------- */

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
    setPlaying(false);
    setTouched(true);
    setAmount(value);
    setIndex(tierFor(value));
  };

  /* ---------- derived ---------- */

  const name = BADGE_ORDER[index];
  const threshold = ladder[index].min;
  // The quotas resolve against the live ladder, so a new price means new perks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const perks = useMemo(() => badgePerksForIndex(index), [index, scale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const below = useMemo(() => badgePerksForIndex(index - 1), [index, scale]);
  const owned = (i: number) => !!standing && standing.index >= i;
  const remaining = standing ? Math.max(0, threshold - standing.balance) : 0;
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const autoplaying = playing && phase === 'open';
  const youPos =
    standing && standing.balance > 0 ? Math.min(100, (toPos(standing.balance) / SLIDER_STEPS) * 100) : null;

  const perkRows: {
    key: string;
    icon: LucideIcon;
    label: string;
    value: string;
    better: (p: BadgePerks, q: BadgePerks) => boolean;
  }[] = [
    {
      key: 'fee',
      icon: Percent,
      label: t('badgeShowcase.perks.fee'),
      value: `${perks.platformFee}%`,
      better: (p, q) => p.platformFee < q.platformFee,
    },
    {
      key: 'votes',
      icon: Landmark,
      label: t('badgeShowcase.perks.votes'),
      value: `×${perks.voteWeight}`,
      better: (p, q) => p.voteWeight > q.voteWeight,
    },
    {
      key: 'reach',
      icon: Eye,
      label: t('badgeShowcase.perks.reach'),
      value: `×${perks.reach}`,
      better: (p, q) => p.reach > q.reach,
    },
    {
      key: 'feedPosts',
      icon: Newspaper,
      label: t('badgeShowcase.perks.feedPosts'),
      value: nf.format(perks.feedPostsPerDay),
      better: (p, q) => p.feedPostsPerDay > q.feedPostsPerDay,
    },
    {
      key: 'images',
      icon: Images,
      label: t('badgeShowcase.perks.images'),
      value: nf.format(perks.imagesPerPost),
      better: (p, q) => p.imagesPerPost > q.imagesPerPost,
    },
    {
      key: 'uploads',
      icon: Upload,
      label: t('badgeShowcase.perks.uploads'),
      value: formatBytes(perks.uploadBytesPerDay),
      better: (p, q) => p.uploadBytesPerDay > q.uploadBytesPerDay,
    },
    {
      key: 'storage',
      icon: HardDrive,
      label: t('badgeShowcase.perks.storage'),
      value: formatBytes(perks.editorStorageBytes),
      better: (p, q) => p.editorStorageBytes > q.editorStorageBytes,
    },
    {
      key: 'profiles',
      icon: Users,
      label: t('badgeShowcase.perks.profiles'),
      value: nf.format(perks.savedProfiles),
      better: (p, q) => p.savedProfiles > q.savedProfiles,
    },
    {
      key: 'lending',
      icon: Share2,
      label: t('badgeShowcase.perks.lending'),
      value: nf.format(perks.lendingSlots),
      better: (p, q) => p.lendingSlots > q.lendingSlots,
    },
    {
      key: 'voice',
      icon: Mic,
      label: t('badgeShowcase.perks.voice'),
      value: perks.freeVoiceCloning ? t('badgeShowcase.perks.voiceFree') : t('badgeShowcase.perks.voiceLocked', { tier: FREE_VOICE_CLONING_FROM }),
      better: (p, q) => p.freeVoiceCloning && !q.freeVoiceCloning,
    },
  ];

  const open = shown && phase !== 'exit';
  const panelIn = phase === 'open';

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('badgeShowcase.dialogLabel', { tier: name })}
      tabIndex={-1}
      className="fixed inset-0 z-[120] flex flex-col overflow-hidden text-white outline-none transition-[opacity,transform] duration-200"
      style={{ pointerEvents: 'auto', opacity: fading ? 0 : 1, transform: fading ? 'scale(0.98)' : 'none' }}
    >
      <style>{KEYFRAMES}</style>

      {/* The page falls away behind the badge. */}
      <div
        aria-hidden
        onClick={requestClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-500 ease-out"
        style={{ opacity: open ? 1 : 0 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: open ? 1 : 0,
          background: 'radial-gradient(60% 50% at 50% 38%, rgba(255,255,255,0.08), transparent 70%)',
        }}
      />

      <header
        className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)] transition-opacity duration-300 sm:px-6"
        style={{ opacity: panelIn ? 1 : 0 }}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
          {t('badgeShowcase.badges')}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={requestClose}
          aria-label={t('badgeShowcase.close')}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 backdrop-blur-xl transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
        {/* Stage */}
        <div ref={stageBoxRef} className="relative min-h-[44vh] flex-1 lg:min-h-0">
          <canvas
            ref={canvasRef}
            aria-hidden
            className="absolute inset-0 h-full w-full transition-opacity duration-200"
            style={{ opacity: stickerOn ? 1 : 0, touchAction: 'none' }}
          />
          <p
            className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-white/35 transition-opacity duration-500"
            style={{ opacity: panelIn && !touched && !glFailed ? 1 : 0 }}
          >
            {t('badgeShowcase.hint')}
          </p>
        </div>

        {/* Details */}
        <div
          className="relative max-h-[50vh] min-h-0 overflow-y-auto overscroll-contain px-4 pb-2 transition-[opacity,transform] duration-500 ease-out scrollbar-hide lg:flex lg:max-h-none lg:w-[440px] lg:shrink-0 lg:flex-col lg:justify-center lg:py-6 lg:pl-2 lg:pr-10"
          style={{
            opacity: panelIn ? 1 : 0,
            transform: panelIn ? 'none' : 'translateY(14px)',
            pointerEvents: panelIn ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto w-full max-w-[520px]">
            <div className="text-center lg:text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                {t('badgeShowcase.tierOf', { index: index + 1, total: count })}
              </p>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h2
                  key={name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-1 text-[24px] font-black uppercase leading-none tracking-[-0.02em] sm:text-[38px]"
                >
                  {name}
                </motion.h2>
              </AnimatePresence>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:mt-3 lg:justify-start">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-[5px] pl-[7px] pr-3 text-[15px] font-bold tabular-nums backdrop-blur-xl">
                  <DhbCoin className="h-5 w-5" />
                  {shortDhb(threshold)}
                  <span aria-hidden className="h-3.5 w-px bg-white/20" />
                  {owned(index) ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-white/60" strokeWidth={2.5} />
                  )}
                </span>
                {price ? (
                  <span className="text-[12.5px] tabular-nums text-white/40">≈ {formatUsd(threshold * price)}</span>
                ) : null}
              </div>

              <p className="mt-1.5 min-h-[18px] text-[12.5px] text-white/55 lg:mt-2">
                {standing
                  ? owned(index)
                    ? t('badgeShowcase.youHaveThis')
                    : t('badgeShowcase.toUnlock', { amount: nf.format(Math.ceil(remaining)) })
                  : t('badgeShowcase.holdToUnlock')}
              </p>
            </div>

            {/* Token slider */}
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 lg:mt-5 lg:py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
                  {t('badgeShowcase.sliderLabel')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[17px] font-bold tabular-nums">
                  {nf.format(amount)}
                  <DhbCoin className="h-4 w-4" />
                  {price ? (
                    <span className="text-[12px] font-medium text-white/40">≈ {formatUsd(amount * price)}</span>
                  ) : null}
                </span>
              </div>

              <div className="relative mt-2 pt-4 lg:mt-4">
                {youPos !== null && (
                  <span
                    className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-emerald-400/15 px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300"
                    style={{ left: `${youPos}%` }}
                  >
                    {t('badgeShowcase.you')}
                  </span>
                )}
                <SliderPrimitive.Root
                  min={0}
                  max={SLIDER_STEPS}
                  step={1}
                  value={[toPos(amount)]}
                  onValueChange={(v) => onSlide(v[0])}
                  className="relative flex h-6 w-full touch-none select-none items-center"
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
                      className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300 bg-black"
                      style={{ left: `${youPos}%` }}
                    />
                  )}
                  <SliderPrimitive.Thumb
                    aria-label={t('badgeShowcase.sliderLabel')}
                    aria-valuetext={t('badgeShowcase.sliderValue', { amount: nf.format(amount), tier: name })}
                    className="block h-6 w-6 overflow-hidden rounded-full border-2 border-white bg-black shadow-[0_0_0_4px_rgba(255,255,255,0.12),0_4px_14px_rgba(0,0,0,0.5)] outline-none transition-transform focus-visible:scale-110 active:scale-110"
                  >
                    <img src={badgeImage(name) ?? ''} alt="" className="h-full w-full object-contain p-[1px]" />
                  </SliderPrimitive.Thumb>
                </SliderPrimitive.Root>
                <div className="mt-2 flex justify-between text-[10.5px] tabular-nums text-white/35">
                  <span>{shortDhb(ladder[0].min)}</span>
                  <span>{shortDhb(ladder[count - 1].min)}</span>
                </div>
              </div>
            </div>

            {/* What it grants */}
            <h3 className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/45 lg:mt-5">
              {t('badgeShowcase.grants')}
            </h3>
            <ul className="-mx-4 mt-2 flex snap-x gap-2 overflow-x-auto px-4 scrollbar-hide lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
              {perkRows.map((row) => {
                const Icon = row.icon;
                const up = row.better(perks, below);
                const locked = row.key === 'voice' && !perks.freeVoiceCloning;
                return (
                  <li
                    key={row.key}
                    className={cn(
                      'w-[138px] shrink-0 snap-start rounded-xl border px-3 py-2.5 transition-colors duration-300 lg:w-auto',
                      up ? 'border-white/20 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] leading-tight text-white/50">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-2">{row.label}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={row.value}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className={cn(
                            'text-[17px] font-bold tabular-nums leading-tight',
                            locked && 'text-[13px] font-semibold text-white/40',
                          )}
                        >
                          {row.value}
                        </motion.span>
                      </AnimatePresence>
                      {up && (
                        <span aria-hidden className="text-[10px] font-bold text-emerald-400">
                          ▲
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex gap-2 lg:mt-4">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/app/buy');
                }}
                className="flex-1 rounded-[12px] bg-white px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] lg:py-2.5"
              >
                {t('badgeShowcase.buy')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/app/glossary#badges');
                }}
                className="flex-1 rounded-[12px] border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/85 transition-colors hover:bg-white/15 lg:py-2.5"
              >
                {t('badgeShowcase.details')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dock: every tier, playing through like a sticker pack. */}
      <nav
        aria-label={t('badgeShowcase.badges')}
        className="relative z-10 mx-auto mb-[max(env(safe-area-inset-bottom),12px)] mt-1 flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-[20px] border border-white/10 bg-white/[0.07] p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-[opacity,transform] duration-700"
        style={{
          opacity: panelIn ? 1 : 0,
          transform: panelIn ? 'none' : 'translateY(24px)',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div ref={railRef} className="flex min-w-0 snap-x gap-0.5 overflow-x-auto py-1 scrollbar-hide">
          {BADGE_ORDER.map((tierName, i) => {
            const active = i === index;
            return (
              <button
                key={tierName}
                type="button"
                aria-label={tierName}
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setTouched(true);
                  goTo(i);
                }}
                className="relative shrink-0 snap-center rounded-[14px] p-1.5 transition-colors duration-300 hover:bg-white/[0.07]"
              >
                <img
                  src={badgeImage(tierName) ?? ''}
                  alt=""
                  draggable={false}
                  className="block h-9 w-9 object-contain sm:h-10 sm:w-10"
                  style={{
                    transform: `rotate(${TILTS[i]}deg) scale(${active ? 1.08 : 0.84})`,
                    filter: active ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' : 'saturate(0.35)',
                    opacity: active ? 1 : 0.5,
                    transition:
                      'opacity 0.35s, filter 0.35s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                />
                {owned(i) && (
                  <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
                <span
                  aria-hidden
                  className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 overflow-hidden rounded-full bg-white/10 transition-opacity duration-300"
                  style={{ opacity: active ? 1 : 0 }}
                >
                  {active && (
                    <span
                      key={index}
                      className="block h-full w-full origin-left bg-white/85"
                      style={
                        {
                          animation: `badge-showcase-fill ${AUTOPLAY_MS}ms linear forwards`,
                          animationPlayState: autoplaying ? 'running' : 'paused',
                        } as CSSProperties
                      }
                      onAnimationEnd={() => goTo(index + 1)}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <span aria-hidden className="h-9 w-px shrink-0 bg-white/10" />
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? t('badgeShowcase.pause') : t('badgeShowcase.play')}
          aria-pressed={!playing}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
        </button>
      </nav>

      {/* The badge in flight, and the stand-in if WebGL is unavailable. */}
      <img
        ref={flyerRef}
        src={glFailed ? artFor(name) : artFor(BADGE_ORDER[originIndex])}
        alt=""
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-20 object-contain will-change-transform"
        style={{
          opacity: stickerOn ? 0 : phase === 'exit' && index !== originIndex ? 0 : 1,
          transition: 'opacity 0.2s',
          filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
          animation: glFailed && phase === 'open' ? 'badge-showcase-float 4s ease-in-out infinite' : undefined,
        }}
      />
    </div>,
    document.body,
  );
}
