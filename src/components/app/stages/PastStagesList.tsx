/**
 * PastStagesList — recorded (ended) stages with inline playback
 * =============================================================
 * The "Recorded" tab of the dedicated /stages page. Lists ended stages that
 * have a recording, plays them inline with the same seekable StaticWaveform the
 * Stages modal uses, and opens the shared StageTranscriptDrawer.
 *
 * The playback logic mirrors AudioSpacesModal's past-stage player (webm files
 * often report duration=Infinity, so duration is derived from the
 * started_at/ended_at timestamps as a fallback) — kept self-contained here so
 * the page never has to open the modal to listen back.
 */

import { useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Users, Clock, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { StageTranscriptDrawer } from '@/components/app/spaces/StageTranscriptDrawer';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import type { AudioSpace } from '@/types/audio-spaces.types';
import { toast } from 'sonner';

function timeAgo(ended?: string | null): string {
  if (!ended) return '';
  const diff = Date.now() - new Date(ended).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function stageDuration(space: AudioSpace): string | null {
  if (!space.started_at || !space.ended_at) return null;
  const dur = Math.round(
    (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000,
  );
  const m = Math.floor(dur / 60);
  const s = dur % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function PastStagesList() {
  const { walletAddress } = useAuth();
  const { theme } = useAppTheme();
  const navigate = useNavigate();
  // Light/minimal are paper themes: white waveform bars would be invisible on
  // them, so ink the bars instead (text/surfaces are handled by class choice).
  const isPaper = theme === 'light' || theme === 'minimal';
  const queryClient = useQueryClient();

  const [playingStageId, setPlayingStageId] = useState<string | null>(null);
  const [playbackVolume, setPlaybackVolume] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTimeLeft, setPlaybackTimeLeft] = useState('');
  const [transcriptStage, setTranscriptStage] = useState<AudioSpace | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const pendingSeekRatioRef = useRef<number | null>(null);
  const estimatedDurationRef = useRef<number>(0);
  // The browser-reported duration once we've forced it to resolve (webm from
  // MediaRecorder reports Infinity until seeked). 0 = not yet known.
  const realDurationRef = useRef<number>(0);
  // True while we're seeking to the end to force duration resolution, so the
  // resulting `ended` event doesn't tear playback down before it starts.
  const forcingDurationRef = useRef(false);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: pastStages = [], isLoading: isLoadingStages } = useQuery({
    queryKey: ['past-stages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'ended')
        .order('ended_at', { ascending: false })
        .limit(20);
      return (data as AudioSpace[]) || [];
    },
    // 5 min like the app default — 30s meant most tab returns refetched.
    staleTime: 5 * 60_000,
  });

  const stopPlayback = useCallback(() => {
    if (endTimeoutRef.current !== null) {
      clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
    // Detach the WebAudio graph — a source/analyser pair is created per play
    // and would otherwise accumulate on the shared AudioContext forever.
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    pendingSeekRatioRef.current = null;
    realDurationRef.current = 0;
    forcingDurationRef.current = false;
    setPlayingStageId(null);
    setPlaybackVolume(0);
    setPlaybackProgress(0);
    setPlaybackTimeLeft('');
  }, []);

  // /stages lives in PersistentPageCache — stop recorded playback when the
  // user navigates away (there's no mini-player for recordings, so background
  // audio here would be unstoppable without returning to the page).
  const { pathname } = useLocation();
  const isStagesRouteActive = pathname === '/app/stages' || pathname === '/stages';
  useEffect(() => {
    if (!isStagesRouteActive && playingStageId) stopPlayback();
  }, [isStagesRouteActive, playingStageId, stopPlayback]);

  const startPlayback = useCallback(
    (space: AudioSpace) => {
      if (!space.recording_url) return;

      // webm recordings often report duration=Infinity — derive from timestamps.
      const estimatedDuration =
        space.started_at && space.ended_at
          ? Math.max(1, (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000)
          : 0;
      estimatedDurationRef.current = estimatedDuration;
      realDurationRef.current = 0;
      forcingDurationRef.current = false;

      if (endTimeoutRef.current !== null) {
        clearTimeout(endTimeoutRef.current);
        endTimeoutRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();

      const audio = new Audio(space.recording_url);
      audio.crossOrigin = 'anonymous';

      // webm/MediaRecorder blobs are unreliable about duration: some report
      // Infinity, others a bogus tiny finite value (the length of the first
      // cluster). Either way `progress = currentTime / duration` then races to
      // 100% and the whole waveform lights up white while audio keeps playing.
      // A finite duration is only trustworthy if it isn't wildly shorter than
      // the started_at/ended_at estimate. We deliberately do NOT use
      // audio.seekable.end() — for these recordings it reports only the buffered
      // range, which is another way progress raced ahead of the audio.
      const est = estimatedDurationRef.current;
      const durationLooksBogus = (d: number) =>
        !isFinite(d) || d <= 0 || (est > 5 && d < est * 0.5);

      // Duration priority: the forced/real browser duration once known, then the
      // live element duration if it's trustworthy, then the timestamp estimate.
      const resolveDuration = (): number => {
        if (realDurationRef.current > 0) return realDurationRef.current;
        const dur = audio.duration;
        if (!durationLooksBogus(dur)) return dur;
        return estimatedDurationRef.current;
      };

      const applyPendingSeek = () => {
        const ratio = pendingSeekRatioRef.current;
        if (ratio === null) return;
        const dur = resolveDuration();
        if (isFinite(dur) && dur > 0) {
          audio.currentTime = ratio * dur;
          pendingSeekRatioRef.current = null;
        }
      };

      // Seeking past the end forces the browser to compute the true duration,
      // which it then emits. Reset to the start (or the user's pending scrub
      // position) once it lands.
      const resolveRealDuration = () => {
        if (realDurationRef.current > 0) return;
        const dur = audio.duration;
        if (!durationLooksBogus(dur)) {
          realDurationRef.current = dur;
          applyPendingSeek();
          return;
        }
        // Force the browser to discover the real duration.
        const onForcedTimeUpdate = () => {
          audio.removeEventListener('timeupdate', onForcedTimeUpdate);
          if (isFinite(audio.duration) && audio.duration > 0) {
            realDurationRef.current = audio.duration;
          }
          const ratio = pendingSeekRatioRef.current;
          audio.currentTime =
            ratio !== null && realDurationRef.current > 0 ? ratio * realDurationRef.current : 0;
          pendingSeekRatioRef.current = null;
          forcingDurationRef.current = false;
        };
        forcingDurationRef.current = true;
        audio.addEventListener('timeupdate', onForcedTimeUpdate);
        try {
          audio.currentTime = 1e101;
        } catch {
          forcingDurationRef.current = false;
          audio.removeEventListener('timeupdate', onForcedTimeUpdate);
        }
      };
      audio.addEventListener('loadedmetadata', resolveRealDuration, { once: true });
      audio.addEventListener('durationchange', () => {
        if (realDurationRef.current === 0 && isFinite(audio.duration) && audio.duration > 0) {
          realDurationRef.current = audio.duration;
        }
      });

      audio.onended = () => {
        // Ignore the synthetic `ended` from the seek-to-end duration probe.
        if (forcingDurationRef.current) return;
        cancelAnimationFrame(rafRef.current);
        setPlaybackProgress(1);
        setPlaybackVolume(0);
        setPlaybackTimeLeft('-0:00');
        endTimeoutRef.current = setTimeout(() => {
          endTimeoutRef.current = null;
          if (audioRef.current === audio) audioRef.current = null;
          sourceRef.current?.disconnect();
          sourceRef.current = null;
          analyserRef.current?.disconnect();
          analyserRef.current = null;
          setPlayingStageId(null);
          setPlaybackProgress(0);
          setPlaybackTimeLeft('');
        }, 380);
      };

      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      void ctx.resume();
      // Previous play's graph must go before wiring a new one (see stopPlayback)
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;

      // The pump RAF stays at frame rate for smooth audio analysis, but state
      // writes are QUANTIZED (volume to 1/50ths at ~10Hz, progress to 0.1%)
      // so React bails on identical values — the unquantized version
      // re-rendered this whole 20-row list at 60fps for the entire playback.
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVolumeAt = 0;
      const pump = () => {
        const now = performance.now();
        if (now - lastVolumeAt >= 100) {
          lastVolumeAt = now;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          setPlaybackVolume(Math.round((sum / dataArray.length / 255) * 50) / 50);
        }

        // While the duration probe is seeking to the end, currentTime is bogus —
        // don't let it flash the waveform to 100%.
        const dur = resolveDuration();
        if (!forcingDurationRef.current && isFinite(dur) && dur > 0) {
          const t = audio.currentTime;
          setPlaybackProgress(Math.round(Math.min(1, Math.max(0, t / dur)) * 1000) / 1000);
          const remaining = Math.max(0, Math.ceil(dur - t));
          const m = Math.floor(remaining / 60);
          const s = remaining % 60;
          setPlaybackTimeLeft(`-${m}:${s.toString().padStart(2, '0')}`);
        }
        rafRef.current = requestAnimationFrame(pump);
      };

      audio
        .play()
        .then(() => {
          rafRef.current = requestAnimationFrame(pump);
        })
        .catch(() => {
          toast.error('Could not play recording');
          stopPlayback();
        });

      audioRef.current = audio;
      setPlayingStageId(space.id);
      setPlaybackProgress(0);
      supabase.rpc('increment_stage_listens', { p_space_id: space.id }).then(() => {});
    },
    [stopPlayback],
  );

  const togglePlay = useCallback(
    (space: AudioSpace) => {
      if (!space.recording_url) {
        toast.info('Recording not available for this stage');
        return;
      }
      if (playingStageId === space.id) {
        stopPlayback();
        return;
      }
      pendingSeekRatioRef.current = null;
      startPlayback(space);
    },
    [playingStageId, startPlayback, stopPlayback],
  );

  const seek = useCallback(
    (space: AudioSpace, position: number) => {
      if (!space.recording_url) return;
      const a = audioRef.current;
      if (playingStageId === space.id && a) {
        let dur = realDurationRef.current;
        if (!isFinite(dur) || dur <= 0) dur = a.duration;
        if (!isFinite(dur) || dur <= 0) dur = estimatedDurationRef.current;
        if (isFinite(dur) && dur > 0) {
          a.currentTime = position * dur;
          return;
        }
      }
      pendingSeekRatioRef.current = position;
      startPlayback(space);
    },
    [playingStageId, startPlayback],
  );

  // Open the host's profile — username-first, wallet-id fallback (mirrors CardHeader).
  const openHostProfile = useCallback(
    (space: AudioSpace) => {
      const cleanUsername = space.host_username?.replace('@', '');
      if (cleanUsername) {
        navigate(`/${cleanUsername}`);
      } else if (space.host_wallet_address) {
        navigate(`/app/profile?id=${space.host_wallet_address}`);
      }
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (space: AudioSpace) => {
      if (!confirm('Delete this stage recording?')) return;
      if (playingStageId === space.id) stopPlayback();
      if (space.recording_url) {
        const path = space.recording_url.split('/stage-recordings/')[1];
        if (path) {
          await supabase.storage.from('stage-recordings').remove([decodeURIComponent(path)]);
        }
      }
      await supabase
        .from('audio_spaces')
        .delete()
        .eq('id', space.id)
        .setHeader('x-wallet-address', (walletAddress || '').toLowerCase());
      queryClient.invalidateQueries({ queryKey: ['past-stages'] });
      toast.success('Stage deleted');
    },
    [playingStageId, stopPlayback, walletAddress, queryClient],
  );

  // Skeleton rows while the first load is in flight — without this the list
  // flashed the "No recorded stages yet" empty state before data arrived.
  if (isLoadingStages) {
    return (
      <div className="space-y-2 sm:space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} data-page-bento className="bg-zinc-900 rounded-2xl p-4 animate-pulse">
            <div className="h-4 w-2/3 bg-zinc-800 rounded mb-2" />
            <div className="h-3 w-1/3 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (pastStages.length === 0) {
    return (
      <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
        <img src={stagesMicIcon} alt="" className="w-12 h-12 mx-auto mb-3 opacity-50 object-contain" />
        <p className="text-white font-medium">No recorded stages yet</p>
        <p className="text-zinc-500 text-sm mt-1">Stages you host are recorded and show up here once they end.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:space-y-3">
        {pastStages.map((space) => {
          const isPlaying = playingStageId === space.id;
          const isOwnStage =
            !!walletAddress &&
            !!space.host_wallet_address &&
            walletAddress.toLowerCase() === space.host_wallet_address.toLowerCase();
          const avatar =
            buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
            buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
          const duration = stageDuration(space);

          return (
            <div
              key={space.id}
              data-page-bento
              className="bg-zinc-900 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex items-center gap-3 shrink-0 min-w-0 sm:max-w-[380px]">
                <button
                  type="button"
                  onClick={() => togglePlay(space)}
                  className={cn(
                    'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                    isPlaying
                      ? 'bg-zinc-700/60 text-white'
                      : space.recording_url
                        ? 'bg-zinc-800/60 hover:bg-zinc-700/60 text-white'
                        : 'bg-zinc-800/60 text-zinc-600',
                  )}
                  aria-label={isPlaying ? 'Stop' : 'Play recording'}
                >
                  {isPlaying ? (
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-white text-sm truncate">{space.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 whitespace-nowrap">
                    <ProfileHoverCard
                      creatorId={space.host_wallet_address || undefined}
                      creatorUsername={space.host_username || undefined}
                      displayName={space.host_username || undefined}
                      avatarUrl={avatar || undefined}
                    >
                      <button
                        type="button"
                        onClick={() => openHostProfile(space)}
                        onMouseDown={(e) => e.preventDefault()}
                        className="flex items-center gap-1 min-w-0 hover:text-white transition-colors cursor-pointer"
                      >
                        {avatar ? (
                          <img src={avatar} alt="" className="w-4 h-4 rounded-md object-cover" />
                        ) : (
                          <span className="w-4 h-4 rounded-md bg-zinc-700 flex items-center justify-center text-[8px] text-white font-medium">
                            {(space.host_username || 'A').charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">@{space.host_username || 'Anonymous'}</span>
                      </button>
                    </ProfileHoverCard>
                    {space.ended_at && <span>{timeAgo(space.ended_at)}</span>}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {Math.max(1, (space.speaker_count || 0) + (space.listener_count || 0))}
                    </span>
                    {duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {duration}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Waveform — seek starts playback or scrubs */}
              <div
                className={cn(
                  'flex items-center gap-2 flex-1 min-w-0 h-10 transition-all duration-300',
                  isPlaying ? 'opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-40',
                )}
              >
                <StaticWaveform
                  seed={space.id}
                  className="w-full min-w-0 h-full flex-1"
                  animated={isPlaying}
                  volumeLevel={isPlaying ? playbackVolume : 0}
                  color={
                    isPaper
                      ? isPlaying
                        ? 'rgba(0,0,0,0.9)'
                        : 'rgba(0,0,0,0.5)'
                      : isPlaying
                        ? 'rgba(255,255,255,0.95)'
                        : undefined
                  }
                  progress={isPlaying ? playbackProgress : undefined}
                  onSeek={space.recording_url ? (pos) => seek(space, pos) : undefined}
                />
                {isPlaying && playbackTimeLeft && (
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-10 text-right">
                    {playbackTimeLeft}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                {space.recording_url && (
                  <button
                    onClick={() => setTranscriptStage(space)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-all"
                    title="View transcript"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                )}
                {isOwnStage && (
                  <button
                    onClick={() => handleDelete(space)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete stage"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StageTranscriptDrawer
        space={transcriptStage}
        open={!!transcriptStage}
        onOpenChange={(o) => !o && setTranscriptStage(null)}
      />
    </>
  );
}

export default PastStagesList;
