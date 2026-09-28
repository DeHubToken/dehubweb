import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { eraseAccount } from '@/lib/api/dehub/account-erasure';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { isAuthenticated, connect, disconnect } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(false);
  const submit = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      await eraseAccount();
      setAccepted(true);
      await disconnect({ forgetProfile: true });
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return (
    <main className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 py-12 space-y-6">
        <Link to="/app/settings" className="text-sm underline">{t('accountDeletion.back')}</Link>
        <h1 className="text-2xl font-semibold">{t(accepted ? 'accountDeletion.accepted' : 'accountDeletion.title')}</h1>
        {accepted ? <p role="status">{t('accountDeletion.receipt')}</p> : <>
          <p>{t('accountDeletion.warning')}</p>
          {!isAuthenticated ? <Button onClick={() => void connect()}>{t('accountDeletion.signIn')}</Button> : <>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
              <span>{t('accountDeletion.acknowledge')}</span>
            </label>
            <Button variant="destructive" disabled={!confirmed || busy} onClick={() => void submit()}>
              {t(busy ? 'accountDeletion.busy' : 'accountDeletion.confirm')}
            </Button>
          </>}
          {error && <p role="alert">{t('accountDeletion.error')}</p>}
        </>}
      </div>
    </main>
  );
}
