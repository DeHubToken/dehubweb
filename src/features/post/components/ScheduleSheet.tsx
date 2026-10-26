import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Minus, Plus, Sparkles } from "lucide-react";
import X from '@/components/ui/cut-icons/close';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { parseWhen } from '@/lib/schedule/parseWhen';
import { bestTime, toLocalGrid } from '@/lib/schedule/fansOnline';
import { getFansOnline } from '@/lib/api/dehub/scheduled';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

export type ScheduleKind = 'post' | 'live' | 'stage';

interface ScheduleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
  title?: string;
  minimumMinutes?: number;
  /** Words on the picks and the main button. Defaults to a post. */
  kind?: ScheduleKind;
  /** Moving something already planned: no "Remove schedule", no Planned link. */
  moving?: boolean;
}

const STEP = 15;
const DAYS_SHOWN = 14;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** The next quarter hour after `minAhead` minutes from now. */
const firstSlot = (minAhead: number) => {
  const d = new Date(Date.now() + Math.max(minAhead, 0) * 60_000 + 60_000);
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes()) / STEP) * STEP;
  return atMinutes(startOfDay(d), m);
};

/**
 * The "When?" sheet for posts, Lives and Stages: type a time, tap a pick, or
 * choose a day from the strip and step the time. Kit chips and buttons, so
 * every theme styles it like the rest of the app.
 */
