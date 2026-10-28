/**
 * Live Studio's polls: ask the room a question while live.
 *
 * Runs on the stream API, on the stream the creator is broadcasting right now.
 * Viewers answer with a button in the app or `!vote 2` in chat; results come
 * back through the creator's control room as they move.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import Plus from "@/components/ui/cut-icons/add";
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { closePoll, startPoll } from '@/lib/api/dehub/live-polls';
import {
  isPollOpen,
  POLL_DURATIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  pollShares,
  type LivePoll,
} from '@/lib/live-overlay/polls';

const selectClass = `${SETTINGS_FIELD_CLASS} w-full border px-3 text-sm`;

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

interface Props {
  poll: LivePoll | null;
  onPoll: (poll: LivePoll | null) => void;
}

export function PollPanel({ poll, onPoll }: Props) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [duration, setDuration] = useState<number>(120);
  const [now, setNow] = useState(() => Date.now());

  const open = !!poll && isPollOpen(poll, now);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(filled.map((o) => o.toLowerCase())).size === filled.length;
  const canStart = !!question.trim() && filled.length >= POLL_MIN_OPTIONS && distinct;

  const start = useMutation({
    mutationFn: () => startPoll({ question: question.trim(), options: filled, durationSec: duration }),
    onSuccess: (started) => {
      onPoll(started);
      setNow(Date.now());
      toast.success(t('liveStudio.polls.started'));
    },
    // The draft is checked here first, so the API refusing it means the creator is not on air.
    onError: (err) =>
      toast.error((err as { httpStatus?: number })?.httpStatus === 400 ? t('liveStudio.polls.notLive') : t('liveStudio.polls.startFailed')),
  });
  const end = useMutation({
    mutationFn: closePoll,
    onSuccess: (closed) => onPoll(closed),
    onError: () => toast.error(t('liveStudio.polls.closeFailed')),
  });

  const setOption = (i: number, value: string) => setOptions((list) => list.map((o, j) => (j === i ? value : o)));
  const secondsLeft = poll ? Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - now) / 1000)) : 0;

  return (
    <PageSection title={t('liveStudio.polls.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.polls.intro', { command: '!vote' })}</p>

      {poll && (
        <div className="mb-4 rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-white">{poll.question}</span>
            <span className="flex-none text-xs text-zinc-400">
              {open
                ? t('liveStudio.polls.live', { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` })
                : t('liveStudio.polls.ended')}
            </span>
          </div>
          <ul className="space-y-1.5">
            {poll.options.map((option, i) => (
              <li key={i} className="relative overflow-hidden rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-sm">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-500 rtl:left-auto rtl:right-0"
                  style={{ width: `${pollShares(poll)[i]}%` }}
                />
                <span className="relative flex justify-between gap-3 text-white">
                  <span className="min-w-0 truncate">
                    {i + 1}. {option.text}
                  </span>
                  <span className="flex-none tabular-nums text-zinc-300">
                    {t('liveStudio.polls.votes', { count: option.votes })} · {pollShares(poll)[i]}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{t('liveStudio.polls.votes', { count: poll.total })}</span>
            {open && (
              <Button size="sm" variant="outline" disabled={end.isPending} onClick={() => end.mutate()}>
                {t('liveStudio.polls.end')}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Field label={t('liveStudio.polls.question')}>
          {(id) => (
            <Input
              id={id}
              value={question}
              maxLength={POLL_QUESTION_MAX}
              placeholder={t('liveStudio.polls.questionPlaceholder')}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>
        {options.map((option, i) => (
          <Field key={i} label={t('liveStudio.polls.option', { n: i + 1 })}>
            {(id) => (
              <div className="flex items-center gap-2">
                <Input id={id} value={option} maxLength={POLL_OPTION_MAX} onChange={(e) => setOption(i, e.target.value)} />
                {options.length > POLL_MIN_OPTIONS && (
                  <button
                    type="button"
                    aria-label={t('liveStudio.polls.removeOption', { n: i + 1 })}
                    onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                    className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </Field>
        ))}
        {options.length < POLL_MAX_OPTIONS && (
          <Button size="sm" variant="ghost" onClick={() => setOptions((list) => [...list, ''])}>
            <Plus className="mr-1 h-4 w-4" />
            {t('liveStudio.polls.addOption')}
          </Button>
        )}
        <Field label={t('liveStudio.polls.duration')}>
          {(id) => (
            <select id={id} className={selectClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {POLL_DURATIONS.map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? t('liveStudio.polls.seconds', { count: s }) : t('liveStudio.polls.minutes', { count: s / 60 })}
                </option>
              ))}
            </select>
          )}
        </Field>
        {open && <p className="text-xs text-zinc-500">{t('liveStudio.polls.replaceHint')}</p>}
        <Button size="sm" disabled={!canStart || start.isPending} onClick={() => start.mutate()}>
          {t('liveStudio.polls.start')}
        </Button>
      </div>
    </PageSection>
  );
}
