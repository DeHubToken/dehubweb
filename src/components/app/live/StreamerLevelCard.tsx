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

import { useId, useState } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { STREAMER_BADGE_IDS, badgeMaterial, streamerBadgeSvg } from '@/lib/streamer-badge-art';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame, Layers, Lock, Radio } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useStreamerProgress, useSelectStreamerBadge } from '@/hooks/use-streamer-progress';
import type { StreamerCardId, StreamerProgress } from '@/lib/api/dehub/livestream';

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
  const selection = useSelectStreamerBadge();
  const { theme } = useAppTheme();
  const instance = useId();

  if (!data || !(data.totalStreams > 0)) return null;

  const percent = Math.round(Math.min(1, Math.max(0, data.progressToNext)) * 100);
  const minutesToNext = Math.max(0, data.nextLevelXp - data.xp);
  const earnedCount = data.cards.filter((c) => c.earnedAt).length;
  const equipped = data.cards.find((card) => card.id === data.selectedBadgeId && card.earnedAt);

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden relative',
          className,
        )}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 w-40 h-40 rounded-full bg-white/[0.06] blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-center gap-3">
          <div className="shrink-0 w-20 min-h-20 p-2 rounded-xl border border-white/15 bg-white/[0.05] flex flex-col items-center justify-center gap-1 text-center">
            {equipped ? <div aria-hidden="true" className="w-16 h-16 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(equipped.id, theme, true, instance) }} /> : <>
            <span className="w-full break-words text-[9px] uppercase tracking-wider text-white/40 leading-snug">{t('live.progress.title')}</span>
            <span className="text-xl font-bold text-white leading-tight">{data.level}</span>
            </>}
          </div>

          <div className="min-w-0 flex-1 basis-32">
            {equipped && <div className="text-xs text-white/70 mb-1">{t(`live.progress.card.${equipped.id}.name`)}</div>}
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Radio className="w-3.5 h-3.5 text-white/60" />
              <span className="break-words">{t('live.progress.level', { level: data.level })}</span>
            </div>
            <div className="mt-1 text-[11px] text-white/50 font-mono leading-relaxed">
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
            <span className="font-mono text-white/50">{earnedCount}/{STREAMER_BADGE_IDS.length}</span>
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
          <span className="text-white/60 text-right leading-relaxed">
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
        <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto bg-black/70 backdrop-blur-[24px] border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{t('live.progress.cardsTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">{t('live.progress.rule')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-white/70" role="status">{selection.isPending ? t('live.progress.savingBadge') : t('live.progress.chooseBadge')}</p>
          {selection.isError && <p className="text-sm text-white" role="alert">{t('live.progress.saveBadgeError')}</p>}
          <StreamerCardGrid progress={data} locale={i18n.language} saving={selection.isPending} onSelect={(badgeId) => { if (address) selection.mutate({ address, badgeId }); }} />
          <StreamerRecentList progress={data} locale={i18n.language} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function StreamerCardGrid({ progress, locale, saving, onSelect }: { progress: StreamerProgress; locale: string; saving: boolean; onSelect: (id: StreamerCardId) => void }) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const instance = useId();
  const material = badgeMaterial(theme);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {STREAMER_BADGE_IDS.map((id) => {
        const card = progress.cards.find((c) => c.id === id);
        const earned = !!card?.earnedAt;
        return (
          <div key={id} className="flex min-w-0 flex-col items-center gap-2 p-3 text-center"
            style={{ background: material.panel, color: material.text, border: '1px solid ' + material.edge + (earned ? 'aa' : '44'), borderRadius: theme === 'minimal' || theme === 'war' ? 0 : 16 }}>
            <div aria-hidden="true" className="w-24 h-24 shrink-0 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(id, theme, earned, instance) }} />
            <div className="text-sm font-semibold leading-snug break-words">{t(`live.progress.card.${id}.name`)}</div>
            <div className="text-xs leading-relaxed" style={{ color: material.muted }}>{t(`live.progress.card.${id}.hint`)}</div>
            <div className="mt-auto pt-2 flex items-center justify-center gap-1 text-[11px] leading-relaxed" style={{ color: material.muted }}>
              {!earned && <Lock className="h-3 w-3 shrink-0" />}
              {earned ? t('live.progress.earnedOn', { date: formatDate(card!.earnedAt, locale) }) : t('live.progress.locked')}
            </div>
            {earned && <button type="button" onClick={() => onSelect(id)} disabled={saving || progress.selectedBadgeId === id}
              aria-pressed={progress.selectedBadgeId === id}
              className="mt-1 min-h-9 w-full rounded-lg border px-2 py-2 text-xs font-medium disabled:cursor-default"
              style={{ color: material.text, borderColor: material.edge, borderWidth: progress.selectedBadgeId === id ? 2 : 1, background: material.face }}>
              {progress.selectedBadgeId === id ? t('live.progress.selectedBadge') : t('live.progress.useBadge')}
            </button>}
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
