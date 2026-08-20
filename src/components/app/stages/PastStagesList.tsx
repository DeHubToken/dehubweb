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

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Pause,
  PictureInPicture2,
  Users,
  Clock,
  FileText,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { BadgedName } from '@/components/app/BadgedName';
import { StageTranscriptDrawer } from '@/components/app/spaces/StageTranscriptDrawer';
import { StageChat } from '@/components/app/spaces/StageChat';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import {
  closeStagePopout,
  popOutStageRecording,
  seekStageRecording,
  stopStageRecording,
  toggleStageRecording,
  useStagePlayback,
} from '@/lib/stage-playback';
import { myStagesKeys } from '@/hooks/use-my-stages';
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

/**
 * @param spaces  Render this exact list instead of fetching the global feed —
 *                used by the Hosting tab, which shows only your own stages.
 *                Omit for the Recorded tab's behaviour.
 */
export function PastStagesList({
  spaces,
  isLoading: isLoadingProp,
  emptyTitle = 'No recorded stages yet',
  emptyHint = 'Stages you host are recorded and show up here once they end.',
}: {
  spaces?: AudioSpace[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
} = {}) {
  const { walletAddress } = useAuth();
  const { theme } = useAppTheme();
  const navigate = useNavigate();
  // Light/minimal are paper themes: white waveform bars would be invisible on
  // them, so ink the bars instead (text/surfaces are handled by class choice).
  const isPaper = theme === 'light' || theme === 'minimal';
  const queryClient = useQueryClient();

  const [transcriptStage, setTranscriptStage] = useState<AudioSpace | null>(null);
  /** Which recording has its comments open. One at a time: each open panel
   *  holds a realtime subscription, and this list can run to 20 rows. */
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  // Playback belongs to lib/stage-playback now, shared with the "Listen back"
  // chip in the feed and the Stages modal. This list used to own a full copy
  // of it — element, WebAudio graph, RAF pump and the whole webm-duration
  // dance — which is why it was the only surface with a working scrub bar.
  const {
    spaceId: playingStageId,
    paused: playbackPaused,
    popout: playbackPopout,
    volume: playbackVolume,
    progress: playbackProgress,
    timeLeft: playbackTimeLeft,
  } = useStagePlayback();

  // Caller-supplied lists switch the fetch off entirely rather than fetching
  // and discarding: `enabled` keeps the global query from running at all on
  // the Hosting tab.
  const { data: fetched = [], isLoading: isFetching } = useQuery({
    enabled: !spaces,
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

  const pastStages = spaces ?? fetched;
  const isLoadingStages = spaces ? !!isLoadingProp : isFetching;

  // Playback used to stop when you navigated away from /stages, because there
  // was no mini-player for recordings and background audio would have been
  // unstoppable. StageRecordingMiniPlayer is that player, so it no longer does.
  const togglePlay = useCallback((space: AudioSpace) => {
    toggleStageRecording(space);
  }, []);

  const seek = useCallback((space: AudioSpace, position: number) => {
    seekStageRecording(space, position);
  }, []);

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
      if (playingStageId === space.id) stopStageRecording();
      if (space.recording_url && walletAddress) {
        const path = space.recording_url.split('/stage-recordings/')[1];
        if (path) {
          // Through a wallet-scoped client: the bucket's DELETE policy now
          // checks who owns the stage, and the Storage API has no per-call
          // header to carry that on the shared one.
          await walletScopedClient(walletAddress)
            .storage.from('stage-recordings')
            .remove([decodeURIComponent(path)]);
        }
      }
      await supabase
        .from('audio_spaces')
        .delete()
        .eq('id', space.id)
        .setHeader('x-wallet-address', (walletAddress || '').toLowerCase());
      queryClient.invalidateQueries({ queryKey: ['past-stages'] });
      // The Hosting tab reads its own list, so it would keep showing a
      // recording that no longer exists.
      queryClient.invalidateQueries({ queryKey: myStagesKeys.all });
      toast.success('Stage deleted');
    },
    [playingStageId, walletAddress, queryClient],
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
        <BrandIcon src={stagesMicIcon} alt="" className="w-12 h-12 mx-auto mb-3 opacity-50 object-contain" />
        <p className="text-white font-medium">{emptyTitle}</p>
        <p className="text-zinc-500 text-sm mt-1">{emptyHint}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:space-y-3">
        {pastStages.map((space) => {
          // Loaded and playing are different states now: a paused recording
          // keeps its place on the bar and its lit control, it just stops
          // moving. Everything visual keys off loaded, motion off playing.
          const isLoaded = playingStageId === space.id;
          const isPlaying = isLoaded && !playbackPaused;
          const isPoppedOut = isLoaded && playbackPopout;
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
              className="bg-zinc-900 rounded-2xl p-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3"
            >
              <div className="flex items-center gap-3 shrink-0 min-w-0 sm:max-w-[380px]">
                <button
                  type="button"
                  onClick={() => togglePlay(space)}
                  className={cn(
                    'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                    isLoaded
                      ? 'bg-zinc-700/60 text-white'
                      : space.recording_url
                        ? 'bg-zinc-800/60 hover:bg-zinc-700/60 text-white'
                        : 'bg-zinc-800/60 text-zinc-600',
                  )}
                  aria-label={isPlaying ? 'Pause' : 'Play recording'}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5" fill="currentColor" />
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
                        <BadgedName lookupId={space.host_username || space.host_wallet_address}>
                          @{space.host_username || 'Anonymous'}
                        </BadgedName>
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
                  isLoaded ? 'opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-40',
                )}
              >
                <StaticWaveform
                  seed={space.id}
                  className="w-full min-w-0 h-full flex-1"
                  animated={isPlaying}
                  volumeLevel={isPlaying ? playbackVolume : 0}
                  color={
                    isPaper
                      ? isLoaded
                        ? 'rgba(0,0,0,0.9)'
                        : 'rgba(0,0,0,0.5)'
                      : isLoaded
                        ? 'rgba(255,255,255,0.95)'
                        : undefined
                  }
                  progress={isLoaded ? playbackProgress : undefined}
                  onSeek={space.recording_url ? (pos) => seek(space, pos) : undefined}
                />
                {isLoaded && playbackTimeLeft && (
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-10 text-right">
                    {playbackTimeLeft}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                {/* The corner player, on request. It used to arrive by itself
                    the moment anything played; popping out is what you press
                    when you are about to leave this page and keep listening. */}
                {space.recording_url && (
                  <button
                    onClick={() => (isPoppedOut ? closeStagePopout() : popOutStageRecording(space))}
                    aria-pressed={isPoppedOut}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                      isPoppedOut
                        ? 'text-white bg-zinc-800/60'
                        : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60',
                    )}
                    title={isPoppedOut ? 'Close the corner player' : 'Pop out the player'}
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setCommentsFor((id) => (id === space.id ? null : space.id))}
                  aria-expanded={commentsFor === space.id}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                    commentsFor === space.id
                      ? 'text-white bg-zinc-800/60'
                      : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60',
                  )}
                  title="Comments"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
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

              {/* The stage's chat, carried on past the stage. Anything said
                  while it was live is already in here, so opening this reads
                  as the room's conversation rather than an empty comment box
                  bolted onto a recording. Mounted only while open — each one
                  holds a realtime subscription, and this list can be long. */}
              {commentsFor === space.id && (
                <StageChat space={space} className="basis-full w-full" listClassName="h-52" />
              )}
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
