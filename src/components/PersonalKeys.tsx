import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/AuthContext';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { Button } from '@/components/ui/button';
import Copy from '@/components/ui/cut-icons/copy';

/**
 * Personal MCP keys on /connect: for scripts, bots and apps that cannot open a
 * sign-in page. The key is made and stored by the account connector
 * (server/account-mcp-auth.js, route /mcp/oauth/keys), shown once, kept only
 * as a hash, and works on the person's account and the agents they own.
 */
export const MCP_URL = 'https://riftn.com/mcp';
const SCOPES = ['dehub:read', 'dehub:social', 'dehub:profile', 'dehub:agents', 'dehub:generate'] as const;
const LABELS: Record<string, string> = {
  'dehub:read': 'accountConnect.read', 'dehub:profile': 'accountConnect.profile', 'dehub:social': 'accountConnect.social',
  'dehub:generate': 'accountConnect.generate', 'dehub:agents': 'accountConnect.agents',
};
const SHORT: Record<string, string> = {
  'dehub:read': 'mcpKeys.shortRead', 'dehub:profile': 'mcpKeys.shortProfile', 'dehub:social': 'mcpKeys.shortSocial',
  'dehub:generate': 'mcpKeys.shortGenerate', 'dehub:agents': 'mcpKeys.shortAgents',
};

interface Key { id: string; client_name: string; scopes: string[]; expires_at: number; kind?: string; hint?: string }
interface Made { key: string; name: string }

export interface PersonalKeysPreview { keys: Key[]; made?: Made }

export default function PersonalKeys({ preview }: { preview?: PersonalKeysPreview }) {
  // The state gallery has no AuthProvider, so read the context directly.
  const walletAddress = useContext(AuthContext)?.walletAddress;
  return <PersonalKeysPanel key={walletAddress || 'signed-out'} preview={preview} />;
}

function CopyBox({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success(t('connectGuide.copied')); }
    catch { toast.error(t('connectGuide.copyFailed')); }
  };
  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-black/60 p-3">
      <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-xs text-white md:text-sm">{text}</pre>
      <Button size="sm" onClick={copy} className="shrink-0 rounded-xl bg-white text-black hover:bg-white/90" aria-label={label}>
        <Copy className="mr-1.5 h-4 w-4" />{t('connectGuide.copy')}
      </Button>
    </div>
  );
}

function PersonalKeysPanel({ preview }: { preview?: PersonalKeysPreview }) {
  const { t, i18n } = useTranslation();
  const auth = useContext(AuthContext);
  const walletAddress = auth?.walletAddress, isAuthenticated = !!auth?.isAuthenticated;
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['dehub:read', 'dehub:social']);
  const [keys, setKeys] = useState<Key[] | null>(preview?.keys ?? null);
  const [made, setMade] = useState<Made | null>(preview?.made ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = isAuthenticated || !!preview;

  async function call(route: string, body: object) {
    const token = await ensureFreshToken();
    const response = await fetch(`/mcp/oauth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dehub-token': token, ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}) }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || data.error || t('accountConnect.failed'));
    return data;
  }
  async function run(action: () => Promise<void>) {
    if (preview) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); } finally { setBusy(false); }
  }
  const load = () => run(async () => {
    const data = await call('connections', {});
    setKeys((data.connections as Key[]).filter(item => item.kind === 'key'));
  });
  const create = () => run(async () => {
    const data = await call('keys', { name: name.trim() || t('mcpKeys.namePlaceholder'), scopes });
    setMade({ key: data.key, name: data.name });
    setName('');
    setKeys(items => [{ id: data.id, client_name: data.name, scopes: data.scopes, expires_at: data.expires_at, kind: 'key', hint: String(data.key).slice(-4) }, ...(items ?? [])]);
  });
  const remove = (id: string) => run(async () => {
    await call('disconnect', { id });
    setKeys(items => (items ?? []).filter(item => item.id !== id));
  });
  const toggle = (scope: string) => setScopes(current => current.includes(scope) ? current.filter(s => s !== scope) : [...current, scope]);
  const date = (ms: number) => new Date(ms).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <section id="keys" className="mb-12 scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6" aria-label={t('mcpKeys.title')}>
      <h2 className="text-2xl font-semibold">{t('mcpKeys.title')}</h2>
      <p className="mt-2 text-sm text-white/60">{t('mcpKeys.body')}</p>
      {!signedIn ? (
        <Button className="mt-4" onClick={() => auth?.openLoginModal()}>{t('mcpKeys.signIn')}</Button>
      ) : <>
        {made && (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/[0.06] p-4" role="status">
            <p className="font-semibold">{t('mcpKeys.newTitle')}</p>
            <p className="mt-1 text-sm text-white/60">{t('mcpKeys.newBody')}</p>
            <CopyBox text={made.key} label={t('mcpKeys.newTitle')} />
            <p className="mt-4 text-sm text-white/60">{t('mcpKeys.useIt')}</p>
            <CopyBox text={`claude mcp add --transport http riftn ${MCP_URL} --header "Authorization: Bearer ${made.key}"`} label="Claude Code" />
            <CopyBox text={JSON.stringify({ mcpServers: { riftn: { url: MCP_URL, headers: { Authorization: `Bearer ${made.key}` } } } }, null, 2)} label="JSON" />
          </div>
        )}
        <div className="mt-5">
          <label htmlFor="mcp-key-name" className="mb-1.5 block text-sm font-medium">{t('mcpKeys.name')}</label>
          <input id="mcp-key-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={t('mcpKeys.namePlaceholder')}
            className="h-10 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30" />
          <p className="mb-2 mt-4 text-sm font-medium">{t('mcpKeys.permissions')}</p>
          <div className="space-y-2">
            {SCOPES.map(scope => (
              <label key={scope} className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-white" checked={scopes.includes(scope)} onChange={() => toggle(scope)} />
                <span>{t(LABELS[scope])}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/50">{t('mcpKeys.limits')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button disabled={busy || !scopes.length} onClick={create}>{t('mcpKeys.create')}</Button>
            {keys === null && <Button variant="outline" disabled={busy} onClick={load}>{t('mcpKeys.show')}</Button>}
          </div>
        </div>
        {keys !== null && (
          <div className="mt-6">
            <h3 className="text-base font-semibold">{t('mcpKeys.yours')}</h3>
            {keys.length === 0 ? <p className="mt-2 text-sm text-white/60">{t('mcpKeys.empty')}</p> : (
              <ul className="mt-2 space-y-3">
                {keys.map(key => (
                  <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div className="min-w-0">
                      <p className="truncate">{key.client_name} <span className="font-mono text-xs text-white/50">dhk_…{key.hint}</span></p>
                      <p className="text-xs text-white/60">{key.scopes.map(s => t(SHORT[s] || s)).join(' · ')}</p>
                      <p className="text-xs text-white/40">{t('mcpKeys.expires', { date: date(key.expires_at) })}</p>
                    </div>
                    <Button variant="outline" disabled={busy} onClick={() => remove(key.id)}>{t('mcpKeys.delete')}</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    </section>
  );
}
