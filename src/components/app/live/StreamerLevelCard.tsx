/**
 * StreamerLevelCard — where a creator sits on the streamer ladder.
 *
 * XP is one per qualifying live minute, and a stream only qualifies when it
 * ran ten minutes or longer with at least one viewer, so the number on this
 * card is time somebody actually watched. The card shows the level, the bar
 * to the next one, the weekly streak, and opens a sheet with the collectible
 * milestone cards and the last few streams (with the ones that did not count
 * marked as such, so a creator can see why the bar did not move).
 *
 * Renders nothing for an address that has never ended a stream: a profile
 * that is not a streamer's must not grow a streamer panel.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarCheck,
  Crown,
  Flame,
  Hourglass,
  Layers,
  Lock,
  Moon,
  Radio,
  Sunrise,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useStreamerProgress } from '@/hooks/use-streamer-progress';
import type { StreamerCardId, StreamerProgress } from '@/lib/api/dehub/livestream';

const CARD_ICONS: Record<StreamerCardId, LucideIcon> = {
  'first-light': Sunrise,
  marathon: Timer,
  'night-owl': Moon,
  regular: CalendarCheck,
  'iron-streak': Flame,
  crowd: Users,
  century: Hourglass,
  legend: Crown,
};

export interface StreamerLevelCardProps {
  address?: string | null;
  className?: string;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d.toLocaleDateString();
  }
}

/** Whole hours below ten, one decimal above zero, so "0.5" reads as half an hour. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return String(Math.floor(hours));
  return (Math.round(hours * 10) / 10).toString();
}

export function StreamerLevelCard({ address, className }: StreamerLevelCardProps) {
  const { t, i18n } = useTranslation();
  const { data } = useStreamerProgress(address);
  const [cardsOpen, setCardsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  if (!data || !(data.totalStreams > 0)) return null;

  const percent = Math.round(Math.min(1, Math.max(0, data.progressToNext)) * 100);
  const minutesToNext = Math.max(0, data.nextLevelXp - data.xp);
  const earnedCount = data.cards.filter((c) => c.earnedAt).length;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden relative',
          className,
        )}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 w-40 h-40 rounded-full bg-white/[0.06] blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="shrink-0 w-12 h-12 rounded-xl border border-white/15 bg-white/[0.05] flex flex-col items-center justify-center">
            <span className="text-[9px] uppercase tracking-wider text-white/40 leading-none">{t('live.progress.title')}</span>
            <span className="text-xl font-bold text-white leading-tight">{data.level}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Radio className="w-3.5 h-3.5 text-white/60" />
              <span className="truncate">{t('live.progress.level', { level: data.level })}</span>
            </div>
            <div className="text-[11px] text-white/50 font-mono truncate">
              {t('live.progress.xp', { xp: data.xp.toLocaleString() })}
              <span className="text-white/30"> · </span>
              {t('live.progress.hours', { hours: formatHours(data.qualifyingMinutes) })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCardsOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('live.progress.viewCards')}</span>
            <span className="font-mono text-white/50">{earnedCount}/{data.cards.length}</span>
          </button>
        </div>

        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('live.progress.toNext', { minutes: minutesToNext, level: data.level + 1 })}
          className="relative mt-4 h-2.5 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden"
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/40 via-white/75 to-white shadow-[0_0_14px_2px_rgba(255,255,255,0.45)]"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${Math.max(percent, data.progressToNext > 0 ? 2 : 0)}%` }}
            transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono text-white/40">{percent}%</span>
          <span className="text-white/60 truncate">
            {t('live.progress.toNext', { minutes: minutesToNext, level: data.level + 1 })}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.currentStreakWeeks > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/90">
              <Flame className="w-3 h-3" />
              {t('live.progress.streak', { count: data.currentStreakWeeks })}
            </span>
          )}
          {data.bestStreakWeeks > 0 && (
            <span className="inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/50">
              {t('live.progress.bestStreak', { count: data.bestStreakWeeks })}
            </span>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-white/45">{t('live.progress.rule')}</p>
      </div>

      <Dialog open={cardsOpen} onOpenChange={setCardsOpen}>
        <DialogContent className="max-w-lg bg-black/70 backdrop-blur-[24px] border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{t('live.progress.cardsTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">{t('live.progress.rule')}</DialogDescription>
          </DialogHeader>
          <StreamerCardGrid progress={data} locale={i18n.language} />
          <StreamerRecentList progress={data} locale={i18n.language} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function StreamerCardGrid({ progress, locale }: { progress: StreamerProgress; locale: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {progress.cards.map((card) => {
        const Icon = CARD_ICONS[card.id] ?? Layers;
        const earned = !!card.earnedAt;
        return (
          <div
            key={card.id}
            className={cn(
              'relative rounded-xl border p-3 flex flex-col items-center text-center gap-1.5 min-h-[7.5rem]',
              earned
                ? 'border-white/25 bg-white/[0.08] shadow-[0_0_18px_rgba(255,255,255,0.12)]'
                : 'border-white/10 bg-white/[0.02] opacity-60',
            )}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center border',
                earned ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/40',
              )}
            >
              {earned ? <Icon className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div className="text-xs font-semibold text-white leading-tight">
              {t(`live.progress.card.${card.id}.name`)}
            </div>
            <div className="text-[10px] leading-snug text-white/50">
              {t(`live.progress.card.${card.id}.hint`)}
            </div>
            <div className="mt-auto text-[10px] text-white/40">
              {earned ? t('live.progress.earnedOn', { date: formatDate(card.earnedAt, locale) }) : t('live.progress.locked')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StreamerRecentList({ progress, locale }: { progress: StreamerProgress; locale: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{t('live.progress.recentTitle')}</div>
      {progress.recent.length === 0 ? (
        <p className="text-xs text-white/50">{t('live.progress.noStreams')}</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {progress.recent.map((s) => (
            <li key={s.streamId} className="flex items-center gap-3 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className={cn('truncate', s.qualified ? 'text-white' : 'text-white/50')}>{s.title || '—'}</div>
                <div className="text-[10px] text-white/40 font-mono">
                  {t('live.progress.minutes', { count: s.minutes })}
                  <span className="text-white/25"> · </span>
                  {t('live.progress.viewers', { count: s.peakViewers })}
                  <span className="text-white/25"> · </span>
                  {formatDate(s.endedAt, locale)}
                </div>
              </div>
              {s.qualified ? (
                <span className="font-mono text-white/80">{t('live.progress.xp', { xp: `+${s.minutes}` })}</span>
              ) : (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50">
                  {t('live.progress.notCounted')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default StreamerLevelCard;
