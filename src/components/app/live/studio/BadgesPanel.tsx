/**
 * Live Studio's limited-time badges. A creator offers a badge for a few days;
 * anyone who subscribes, gifts a subscription or sends a paid gift while it is
 * on offer earns it, and it shows beside their name in this creator's chat
 * from then on. The hype train badge is earned the same way, by riding one.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { createEventBadge, endEventBadge, getMyEventBadges, type BadgeAudience } from '@/lib/api/dehub/live-hype';

const AUDIENCES: BadgeAudience[] = ['both', 'subscribers', 'gifters'];
const EMOJI = ['⭐', '🔥', '💎', '🎉', '👑', '🚀', '🎁', '🏆'];
const KEY = ['live-badges', 'mine'] as const;

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

export function BadgesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: KEY, queryFn: getMyEventBadges, staleTime: 60_000, retry: false });
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [audience, setAudience] = useState<BadgeAudience>('both');
  const [days, setDays] = useState(7);

  const failed = (err: Error) => toast.error(err?.message || t('liveHype.badges.failed'));
  const create = useMutation({
    mutationFn: () => createEventBadge({ name: name.trim(), emoji, audience, days }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(t('liveHype.badges.created'));
    },
    onError: failed,
  });
  const end = useMutation({
    mutationFn: endEventBadge,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: failed,
  });

  // The stream API has not got badges yet: say nothing rather than a broken form.
  if (isError) return null;
  const badges = data ?? [];
  const running = badges.filter((b) => b.active);

  return (
    <PageSection title={t('liveHype.badges.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('liveHype.badges.intro')}</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : (
        <>
          {badges.length > 0 && (
            <ul className="mb-4 space-y-1.5">
              {badges.map((b) => (
                <li key={b.id} className="flex items-center gap-3 text-sm">
                  <span className="text-lg leading-none" aria-hidden>
                    {b.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-white">{b.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {b.active
                        ? t('liveHype.badges.until', { date: new Date(b.endsAt).toLocaleDateString() })
                        : t('liveHype.badges.ended')}
                      {' · '}
                      {t('liveHype.badges.holders', { count: b.holders ?? 0 })}
                    </span>
                  </span>
                  {b.active && (
                    <Button size="sm" variant="outline" disabled={end.isPending} onClick={() => end.mutate(b.id)}>
                      {t('liveHype.badges.end')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {running.length < 3 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('liveHype.badges.name')}>
                {(id) => (
                  <Input id={id} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('liveHype.badges.namePlaceholder')} className={SETTINGS_FIELD_CLASS} />
                )}
              </Field>
              <Field label={t('liveHype.badges.days')}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => setDays(Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                    className={SETTINGS_FIELD_CLASS}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <p className={SETTINGS_LABEL_CLASS}>{t('liveHype.badges.emoji')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-pressed={emoji === e}
                      onClick={() => setEmoji(e)}
                      className={`h-9 w-9 rounded-lg border text-lg ${emoji === e ? 'border-white/60 bg-white/15' : 'border-zinc-700 bg-zinc-900'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <p className={SETTINGS_LABEL_CLASS}>{t('liveHype.badges.who')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={audience === a}
                      onClick={() => setAudience(a)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${audience === a ? 'border-white/60 bg-white/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}
                    >
                      {t(`liveHype.badges.audience.${a}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('liveHype.badges.create')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t('liveHype.badges.limit')}</p>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-zinc-500">{t('liveHype.badges.hypeHint')}</p>
    </PageSection>
  );
}
