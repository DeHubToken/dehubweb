import { useTranslation as _useCopy } from 'react-i18next';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken, getAuthToken } from '@/lib/api/dehub/core';
import { Button } from '@/components/ui/button';
import { shouldSendSupportProgress, supportedWatchDelta } from '@/lib/ads/support-watch';

interface SupportAd { supportSessionId: string; mediaUrl: string; headline: string; advertiser: string; creatorShareUsd: number }

export default function CreatorSupportAd({ postId, walletAddress }: { postId: string; walletAddress: string }) {
  const { t: _copy } = _useCopy();
  const [ad, setAd] = useState<SupportAd | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState(0);
  const [credited, setCredited] = useState(false);
  const progress = useRef({ media: 0, at: 0, played: 0, sent: 0, pending: false });
  const invoke = async (name: string, body: object) => {
    await ensureFreshToken();
    const token = getAuthToken();
    if (!token) throw new Error(_copy("copy.d42931f214e0", { defaultValue: "Sign in to support a creator." }));
    const { data, error } = await supabase.functions.invoke(name, {
      body, headers: { 'x-dehub-token': token, 'x-wallet-address': walletAddress.toLowerCase() },
    });
    if (error || data?.error) throw new Error(data?.error || _copy("copy.dad2b39d6702", { defaultValue: "Creator support is unavailable. Please retry." }));
    return data;
  };
  const start = async () => {
    setLoading(true); setMessage('');
    try {
      const data = await invoke('ads-serve', { supportPostId: postId, count: 1 });
      const next = data?.ads?.[0];
      if (!next?.supportSessionId || !next.mediaUrl) {
        setMessage(_copy("copy.d03f11ec43c6", { defaultValue: "No sponsor videos are available right now. You can still send a token tip." })); return;
      }
      progress.current = { media: 0, at: performance.now(), played: 0, sent: 0, pending: false };
      setWatched(0); setCredited(false); setAd(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : _copy("copy.73d724041fcd", { defaultValue: "Could not load an ad." })); }
    finally { setLoading(false); }
  };
  const tick = async (video: HTMLVideoElement) => {
    const p = progress.current;
    const now = performance.now();
    const elapsed = (now - p.at) / 1000;
    const delta = video.currentTime - p.media;
    p.media = video.currentTime; p.at = now;
    if (!ad || credited || video.paused || document.visibilityState !== 'visible') return;
    p.played = Math.min(60, p.played + supportedWatchDelta(delta, elapsed, !video.paused, document.visibilityState === 'visible'));
    if (!shouldSendSupportProgress(p.played, p.sent, p.pending)) return;
    p.pending = true; p.sent = p.played;
    try {
      const data = await invoke('ads-creator-support', { sessionId: ad.supportSessionId, playedSeconds: p.played });
      setWatched(Number(data.watchedSeconds || 0));
      if (data.credited) {
        video.pause(); setCredited(true);
        setMessage(_copy("copy.fd906176f232", { defaultValue: "${{value1}} added to the creator's ad revenue. token settlement is pending.", value1: Number(data.creatorShareUsd).toFixed(4) }));
      }
    } catch (error) { p.sent = Math.max(0, p.sent - 4); video.pause(); setMessage(error instanceof Error ? error.message : _copy("copy.a67ad8f41fb6", { defaultValue: "Could not record support." })); }
    finally { p.pending = false; }
  };
  return <div className="space-y-2 rounded-xl border border-white/10 p-3">
    <Button variant="glass" className="w-full" disabled={loading || (!!ad && !credited)} onClick={start}>
      {loading ? _copy("copy.ddb635c51e27", { defaultValue: "Finding a sponsor…" }) : _copy("copy.44a9502a6691", { defaultValue: "Watch an ad to support this creator" })}
    </Button>
    <p className="text-xs text-white/60">{_copy("copy.7ca71250e224", { defaultValue: "Watch 30 seconds. The sponsor funds the creator's revenue share; you pay nothing." })}</p>
    {ad && !credited ? <div className="space-y-2">
      <p className="text-sm text-white">{_copy("copy.7e56286c6784", { defaultValue: "Sponsored by {{value1}} · {{value2}}", value1: ad.advertiser, value2: ad.headline })}</p>
      <video src={ad.mediaUrl} autoPlay loop muted playsInline controls onTimeUpdate={e => void tick(e.currentTarget)} className="max-h-64 w-full rounded-lg" />
      <p className="text-xs text-white/70">{_copy("copy.c4c9efd11cb4", { defaultValue: "{{value1}} / 30 seconds verified · Creator share ${{value2}}", value1: Math.floor(watched), value2: ad.creatorShareUsd.toFixed(4) })}</p>
      <Button variant="glass" onClick={() => { setAd(null); setMessage(_copy("copy.bb3bdbc0b99f", { defaultValue: "Ad closed." })); }}>{_copy("copy.95193e92b3fb", { defaultValue: "Cancel ad" })}</Button>
    </div> : null}
    {message ? <p role="status" className="text-sm text-white/80">{message}</p> : null}
  </div>;
}
