import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthContext } from '@/contexts/AuthContext';
import {
  listProviderKeys,
  removeProviderKey,
  saveProviderKey,
  testProviderKey,
  type ProviderKeyRow,
  type ProviderKeyStatus,
} from '@/lib/api/dehub/provider-keys';
import { SETTINGS_FIELD_CLASS, SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/**
 * Settings → Profile → Your own AI keys.
 *
 * A creator pastes a provider key once; tools that run on that provider then
 * use their account and DeHub charges nothing. The server checks the key with
 * one free call before saving, and only ever sends back the last 4 characters.
 */
export function OwnAiKeysSetting({ preview, previewEditing, previewShowAll }: { preview?: ProviderKeyRow[]; previewEditing?: string; previewShowAll?: boolean } = {}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext) as { isAuthenticated?: boolean } | undefined;
  const isAuthenticated = !!preview || !!auth?.isAuthenticated;
  const [rows, setRows] = useState<ProviderKeyRow[] | null>(preview ?? null);
  const [editing, setEditing] = useState<string | null>(previewEditing ?? null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(!!previewShowAll);

  const load = useCallback(() => {
    listProviderKeys().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (isAuthenticated && !preview) load();
  }, [isAuthenticated, preview, load]);

  if (!isAuthenticated) return null;

  const statusLabel = (status: ProviderKeyStatus) => ({
    working: t('ownKeys.working', 'Working'),
    invalid: t('ownKeys.invalid', 'Rejected, replace it'),
    no_credit: t('ownKeys.noCredit', 'Out of credit'),
    disabled: t('ownKeys.disabled', 'Turned off by DeHub'),
  })[status];

  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ownKeys.failed', 'Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const save = (row: ProviderKeyRow) => run(row.id, async () => {
    const result = await saveProviderKey(row.id, draft.trim());
    setDraft('');
    setEditing(null);
    toast.success(result.status === 'no_credit'
      ? t('ownKeys.savedNoCredit', '{{name}} key saved, but the account is out of credit.', { name: row.label })
      : t('ownKeys.saved', '{{name}} key saved. Tools on {{name}} now use your account.', { name: row.label }));
    load();
  });

  const recheck = (row: ProviderKeyRow) => run(row.id, async () => {
    const result = await testProviderKey(row.id);
    toast.success(`${row.label}: ${statusLabel(result.status)}`);
    load();
  });

  const remove = (row: ProviderKeyRow) => run(row.id, async () => {
    await removeProviderKey(row.id);
    toast.success(t('ownKeys.removed', '{{name}} key removed.', { name: row.label }));
    load();
  });

  const saved = (rows ?? []).filter(row => row.saved);
  const visible = showAll || saved.length === 0 ? rows ?? [] : saved;

  return (
    <div data-setting-anchor="own-ai-keys" id="own-ai-keys">
      <h3 className={SETTINGS_HEADING_CLASS}>
        <KeyRound className="size-4" />
        {t('ownKeys.title', 'Your own AI keys')}
      </h3>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">
        {t('ownKeys.description', 'Add a key from an AI provider and Creator tools run on your account instead. DeHub charges nothing for those jobs. Keys are encrypted and never shown again.')}
      </p>
      {rows === null ? (
        <Loader2 className="size-4 animate-spin text-zinc-500" />
      ) : (
        <ul className="space-y-2">
          {visible.map(row => (
            <li key={row.id} className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-sm text-white">
                    {row.label}
                    {row.saved ? <span className="ml-2 font-mono text-xs text-zinc-500">••••{row.saved.last4}</span> : null}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {row.saved ? statusLabel(row.saved.status) : row.powers}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                {busy === row.id ? <Loader2 className="size-4 animate-spin text-zinc-500" /> : null}
                {row.saved ? (
                  <>
                    <Button type="button" variant="outline" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy}
                      onClick={() => { setEditing(row.id); setDraft(''); }}>
                      {t('ownKeys.replace', 'Replace')}
                    </Button>
                    {row.saved.status !== 'invalid' ? (
                      <Button type="button" variant="outline" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy}
                        onClick={() => void recheck(row)}>
                        {t('ownKeys.check', 'Check')}
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy}
                      onClick={() => void remove(row)}>
                      {t('ownKeys.remove', 'Remove')}
                    </Button>
                  </>
                ) : editing !== row.id ? (
                  <Button type="button" variant="outline" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy}
                    onClick={() => { setEditing(row.id); setDraft(''); }}>
                    {t('ownKeys.add', 'Add key')}
                  </Button>
                ) : null}
                </div>
              </div>
              {editing === row.id ? (
                <form className="mt-2 flex items-center gap-2" onSubmit={event => { event.preventDefault(); void save(row); }}>
                  <Input
                    type="password"
                    name={`own-key-${row.id}`}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={t('ownKeys.paste', 'Paste your {{name}} key', { name: row.label })}
                    className={`${SETTINGS_FIELD_CLASS} min-w-0 flex-1`}
                  />
                  <Button type="submit" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy || draft.trim().length < 8}>
                    {t('ownKeys.save', 'Save')}
                  </Button>
                  <Button type="button" variant="outline" className={SETTINGS_INLINE_ACTION_CLASS} disabled={!!busy}
                    onClick={() => { setEditing(null); setDraft(''); }}>
                    {t('ownKeys.cancel', 'Cancel')}
                  </Button>
                </form>
              ) : null}
              {editing === row.id ? (
                <a href={row.keysUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-zinc-400 underline">
                  {t('ownKeys.getKey', 'Get a {{name}} key', { name: row.label })}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {rows && saved.length > 0 && saved.length < rows.length ? (
        <button type="button" className="mt-2 text-xs text-zinc-400 underline" onClick={() => setShowAll(v => !v)}>
          {showAll ? t('ownKeys.showLess', 'Show only my keys') : t('ownKeys.addAnother', 'Add another provider')}
        </button>
      ) : null}
    </div>
  );
}
