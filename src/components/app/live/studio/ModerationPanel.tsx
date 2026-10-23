/**
 * Live Studio's chat moderation: the rules for the chat under every one of
 * the creator's streams, the moderators they trust, who they banned, and what
 * happened. Only ever the creator's own stream chats — never the platform's.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import {
  addStreamModerator,
  getMyStreamModeration,
  removeStreamModerator,
  saveMyStreamModeration,
  unbanFromStreams,
  type MyStreamModeration,
  type StreamModerationPerson,
  type StreamModerationSettings,
} from '@/lib/api/dehub/livechat';
import { getAccountByUsername } from '@/lib/api/dehub/users';

export const myModerationKey = ['my-stream-moderation'] as const;

const SLOW_MODE_CHOICES = [0, 5, 10, 30, 60, 120, 300];
const selectClass = `${SETTINGS_FIELD_CLASS} w-full border px-3 text-sm`;

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-white">
          {label}
        </label>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const nameOf = (p: StreamModerationPerson) => p.displayName || p.username || `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;

export function ModerationPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<MyStreamModeration>({
    queryKey: myModerationKey,
    queryFn: getMyStreamModeration,
    staleTime: 15_000,
  });
  const [settings, setSettings] = useState<StreamModerationSettings | null>(null);
  const [words, setWords] = useState('');
  const [dirty, setDirty] = useState(false);
  const [newModerator, setNewModerator] = useState('');

  useEffect(() => {
    if (!data || dirty) return;
    setSettings(data.settings);
    setWords(data.settings.bannedWords.join(', '));
  }, [data, dirty]);

  const apply = (next: MyStreamModeration) => {
    queryClient.setQueryData(myModerationKey, next);
  };

  const change = (patch: Partial<StreamModerationSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveMyStreamModeration({
        ...settings!,
        bannedWords: words.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 200),
      }),
    onSuccess: (saved) => {
      apply(saved);
      setDirty(false);
      toast.success(t('liveStudio.moderation.saved'));
    },
    onError: () => toast.error(t('liveStudio.moderation.saveFailed')),
  });

  const addMod = useMutation({
    mutationFn: async () => {
      const user = await getAccountByUsername(newModerator.trim());
      const address = user?.address || user?.wallet_address;
      if (!address) throw new Error('not found');
      return addStreamModerator(address);
    },
    onSuccess: (saved) => {
      apply(saved);
      setNewModerator('');
      toast.success(t('liveStudio.moderation.moderatorAdded'));
    },
    onError: () => toast.error(t('liveStudio.moderation.moderatorNotFound')),
  });

  const removeMod = useMutation({
    mutationFn: (address: string) => removeStreamModerator(address),
    onSuccess: apply,
    onError: () => toast.error(t('liveStudio.moderation.saveFailed')),
  });

  const unban = useMutation({
    mutationFn: (address: string) => unbanFromStreams(address),
    onSuccess: apply,
    onError: () => toast.error(t('liveStudio.moderation.saveFailed')),
  });

  if (isLoading) {
    return (
      <PageSection title={t('liveStudio.moderation.title')}>
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </PageSection>
    );
  }
  if (isError || !data || !settings) {
    return (
      <PageSection title={t('liveStudio.moderation.title')}>
        <p className="text-sm text-zinc-400">{t('liveStudio.moderation.loadFailed')}</p>
      </PageSection>
    );
  }

  const people = new Map([...data.moderators, ...data.banned].map((p) => [p.address, p]));
  const who = (address: string) => {
    const p = people.get(address);
    return p ? nameOf(p) : `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  return (
    <PageSection title={t('liveStudio.moderation.title')}>
      <p className="mb-4 text-xs text-zinc-500">{t('liveStudio.moderation.intro')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label={t('liveStudio.moderation.slowMode')} hint={t('liveStudio.moderation.slowModeHint')}>
            {(id) => (
              <select id={id} className={selectClass} value={settings.slowModeSeconds} onChange={(e) => change({ slowModeSeconds: Number(e.target.value) })}>
                {SLOW_MODE_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? t('liveStudio.moderation.off') : t('liveStudio.moderation.seconds', { count: s })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Toggle
            label={t('liveStudio.moderation.followersOnly')}
            checked={settings.followersOnly}
            onChange={(v) => change({ followersOnly: v })}
          />
          <Toggle
            label={t('liveStudio.moderation.subscribersOnly')}
            hint={t('liveStudio.moderation.subscribersOnlyHint')}
            checked={settings.subscribersOnly}
            onChange={(v) => change({ subscribersOnly: v })}
          />
          <Field label={t('liveStudio.moderation.bannedWords')} hint={t('liveStudio.moderation.bannedWordsHint')}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={words}
                onChange={(e) => {
                  setWords(e.target.value);
                  setDirty(true);
                }}
                className="text-sm"
              />
            )}
          </Field>
          <Field label={t('liveStudio.moderation.wordAction')}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={settings.wordAction}
                onChange={(e) => change({ wordAction: e.target.value === 'timeout' ? 'timeout' : 'block' })}
              >
                <option value="block">{t('liveStudio.moderation.wordBlock')}</option>
                <option value="timeout">{t('liveStudio.moderation.wordTimeout')}</option>
              </select>
            )}
          </Field>
          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-zinc-400">{t('liveStudio.unsaved')}</span>}
            <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('liveStudio.saving') : t('liveStudio.moderation.save')}
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className={SETTINGS_LABEL_CLASS}>{t('liveStudio.moderation.moderators')}</p>
            <p className="mb-2 text-xs text-zinc-500">{t('liveStudio.moderation.moderatorsHint')}</p>
            <form
              className="mb-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newModerator.trim()) addMod.mutate();
              }}
            >
              <Input
                value={newModerator}
                onChange={(e) => setNewModerator(e.target.value)}
                placeholder={t('liveStudio.moderation.usernamePlaceholder')}
                aria-label={t('liveStudio.moderation.addModerator')}
                className={SETTINGS_FIELD_CLASS}
              />
              <Button type="submit" size="sm" variant="outline" disabled={!newModerator.trim() || addMod.isPending}>
                {t('liveStudio.moderation.addModerator')}
              </Button>
            </form>
            <PeopleList people={data.moderators} empty={t('liveStudio.moderation.noModerators')} actionLabel={t('liveStudio.moderation.removeModerator')} onAction={(a) => removeMod.mutate(a)} />
          </div>

          <div>
            <p className={SETTINGS_LABEL_CLASS}>{t('liveStudio.moderation.banned')}</p>
            <PeopleList people={data.banned} empty={t('liveStudio.moderation.noBans')} actionLabel={t('liveStudio.moderation.unban')} onAction={(a) => unban.mutate(a)} />
          </div>

          <div>
            <p className={SETTINGS_LABEL_CLASS}>{t('liveStudio.moderation.log')}</p>
            {data.log.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('liveStudio.moderation.noLog')}</p>
            ) : (
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs text-zinc-300">
                {data.log.map((entry, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-zinc-500">{new Date(entry.at).toLocaleString()}</span>
                    <span>
                      {t(`liveStudio.moderation.actions.${entry.action}`, {
                        target: who(entry.target),
                        actor: who(entry.actor),
                        count: entry.seconds ?? 0,
                        word: entry.word ?? '',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageSection>
  );
}

function PeopleList({
  people,
  empty,
  actionLabel,
  onAction,
}: {
  people: StreamModerationPerson[];
  empty: string;
  actionLabel: string;
  onAction: (address: string) => void;
}) {
  if (!people.length) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-1">
      {people.map((p) => (
        <li key={p.address} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-zinc-800/60">
          <span className="truncate text-sm text-white">{nameOf(p)}</span>
          <button onClick={() => onAction(p.address)} aria-label={actionLabel} title={actionLabel} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white">
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
