/**
 * "Allow reactions": whether other creators may react to a video, recorded or
 * live. On a post it is that post's choice; in Settings it is the account
 * default for every post without one. The remix-links function enforces it,
 * and turning it off also takes the video off any stream showing it now.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getReactionSetting, setReactionSetting } from '@/lib/api/remix-links';

function useAllowReactions(tokenId: string | number | undefined, wallet: string | null | undefined, enabled: boolean) {
  const [allow, setAllow] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = tokenId != null
      ? getReactionSetting(tokenId).then((s) => s.allowReact)
      : wallet
        ? Promise.resolve(supabase.from('remix_settings' as never).select('allow_react')
          .eq('owner_address', wallet.toLowerCase()).eq('token_id', 0).maybeSingle())
          .then(({ data }) => (data as { allow_react?: boolean } | null)?.allow_react ?? true)
        : Promise.resolve(true);
    load.then((v) => { if (live) setAllow(v); }).catch(() => { if (live) setAllow(true); });
    return () => { live = false; };
  }, [tokenId, wallet, enabled]);

  const change = async (next: boolean) => {
    const before = allow;
    setAllow(next);
    try {
      await setReactionSetting(next, tokenId);
    } catch (error) {
      setAllow(before);
      toast.error(error instanceof Error ? error.message : 'Could not save this setting.');
    }
  };
  return [allow, change] as const;
}

/** One post's switch, for its edit sheet. Saves as soon as it is flipped. */
export function PostAllowReactions({ tokenId, open }: { tokenId: string | number; open: boolean }) {
  const { t } = useTranslation();
  const [allow, change] = useAllowReactions(tokenId, null, open);
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`allow-reactions-${tokenId}`} className="text-sm font-medium text-zinc-300">
        {t('reactions.allow', 'Allow reactions')}
      </Label>
      <Switch id={`allow-reactions-${tokenId}`} checked={allow ?? true} disabled={allow === null} onCheckedChange={(v) => void change(v)} />
    </div>
  );
}

/** The account default, for Settings. */
export function AccountAllowReactions() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [allow, change] = useAllowReactions(undefined, walletAddress, !!walletAddress);
  if (!walletAddress) return null;
  return (
    <SettingsRow
      as="label"
      className="cursor-pointer"
      anchor="allow-reactions"
      icon={<MonitorPlay />}
      title={t('reactions.allow', 'Allow reactions')}
      description={t('reactions.allowDescription', 'Let other creators react to your videos, recorded or live. You can still change it on each post.')}
      action={<Switch checked={allow ?? true} disabled={allow === null} onCheckedChange={(v) => void change(v)} />}
    />
  );
}
