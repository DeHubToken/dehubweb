/**
 * StreamerShowcase — what a click on a streamer card opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a collectible streamer card: how it is earned, how far
 * along its owner is, the streamer's numbers, and "use badge" for an earned
 * card on your own ladder. The card art is the generated SVG, handed to the
 * sticker as a data URL so it rasterises sharp at any size.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Flame, Lock, Radio, Timer, Tv, Zap, type LucideIcon } from 'lucide-react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { STREAMER_BADGE_IDS, streamerBadgeSvg, type StreamerBadgeId } from '@/lib/streamer-badge-art';
import { streamerCardProgress, type StreamerCardMetric } from '@/lib/streamer-card-goals';
import { useSelectStreamerBadge, useStreamerProgress } from '@/hooks/use-streamer-progress';
import type { StreamerProgress } from '@/lib/api/dehub/livestream';
import { cn } from '@/lib/utils';
import { ShowcaseShell, type ShowcaseApi, type ShowcaseEntry } from './ShowcaseShell';
import { BENTO, BENTO_IDLE, BENTO_LIT, tiltAt } from './showcase-ui';
import type { StickerFinish } from './sticker-stage';

interface StreamerShowcaseProps {
  badgeId: StreamerBadgeId;
  /** Whose ladder this is. */
  address: string;
  /** True on your own ladder: earned cards can be equipped from here. */
  canSelect: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/** The cards come in four rows of five; the finish steps up a row at a time. */
const FINISH_BY_ROW: StickerFinish[] = ['gloss', 'glitter', 'holo', 'foil'];

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Whole hours from ten up, one decimal below, so "0.5" reads as half an hour. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return String(Math.floor(hours));
  return (Math.round(hours * 10) / 10).toString();
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d.toLocaleDateString();
  }
}

export default function StreamerShowcase({ badgeId, address, canSelect, anchor, onClose }: StreamerShowcaseProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useAppTheme();
  const { data: progress } = useStreamerProgress(address);
  const [originIndex] = useState(() => Math.max(0, STREAMER_BADGE_IDS.indexOf(badgeId)));

  // Always the earned art: the sticker is the card at its best, and locked
  // state lives in the details column. Stable across progress loads, so the
  // stage is never rebuilt under the viewer.
  const entries = useMemo<ShowcaseEntry[]>(
    () =>
      STREAMER_BADGE_IDS.map((id, i) => {
        const art = svgUrl(streamerBadgeSvg(id, theme, true, 'showcase'));
        return {
          key: id,
          label: t(`live.progress.card.${id}.name`),
          art,
          thumb: art,
          finish: FINISH_BY_ROW[Math.floor(i / 5)] ?? 'foil',
          tilt: tiltAt(i),
        };
      }),
    // t follows the language; theme changes the metal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, i18n.language],
  );

  const earnedAt = (i: number) => progress?.cards.find((c) => c.id === STREAMER_BADGE_IDS[i])?.earnedAt ?? null;

  return (
    <ShowcaseShell
      entries={entries}
      originIndex={originIndex}
      anchor={anchor}
      onClose={onClose}
      dialogLabel={(i) => t('badgeShowcase.dialogLabel', { tier: t(`live.progress.card.${STREAMER_BADGE_IDS[i]}.name`) })}
      dockLabel={t('live.progress.cardsTitle')}
      owned={(i) => !!earnedAt(i)}
      footer={(api) => <StreamerActions api={api} progress={progress} address={address} canSelect={canSelect} />}
    >
      {(api) => <StreamerDetails api={api} progress={progress} />}
    </ShowcaseShell>
  );
}

