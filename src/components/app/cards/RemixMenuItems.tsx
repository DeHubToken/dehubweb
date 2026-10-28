import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Columns2, ListVideo, Music2, Scissors } from 'lucide-react';
import type { RemixMode } from '@/lib/editor/remixStudioHtml';
import { useAuth } from '@/contexts/AuthContext';
import { checkRemix, getRemixCounts, getRemixSettings, saveRemixSettings, type RemixPolicy } from '@/lib/remix-links';
import { duetsPath } from '@/lib/duet';

export interface RemixSource {
  videoUrl: string; sourceUrl: string; title: string; creator?: string;
  /** The post's token id and its creator, for the duet permission and count. */
  tokenId?: string; creatorAddress?: string;
}
const modes = [
  ['green-screen', 'Green screen', Camera], ['duet', 'Duet', Columns2],
  ['sound', 'Use this sound', Music2], ['cut', 'Cut this video', Scissors],
] as const;

export function RemixMenuItems({ source, onStart, isOwner = false }: { source: RemixSource; onStart: () => void; isOwner?: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  // Unknown until the menu opens; Duet shows meanwhile and the recorder re-checks.
  const [duetAllowed, setDuetAllowed] = useState(true);
  const [duets, setDuets] = useState(0);
  const [policy, setPolicy] = useState<RemixPolicy | ''>('');

  const load = () => {
    const tokenId = source.tokenId;
    if (!tokenId) return;
    void getRemixCounts([tokenId]).then(counts => setDuets(counts[tokenId]?.duets ?? 0)).catch(() => {});
    if (isOwner && source.creatorAddress) {
      void getRemixSettings(source.creatorAddress, tokenId)
        .then(({ settings }) => setPolicy(settings.duet.post ?? '')).catch(() => {});
    } else if (walletAddress) {
      void checkRemix(tokenId, 'duet').then(verdict => setDuetAllowed(verdict.allowed));
    } else if (source.creatorAddress) {
      void getRemixSettings(source.creatorAddress, tokenId)
        .then(({ settings }) => setDuetAllowed(settings.duet.effective !== 'nobody')).catch(() => {});
    }
  };

  const savePolicy = async (value: RemixPolicy | '') => {
    const previous = policy;
    setPolicy(value);
    try {
      await saveRemixSettings({ tokenId: source.tokenId, allowDuet: value || null });
    } catch (error) {
      setPolicy(previous);
      toast.error(error instanceof Error ? error.message : t('duet.saveFailed', { defaultValue: 'Could not save. Try again.' }));
    }
  };

  return <details className="rounded-xl border border-white/10" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) load(); }}>
    <summary className="cursor-pointer px-4 py-3 text-white">{t('videoRemix.menu', { defaultValue: 'Remix' })}</summary>
    {modes.filter(([mode]) => mode !== 'duet' || duetAllowed || isOwner).map(([mode, label, Icon]) => <button key={mode} type="button"
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white hover:bg-white/10"
      onClick={() => { onStart(); navigate('/creator/remix', { state: { ...source, mode: mode as RemixMode } }); }}>
      <Icon className="h-5 w-5" />{t(`videoRemix.${mode}`, { defaultValue: label })}
    </button>)}
    {source.tokenId && duets > 0 && <Link to={duetsPath(source.tokenId)} onClick={onStart}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white hover:bg-white/10">
      <ListVideo className="h-5 w-5" />{t('duet.count', { defaultValue: '{{count}} duets', count: duets })}
    </Link>}
    {isOwner && source.tokenId && <label className="flex w-full items-center justify-between gap-3 px-4 py-3 text-white">
      <span>{t('duet.allowLabel', { defaultValue: 'Allow duets' })}</span>
      <select value={policy} onChange={event => void savePolicy(event.target.value as RemixPolicy | '')}
        className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white">
        <option value="">{t('duet.policyDefault', { defaultValue: 'Account setting' })}</option>
        <option value="everyone">{t('duet.policyEveryone', { defaultValue: 'Everyone' })}</option>
        <option value="followers">{t('duet.policyFollowers', { defaultValue: 'Followers' })}</option>
        <option value="nobody">{t('duet.policyNobody', { defaultValue: 'No one' })}</option>
      </select>
    </label>}
  </details>;
}
