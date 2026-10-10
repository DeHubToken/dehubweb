import { useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { createDubTipClaim, foreignDubLanguage, replayFor } from '@/lib/dub-discovery';
import { getDubPreference } from './dub-preference';
import { SUBTITLE_LANGUAGES } from '@/lib/subtitle-languages';

const showTip = createDubTipClaim(async wallet => {
  const { data, error } = await withWalletHeader(supabase.rpc('claim_video_dub_tip'), wallet);
  return !error && data === true;
});

export function useDubDiscovery(videoRef: React.RefObject<HTMLVideoElement>, videoId: number,
  source: string, target: string | undefined, available: boolean, dubOn: boolean, openSettings: () => void) {
  const auth = useContext(AuthContext);
  const wallet = auth?.isAuthenticated ? auth.walletAddress?.toLowerCase() : null;
  const { t } = useTranslation();
  const eligible = !!wallet && !!videoId && available && !dubOn && foreignDubLanguage(source, target);
  const latest = useRef({ eligible, wallet, openSettings });
  latest.current = { eligible, wallet, openSettings };
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !eligible || !wallet) return;
    let active = true;
    const replay = replayFor(`${wallet}:${videoId}:${source}:${target}`);
    const audible = () => !video.paused && !video.muted && video.volume > 0 && !video.seeking && video.readyState >= 2;
    const current = () => active && latest.current.eligible && latest.current.wallet === wallet && !getDubPreference().on && audible();
    const sample = () => {
      if (!replay.sample(video.currentTime, video.duration, audible(), Date.now(), video.playbackRate)) return;
      void showTip(wallet, () => {
        const language = SUBTITLE_LANGUAGES.find(l => l.code === target)?.name ?? target;
        toast.info(t('stages.hearItIn', { language }), {
          duration: 8000,
          action: { label: t('dub.dubbed'), onClick: () => {
            if (active && latest.current.eligible && latest.current.wallet === wallet) latest.current.openSettings();
          } },
        });
      }, current);
    };
    const seek = () => replay.seek(video.currentTime);
    sample();
    const events = ['timeupdate', 'play', 'pause', 'volumechange', 'ended'] as const;
    events.forEach(event => video.addEventListener(event, sample));
    video.addEventListener('seeked', seek);
    return () => {
      active = false;
      events.forEach(event => video.removeEventListener(event, sample));
      video.removeEventListener('seeked', seek);
      replay.detach();
    };
  }, [videoRef, videoId, source, target, eligible, wallet, t]);
}