function StreamerDetails({
  api,
  progress,
}: {
  api: ShowcaseApi;
  progress: StreamerProgress | undefined;
}) {
  const { t, i18n } = useTranslation();
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const id = STREAMER_BADGE_IDS[api.index];
  const total = STREAMER_BADGE_IDS.length;
  const card = progress?.cards.find((c) => c.id === id);
  const earned = !!card?.earnedAt;
  const goal = streamerCardProgress(id, progress);
  const fraction = earned ? 1 : goal ? Math.min(1, goal.current / goal.target) : 0;
  const current = goal
    ? goal.metric === 'hours'
      ? formatHours(Math.min(goal.current, earned ? goal.target : goal.current) * 60)
      : nf.format(Math.floor(earned ? Math.max(goal.current, goal.target) : goal.current))
    : '';
  const goalText = goal
    ? t(`streamerShowcase.goal.${goal.metric}`, { current, target: nf.format(goal.target) })
    : t('streamerShowcase.onStream');
  const name = t(`live.progress.card.${id}.name`);

  const stats: { key: string; icon: LucideIcon; label: string; value: string; metric?: StreamerCardMetric }[] = [
    { key: 'level', icon: Radio, label: t('streamerShowcase.stats.level'), value: progress ? nf.format(progress.level) : '-', metric: 'level' },
    { key: 'xp', icon: Zap, label: t('streamerShowcase.stats.xp'), value: progress ? nf.format(progress.xp) : '-' },
    { key: 'hours', icon: Clock, label: t('streamerShowcase.stats.hours'), value: progress ? formatHours(progress.qualifyingMinutes) : '-', metric: 'hours' },
    { key: 'streams', icon: Tv, label: t('streamerShowcase.stats.streams'), value: progress ? nf.format(progress.qualifyingStreams) : '-', metric: 'streams' },
    {
      key: 'longest',
      icon: Timer,
      label: t('streamerShowcase.stats.longest'),
      value: progress ? t('streamerShowcase.hoursShort', { hours: formatHours(progress.longestStreamMinutes) }) : '-',
      metric: 'session',
    },
    {
      key: 'streak',
      icon: Flame,
      label: t('streamerShowcase.stats.streak'),
      value: progress ? t('streamerShowcase.weeksShort', { count: progress.bestStreakWeeks }) : '-',
      metric: 'streak',
    },
  ];

  return (
    <>
      <div className="flex flex-col items-center gap-1.5 text-center lg:items-start lg:text-left">
        <p className="text-[10px] font-bold uppercase leading-3 tracking-[0.14em] text-white/40">
          {t('streamerShowcase.cardOf', { index: api.index + 1, total })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 lg:justify-start">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h2
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="text-[22px] font-black uppercase leading-none tracking-[-0.02em] lg:text-[30px]"
            >
              {name}
            </motion.h2>
          </AnimatePresence>
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 text-[12px] font-bold tabular-nums backdrop-blur-xl">
            {earned ? (
              <>
                <Check className="h-3 w-3" strokeWidth={3} />
                {formatDate(card?.earnedAt, i18n.language)}
              </>
            ) : (
              <>
                <Lock className="h-3 w-3 text-white/60" strokeWidth={2.5} />
                {t('live.progress.locked')}
              </>
            )}
          </span>
        </div>
        <p className="min-h-4 text-[12px] leading-4 text-white/55">{t(`live.progress.card.${id}.hint`)}</p>
      </div>

      {/* Progress toward this card: same shape as the holder slider panel. */}
      <div className={cn(BENTO, BENTO_IDLE, 'mt-3')}>
        <div className="flex h-5 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
            {t('streamerShowcase.progress')}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums lg:text-[14px]">{goalText}</span>
        </div>
        <div className="mt-2.5 flex h-5 items-center">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/50 to-white"
              initial={false}
              animate={{ width: `${Math.round(fraction * 100)}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <div className="mt-1.5 flex h-3 items-center justify-between text-[10px] tabular-nums leading-3 text-white/35">
          <span>{Math.round(fraction * 100)}%</span>
          {progress ? <span>{t('live.progress.level', { level: progress.level })}</span> : null}
        </div>
      </div>

      {/* The streamer's numbers; the one this card counts is lit. */}
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const lit = !!stat.metric && stat.metric === goal?.metric;
          return (
            <li
              key={stat.key}
              title={stat.label}
              className={cn(BENTO, 'flex h-[68px] min-w-0 flex-col justify-between', lit ? BENTO_LIT : BENTO_IDLE)}
            >
              <div className="flex min-w-0 items-start gap-1.5 text-[10px] leading-3 text-white/50">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="line-clamp-2 h-6 min-w-0 break-words">{stat.label}</span>
              </div>
              <span className="h-[18px] min-w-0 truncate text-[14px] font-bold tabular-nums leading-[18px] lg:text-[15px]">
                {stat.value}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Use this card and close: under the dock on phones. */
function StreamerActions({
  api,
  progress,
  address,
  canSelect,
}: {
  api: ShowcaseApi;
  progress: StreamerProgress | undefined;
  address: string;
  canSelect: boolean;
}) {
  const { t } = useTranslation();
  const selection = useSelectStreamerBadge();
  const id = STREAMER_BADGE_IDS[api.index];
  const earned = !!progress?.cards.find((c) => c.id === id)?.earnedAt;
  const selected = progress?.selectedBadgeId === id;
  const useBadge = () => {
    if (!earned || selected || selection.isPending) return;
    selection.mutate({ address, badgeId: id });
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {canSelect ? (
          <button
            type="button"
            onClick={useBadge}
            disabled={!earned || selected || selection.isPending}
            aria-pressed={selected}
            className="bs-chrome inline-flex h-10 min-w-0 items-center justify-center gap-1.5 truncate rounded-2xl px-3 text-[13px] font-bold"
          >
            {!earned ? <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> : null}
            <span className="truncate">
              {!earned
                ? t('live.progress.locked')
                : selection.isPending
                  ? t('live.progress.savingBadge')
                  : selected
                    ? t('live.progress.selectedBadge')
                    : t('live.progress.useBadge')}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={api.dismiss}
          className={cn(
            'bs-chrome-dark h-10 min-w-0 truncate rounded-2xl px-3 text-[13px] font-bold',
            !canSelect && 'col-span-2',
          )}
        >
          {t('badgeShowcase.close')}
        </button>
      </div>
      {selection.isError ? (
        <p role="alert" className="mt-2 text-center text-[12px] text-white/70 lg:text-left">
          {t('live.progress.saveBadgeError')}
        </p>
      ) : null}
    </>
  );
}
