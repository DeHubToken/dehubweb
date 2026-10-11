import { useTranslation as _useCopy } from 'react-i18next';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getUserScheduledStreams, getStreamKey, getStreamIngestUrl, type LiveStream } from '@/lib/api/dehub/livestream';
import type { LiveStreamHandoff } from '../types';
import { toast } from 'sonner';

export default function ScheduledLivestreams({ onStart }: { onStart: (stream: LiveStreamHandoff) => void }) {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const [starting, setStarting] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['composer-scheduled-streams', walletAddress],
    queryFn: () => getUserScheduledStreams(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 0,
    retry: false,
  });
  const streams = data?.result.filter(stream => String(stream.status).toLowerCase() === 'scheduled') || [];
  if (!streams.length) return null;

  const start = async (stream: LiveStream) => {
    if (starting) return;
    setStarting(stream.streamId);
    try {
      const [key, ingest] = await Promise.all([getStreamKey(stream.streamId), getStreamIngestUrl(stream.streamId)]);
      if (!key.result.streamKey || stream.tokenId == null) throw new Error('Stream credentials are unavailable');
      onStart({ tokenId: String(stream.tokenId), streamId: stream.streamId, streamKey: key.result.streamKey, ingestUrl: ingest.result.ingestUrl, playbackUrl: `https://dehub.io/app/post/${stream.tokenId}`, playbackId: stream.playbackId, provider: stream.provider });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the scheduled stream');
    } finally { setStarting(null); }
  };

  return (
    <div className="mx-4 mt-3 rounded-xl border border-white/15 p-3">
      <h3 className="mb-2 text-xs font-medium text-white/60">{_copy("copy.d7f76ca33486", { defaultValue: "Scheduled livestreams" })}</h3>
      {streams.map(stream => (
        <div key={stream.streamId} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0 text-xs text-white">
            <p className="truncate font-medium">{stream.title}</p>
            {stream.scheduledAt && <p className="mt-1 text-white/60">{new Date(stream.scheduledAt).toLocaleString()}</p>}
          </div>
          <button type="button" disabled={!!starting} onClick={() => void start(stream)} className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-xs text-white disabled:opacity-50">{starting === stream.streamId ? _copy("copy.c926c2c50e65", { defaultValue: "Opening…" }) : _copy("copy.9ff3a615582e", { defaultValue: "Start now" })}</button>
        </div>
      ))}
    </div>
  );
}
