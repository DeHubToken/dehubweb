import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWindow } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { listConnectedApps, removeConnectedApp, type ConnectedApp } from '@/lib/api/dehub/mastodon-apps';
import { SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/**
 * Settings → Profile → Connected apps. The Mastodon apps this account signed
 * in to (dehub.io/oauth/authorize), each removable — removing one revokes its
 * tokens at once (dehub-stream-backend src/mastodon).
 */
export function ConnectedAppsSetting() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth() as any;
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listConnectedApps()
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const remove = async (clientId: string) => {
    setBusy(clientId);
    try {
      await removeConnectedApp(clientId);
      setApps((current) => (current || []).filter((app) => app.clientId !== clientId));
      toast.success(t('mastodonApps.removed'));
    } catch {
      toast.error(t('mastodonApps.failed'));
    } finally {
      setBusy(null);
    }
  };

  // Only people who have actually signed a Mastodon app in see this block.
  // Everyone else (nearly everyone) gets nothing, not an empty card.
  if (!isAuthenticated || !apps || apps.length === 0) return null;

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  return (
    <div data-setting-anchor="connected-apps">
      <h3 className={SETTINGS_HEADING_CLASS}>
        <AppWindow className="size-4" />
        {t('mastodonApps.connectedTitle')}
      </h3>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">{t('mastodonApps.connectedDescription')}</p>
      <ul className="space-y-2">
          {apps.map((app) => (
            <li key={app.clientId} className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{app.name}</p>
                {app.lastUsedAt ? (
                  <p className="text-xs text-zinc-500">{t('mastodonApps.lastUsed', { date: when(app.lastUsedAt) })}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                className={SETTINGS_INLINE_ACTION_CLASS}
                disabled={busy === app.clientId}
                onClick={() => void remove(app.clientId)}
              >
                {t('mastodonApps.remove')}
              </Button>
            </li>
          ))}
      </ul>
    </div>
  );
}
