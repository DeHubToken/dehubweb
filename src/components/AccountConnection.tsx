import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { Button } from '@/components/ui/button';

interface Connection { id: string; client_name: string; scopes: string[]; expires_at: number }
interface Pending { client_name: string; callback_origin: string; scopes: string[] }
const permissionKeys: Record<string, string> = {
  'dehub:read': 'accountConnect.read', 'dehub:profile': 'accountConnect.profile',
  'dehub:social': 'accountConnect.social', 'dehub:generate': 'accountConnect.generate',
};
export default function AccountConnection() {
  const { walletAddress } = useAuth();
  return <AccountConnectionPanel key={walletAddress || 'signed-out'} />;
}
function AccountConnectionPanel() {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [query] = useSearchParams();
  const requestId = query.get('authorization');
  const [pending, setPending] = useState<Pending | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  async function call(route: string, body: object) {
    const token = await ensureFreshToken();
    const response = await fetch(`/mcp/oauth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dehub-token': token, ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}) }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.error || t('accountConnect.failed'));
    return data;
  }
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    fetch(`/mcp/oauth/request?id=${encodeURIComponent(requestId)}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || t('accountConnect.failed'));
      if (active) setPending(data);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [requestId, t]);
  // Existing connections are fetched only when the person opens this panel.
  async function loadConnections() {
    setBusy(true); setError('');
    try { const data = await call('connections', {}); setConnections(data.connections); setLoaded(true); }
    catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); }
    finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    setBusy(true); setError('');
    try {
      const data = await call('approve', { request_id: requestId, approve });
      const target = new URL(data.redirect);
      if (!pending || target.protocol !== 'https:' || target.origin !== pending.callback_origin) throw new Error(t('accountConnect.failed'));
      window.location.assign(target.href);
    } catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); setBusy(false); }
  }
  async function disconnect(id: string) {
    setBusy(true); setError('');
    try { await call('disconnect', { id }); setConnections(items => items.filter(item => item.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-2xl border border-white/15 bg-white/[0.03] p-5" aria-label={t('accountConnect.title')}>
    <h2 className="text-xl font-semibold">{t('accountConnect.title')}</h2>
    <p className="mt-2 text-sm text-white/70">{t('accountConnect.body')}</p>
    {!isAuthenticated ? <Button className="mt-4" onClick={() => openLoginModal()}>{t('accountConnect.signIn')}</Button> : <>
      <p className="mt-3 break-all text-sm">{user?.displayName || user?.username || walletAddress}<br /><span className="text-white/50">{walletAddress}</span></p>
      {pending ? <>
        <p className="mt-4 font-medium">{pending.client_name}</p><p className="text-sm text-white/60">{pending.callback_origin}</p>
        <ul className="my-4 list-disc space-y-1 pl-5 text-sm">{pending.scopes.map(scope => <li key={scope}>{t(permissionKeys[scope] || scope)}</li>)}</ul>
        <div className="flex gap-3"><Button disabled={busy} onClick={() => decide(true)}>{t('accountConnect.allow')}</Button><Button variant="outline" disabled={busy} onClick={() => decide(false)}>{t('accountConnect.deny')}</Button></div>
      </> : !requestId && <Button className="mt-4" variant="outline" disabled={busy} onClick={loadConnections}>{t('accountConnect.manage')}</Button>}
      {loaded && <div className="mt-4 space-y-3">{connections.length === 0 ? <p className="text-sm text-white/60">{t('accountConnect.empty')}</p> : connections.map(connection => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><div><p>{connection.client_name}</p><p className="text-xs text-white/60">{new Date(connection.expires_at).toLocaleString()}</p></div><Button variant="outline" disabled={busy} onClick={() => disconnect(connection.id)}>{t('accountConnect.disconnect')}</Button></div>)}</div>}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
  </section>;
}
