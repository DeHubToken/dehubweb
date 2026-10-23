import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/**
 * Settings → Profile → Fediverse. The address Mastodon (and every other
 * ActivityPub app) can follow this account at — @username@dehub.io. The
 * federation itself is server-side (dehub-stream-backend src/activitypub);
 * private accounts and accounts without a username are not federated.
 */
export function FediverseHandleSetting() {
  const { t } = useTranslation();
  const { user } = useAuth() as any;
  const username = String(user?.username || '').replace(/^@/, '');
  const isPrivate = !!(user?.isPrivate || user?.customs?.isPrivate);
  const handle = username ? `@${username}@dehub.io` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handle);
      toast.success(t('fediverse.copied'));
    } catch {
      // Clipboard refused (an iframe, an old browser): the handle is selectable.
    }
  };

  return (
    <div data-setting-anchor="fediverse">
      <h3 className={SETTINGS_HEADING_CLASS}>
        <Globe className="size-4" />
        {t('fediverse.title')}
      </h3>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">{t('fediverse.description')}</p>
      {!username ? (
        <p className="text-sm text-zinc-400">{t('fediverse.noUsername')}</p>
      ) : isPrivate ? (
        <p className="text-sm text-zinc-400">{t('fediverse.privateNote')}</p>
      ) : (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white select-all">
            {handle}
          </code>
          <Button type="button" variant="outline" className={cn(SETTINGS_INLINE_ACTION_CLASS)} onClick={() => void copy()}>
            {t('fediverse.copy')}
          </Button>
        </div>
      )}
    </div>
  );
}
