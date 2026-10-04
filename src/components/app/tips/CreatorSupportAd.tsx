import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken, getAuthToken } from '@/lib/api/dehub/core';
import { Button } from '@/components/ui/button';
import { shouldSendSupportProgress, supportedWatchDelta } from '@/lib/ads/support-watch';

interface SupportAd { supportSessionId: string; mediaUrl: string; headline: string; advertiser: string; creatorShareUsd: number }

export default function CreatorSupportAd({ postId, walletAddress }: { postId: string; walletAddress: string }) {
  const [ad, setAd] = useState<SupportAd | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState(0);
  const [credited, setCredited] = useState(false);
  const progress = useRef({ media: 0, at: 0, played: 0, sent: 0, pending: false });
  const invoke = async (name: string, body: object) => {
    await ensureFreshToken();
    const token = getAuthToken();
    if (!token) throw new Error('Sign in to support a creator.');
    const { data, error } = await supabase.functions.invoke(name, {
      body, headers: { 'x-dehub-token': token, 'x-wallet-address': walletAddress.toLowerCase() },
    });
    if (error || data?.error) throw new Error(data?.error || 'Creator support is unavailable. Please retry.');
    return data;
  };
  const start = async () => {
    setLoading(true); setMessage('');
    try {
      const data = await invoke('ads-serve', { supportPostId: postId, count: 1 });
      const next = data?.ads?.[0];
      if (!next?.supportSessionId || !next.mediaUrl) {
        setMessage('No sponsor videos are available right now. You can still send a DHB tip.'); return;
      }
      progress.current = { media: 0, at: performance.now(), played: 0, sent: 0, pending: false };
      setWatched(0); setCredited(false); setAd(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load an ad.'); }
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
        setMessage(`$${Number(data.creatorShareUsd).toFixed(4)} added to the creator's ad revenue. DHB settlement is pending.`);
      }
    } catch (error) { p.sent = Math.max(0, p.sent - 4); video.pause(); setMessage(error instanceof Error ? error.message : 'Could not record support.'); }
    finally { p.pending = false; }
  };
  return <div className="space-y-2 rounded-xl border border-white/10 p-3">
    <Button variant="glass" className="w-full" disabled={loading || (!!ad && !credited)} onClick={start}>
      {loading ? 'Finding a sponsor…' : 'Watch an ad to support this creator'}
    </Button>
    <p className="text-xs text-white/60">Watch 30 seconds. The sponsor funds the creator's revenue share; you pay nothing.</p>
    {ad && !credited ? <div className="space-y-2">
      <p className="text-sm text-white">Sponsored by {ad.advertiser} · {ad.headline}</p>
      <video src={ad.mediaUrl} autoPlay loop muted playsInline controls onTimeUpdate={e => void tick(e.currentTarget)} className="max-h-64 w-full rounded-lg" />
      <p className="text-xs text-white/70">{Math.floor(watched)} / 30 seconds verified · Creator share ${ad.creatorShareUsd.toFixed(4)}</p>
      <Button variant="glass" onClick={() => { setAd(null); setMessage('Ad closed.'); }}>Cancel ad</Button>
    </div> : null}
    {message ? <p role="status" className="text-sm text-white/80">{message}</p> : null}
  </div>;
}