export function ScheduleSheet({ isOpen, onClose, scheduledDate, onSchedule, title: titleProp, minimumMinutes = 0, kind = 'post', moving = false }: ScheduleSheetProps) {
  const { t, i18n } = useTranslation();
  const title = titleProp ?? t('whenSheet.title', { defaultValue: 'When?' });
  const locale = i18n.language || undefined;
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [minutes, setMinutes] = useState(19 * 60 + 30);
  const [typed, setTyped] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);
  const [showFans, setShowFans] = useState(false);
  const { walletAddress } = useAuth();
  const fans = useQuery({
    queryKey: ['fans-online', walletAddress],
    queryFn: getFansOnline,
    enabled: isOpen && !!walletAddress,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const fansGrid = useMemo(() => (fans.data ? toLocalGrid(fans.data.grid) : null), [fans.data]);

  useEffect(() => {
    if (!isOpen) return;
    const when = scheduledDate ?? firstSlot(Math.max(minimumMinutes, 60));
    setDay(startOfDay(when));
    setMinutes(when.getHours() * 60 + when.getMinutes());
    setTyped('');
  }, [isOpen, scheduledDate, minimumMinutes]);

  const earliest = Date.now() + minimumMinutes * 60_000;
  const selectedAt = atMinutes(day, minutes);
  const validTime = selectedAt.getTime() > earliest;

  const parsed = useMemo(() => (typed.trim() ? parseWhen(typed) : null), [typed]);
  useEffect(() => {
    if (!parsed) return;
    setDay(startOfDay(parsed.at));
    if (parsed.hasTime) setMinutes(parsed.at.getHours() * 60 + parsed.at.getMinutes());
  }, [parsed]);

  const today = startOfDay(new Date());
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today.getTime()]);
  const dayIndex = days.findIndex(d => sameDay(d, day));
  useEffect(() => {
    if (!isOpen || dayIndex < 0) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-day-index="${dayIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [isOpen, dayIndex]);

  const picks = useMemo(() => {
    const now = new Date();
    const nextWeekday = (wd: number) => addDays(today, ((wd - now.getDay() + 7) % 7) || 7);
    const tonight = atMinutes(today, 20 * 60);
    const best = fansGrid ? bestTime(fansGrid, earliest, now) : null;
    const prime = best ?? (() => {
      const d = atMinutes(today, 19 * 60 + 30);
      return d.getTime() > earliest ? d : atMinutes(addDays(today, 1), 19 * 60 + 30);
    })();
    const friday = now.getDay() === 5 ? atMinutes(addDays(today, 1), 19 * 60) : atMinutes(nextWeekday(5), 19 * 60);
    const list = [
      tonight.getTime() > earliest
        ? { id: 'tonight', label: t('whenSheet.tonight', { defaultValue: 'Tonight' }), at: tonight }
        : { id: 'soon', label: t('whenSheet.inAnHour', { defaultValue: 'In an hour' }), at: firstSlot(Math.max(minimumMinutes, 60)) },
      { id: 'tomorrow', label: t('whenSheet.tomorrow', { defaultValue: 'Tomorrow' }), at: atMinutes(addDays(today, 1), 9 * 60) },
      { id: 'weekend', label: friday.toLocaleDateString(locale, { weekday: 'long' }), at: friday },
      best
        ? { id: 'prime', label: t('whenSheet.bestTime', { defaultValue: 'Best time' }), at: prime, prime: true }
        : { id: 'prime', label: t('whenSheet.primeTime', { defaultValue: 'Prime time' }), at: prime, prime: true },
    ];
    return list;
  }, [today.getTime(), earliest, locale, minimumMinutes, t, fansGrid]);

  const timeLabel = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const dayLabel = (d: Date) => (sameDay(d, today)
    ? t('whenSheet.today', { defaultValue: 'Today' })
    : sameDay(d, addDays(today, 1))
      ? t('whenSheet.tomorrow', { defaultValue: 'Tomorrow' })
      : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }));
  const zone = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';
    } catch { return ''; }
  })();

  const step = (delta: number) => {
    const next = atMinutes(day, minutes + delta);
    setDay(startOfDay(next));
    setMinutes(next.getHours() * 60 + next.getMinutes());
    setTyped('');
  };
  const choose = (at: Date) => {
    setDay(startOfDay(at));
    setMinutes(at.getHours() * 60 + at.getMinutes());
    setTyped('');
  };

  const handleConfirm = () => {
    if (!validTime) return;
    onSchedule(selectedAt);
    onClose();
  };
  const handleClear = () => {
    onSchedule(null);
    onClose();
  };

  const confirmText = t('whenSheet.scheduleFor', { defaultValue: 'Schedule for {{when}}', when: `${dayLabel(day)}, ${timeLabel(selectedAt)}` });
  const kindTip = kind === 'live'
    ? t('whenSheet.liveTip', { defaultValue: 'Your followers can set a reminder. You start the Live yourself when it is time.' })
    : kind === 'stage'
      ? t('whenSheet.stageTip', { defaultValue: 'It goes on the Upcoming shelf straight away, so people can tap Remind me.' })
      : null;

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent glass hideHandle column scrollable className="max-h-[92dvh] px-4 pb-2" data-when-sheet>
        <DrawerHeader className="relative mx-auto w-full max-w-[440px] px-0 pb-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })} className="-ml-2 rounded-xl p-2 transition-colors hover:bg-white/10">
              <X className="h-5 w-5 text-white/70" />
            </button>
            <DrawerTitle className="absolute left-1/2 -translate-x-1/2 font-semibold text-white">{title}</DrawerTitle>
            <span className="w-9" />
          </div>
        </DrawerHeader>

        <div className="mx-auto w-full max-w-[440px] space-y-4">
          <label className="!flex !h-11 w-full !justify-start !gap-2 !rounded-[10px] !px-3 text-white" data-kit-chip style={{ cursor: 'text' }}>
            <Clock className="h-4 w-4 shrink-0 opacity-60" />
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && parsed) { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              placeholder={t('whenSheet.typePlaceholder', { defaultValue: 'Type a time, like "fri 8pm" or "in 2 hours"' })}
              aria-label={t('whenSheet.typeLabel', { defaultValue: 'Type a time' })}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-inherit outline-none placeholder:text-white/45"
              enterKeyHint="done"
              autoComplete="off"
            />
          </label>
          {parsed && (
            <p className="-mt-2 text-xs font-semibold text-white">{dayLabel(parsed.at)}{parsed.hasTime ? `, ${timeLabel(parsed.at)}` : ''}</p>
          )}
          {typed.trim() && !parsed && (
            <p className="-mt-2 text-xs text-white/60">{t('whenSheet.typeHelp', { defaultValue: 'Try "tonight", "tomorrow 9am", "sat noon" or "30 oct 7pm".' })}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {picks.map(pick => {
              const tooSoon = pick.at.getTime() <= earliest;
              const active = sameDay(pick.at, day) && pick.at.getHours() * 60 + pick.at.getMinutes() === minutes;
              return (
                <button
                  key={pick.id}
                  type="button"
                  data-kit-chip
                  data-active={active ? 'true' : undefined}
                  disabled={tooSoon}
                  onClick={() => choose(pick.at)}
                  className="!h-auto !flex-col !items-start !justify-center !gap-0.5 !rounded-[10px] !px-3 !py-2.5 text-left disabled:opacity-40"
                >
                  <span className="flex items-center gap-1 text-sm font-semibold">{pick.prime && <Sparkles className="h-3.5 w-3.5" />}{pick.label}</span>
                  <span className="text-xs font-medium opacity-70">{pick.id === 'weekend' ? `${pick.at.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${timeLabel(pick.at)}` : pick.id === 'prime' ? `${dayLabel(pick.at)} · ${timeLabel(pick.at)}` : timeLabel(pick.at)}</span>
                </button>
              );
            })}
          </div>

          {fansGrid && (
            <div data-fans-online>
              <button
                type="button"
                onClick={() => setShowFans(v => !v)}
                aria-expanded={showFans}
                className="flex w-full items-center justify-between py-1 text-left text-xs font-semibold text-white/75 hover:text-white"
              >
                <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />{t('whenSheet.fansOnline', { defaultValue: 'When are my fans online?' })}</span>
                <span className="text-white/45">{showFans ? t('whenSheet.hide', { defaultValue: 'Hide' }) : t('whenSheet.show', { defaultValue: 'Show' })}</span>
              </button>
              {showFans && (() => {
                const max = Math.max(1, ...fansGrid.flat());
                return (
                  <div className="mt-2 space-y-[3px]">
                    {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map(d => (
                      <div key={d.getTime()} className="flex items-center gap-1.5">
                        <span className="w-9 shrink-0 text-[10px] font-medium text-white/55">{sameDay(d, today) ? t('whenSheet.today', { defaultValue: 'Today' }) : d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                        <div className="grid flex-1 grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                          {fansGrid[d.getDay()].map((count, hour) => {
                            const at = atMinutes(d, hour * 60);
                            const past = at.getTime() <= earliest;
                            const picked = sameDay(at, day) && minutes === hour * 60;
                            return (
                              <button
                                key={hour}
                                type="button"
                                disabled={past}
                                onClick={() => choose(at)}
                                aria-label={`${dayLabel(at)} ${timeLabel(at)}: ${count}`}
                                className={cn('h-4 rounded-[3px] text-white disabled:opacity-25', picked && 'ring-1 ring-white')}
                                style={{ background: 'currentColor', opacity: past ? undefined : 0.12 + 0.88 * (count / max) }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pl-[42px] text-[10px] text-white/45">
                      <span>{timeLabel(atMinutes(today, 0))}</span>
                      <span>{timeLabel(atMinutes(today, 12 * 60))}</span>
                      <span>{timeLabel(atMinutes(today, 23 * 60))}</span>
                    </div>
                    <p className="pt-1 text-[11px] text-white/50">
                      {fans.data?.basis === 'followers'
                        ? t('whenSheet.fansBasis', { defaultValue: 'Brighter means more of your followers were watching, last {{count}} days.', count: fans.data.days })
                        : t('whenSheet.everyoneBasis', { defaultValue: 'Not enough follower activity yet, so this is everyone on DeHub.' })}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{t('whenSheet.orPickDay', { defaultValue: 'Or pick a day' })}</p>
            <div ref={stripRef} role="tablist" className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
              {days.map((d, i) => {
                const active = i === dayIndex;
                return (
                  <button
                    key={d.getTime()}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-day-index={i}
                    onClick={() => { setDay(d); setTyped(''); }}
                    className={cn('relative flex w-12 shrink-0 flex-col items-center gap-0.5 py-1.5 text-white transition-opacity', active ? 'opacity-100' : 'opacity-55 hover:opacity-80')}
                  >
                    <span className="text-[11px] font-medium">{i === 0 ? t('whenSheet.today', { defaultValue: 'Today' }) : d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                    <span className={cn('text-lg leading-none tabular-nums', active ? 'font-extrabold' : 'font-semibold')}>{d.getDate()}</span>
                    {active && (
                      <span aria-hidden className="absolute bottom-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-[3px]" style={{ background: 'currentColor', boxShadow: '0 0 10px currentColor, 0 0 2px currentColor' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 text-white">
            <button type="button" data-kit-button="quiet" onClick={() => step(-STEP)} aria-label={t('whenSheet.earlier', { defaultValue: '15 minutes earlier' })} className="!h-10 !w-10 !rounded-full !p-0">
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[7.5rem] text-center text-[28px] font-extrabold tabular-nums tracking-tight">{timeLabel(selectedAt)}</span>
            <button type="button" data-kit-button="quiet" onClick={() => step(STEP)} aria-label={t('whenSheet.later', { defaultValue: '15 minutes later' })} className="!h-10 !w-10 !rounded-full !p-0">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1 text-center text-xs text-white/60">
            {!validTime ? (
              <p role="alert" className="text-amber-400">
                {minimumMinutes > 0
                  ? t('whenSheet.tooSoonMin', { defaultValue: 'Pick a time at least {{count}} minutes from now.', count: minimumMinutes })
                  : t('whenSheet.tooSoon', { defaultValue: 'Pick a time in the future.' })}
              </p>
            ) : (
              <p>{t('whenSheet.zone', { defaultValue: 'Your time ({{zone}}). Everyone else sees it in their own time.', zone })}</p>
            )}
            {kindTip && <p>{kindTip}</p>}
          </div>

          <div className="flex flex-col gap-2 pb-1">
            <button type="button" data-kit-button="primary" onClick={handleConfirm} disabled={!validTime} className="w-full">
              {confirmText}
            </button>
            {scheduledDate && !moving && (
              <button type="button" data-kit-button="quiet" onClick={handleClear} className="w-full">
                {t('whenSheet.remove', { defaultValue: 'Remove schedule' })}
              </button>
            )}
            {!moving && (
              <Link to="/app/planned" onClick={onClose} className="mx-auto py-1.5 text-[12px] text-white/55 hover:text-white">
                {t('planned.seeAll', { defaultValue: 'See everything you have planned' })}
              </Link>
            )}
          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
