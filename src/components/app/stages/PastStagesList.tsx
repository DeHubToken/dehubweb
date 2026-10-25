import { fetchStageRecordings, hasStageRecording } from '@/lib/stage-recordings';
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
import i18n from '@/i18n';
import { formatRelativeTime } from '@/i18n/date-locale';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PictureInPicture2, Clock, FileText } from "lucide-react";
import Users from "@/components/ui/cut-icons/communities";
import Trash2 from "@/components/ui/cut-icons/delete";

import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";
import MessageSquare from "@/components/ui/cut-icons/messages";

import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { deleteStageRecordings } from '@/lib/stage-recording-delete';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { BadgedName } from '@/components/app/BadgedName';
import { StageTranscriptDrawer } from '@/components/app/spaces/StageTranscriptDrawer';
import { StageRecordingLanguage } from './StageRecordingLanguage';
import { StageChat } from '@/components/app/spaces/StageChat';
import { StageRateButton } from '@/components/app/stages/StageRateButton';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
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
import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';
import type { AudioSpace } from '@/types/audio-spaces.types';
import { toast } from 'sonner';

function timeAgo(ended?: string | null): string {
  if (!ended) return '';
  return formatRelativeTime(ended, i18n.language, 'short');
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
  emptyTitle,
  emptyHint,
}: {
  spaces?: AudioSpace[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
} = {}) {
  const { t } = useTranslation();
  // Defaulted here rather than in the signature: a default parameter cannot
  // call the hook that translates it.
  const emptyTitleText = emptyTitle ?? t('stages.noRecordedStages');
  const emptyHintText = emptyHint ?? t('stages.noRecordedStagesHint');
  const { walletAddress } = useAuth();
  const { theme, themeChoice } = useAppTheme();
  const navigate = useNavigate();
  // Light/minimal are paper themes: white waveform bars would be invisible on
  // them, so ink the bars instead (text/surfaces are handled by class choice).
  const isPaper = (theme === 'light' || themeChoice === 'system-light') || theme === 'minimal';
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
    queryFn: () => fetchStageRecordings(),
    select: (stages: AudioSpace[]) => stages.filter(hasStageRecording),
    // 5 min like the app default — 30s meant most tab returns refetched.
    staleTime: 5 * 60_000,
  });

  const pastStages = (spaces ?? fetched).filter(hasStageRecording);
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
      if (!confirm(t('stages.deleteRecordingConfirm'))) return;
      if (playingStageId === space.id) stopStageRecording();
      if (walletAddress) {
        // Everything under the stage's folder, not only the object the URL
        // names. Finalising writes an indexed copy beside the original and
        // repoints the URL at it, so removing just that left the original
        // recording in a public bucket after the host was told it was gone.
        const { error } = await deleteStageRecordings(space.id, walletAddress);
        if (error) {
          // Stop here rather than deleting the row on top of files that are
          // still there — that would leave them with nothing pointing at them
          // and no way to find them again.
          toast.error(t('stages.deleteRecordingFailed', 'Could not delete the recording'));
          return;
        }
      }
      const { error: rowError } = await supabase
        .from('audio_spaces')
        .delete()
        .eq('id', space.id)
        .setHeader('x-wallet-address', (walletAddress || '').toLowerCase());
      if (rowError) {
        toast.error(t('stages.deleteStageFailed', 'Could not delete the stage'));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['past-stages'] });
      // The Hosting tab reads its own list, so it would keep showing a
      // recording that no longer exists.
      queryClient.invalidateQueries({ queryKey: myStagesKeys.all });
      toast.success(t('stages.stageDeleted'));
    },
    [playingStageId, walletAddress, queryClient, t],
  );

  // Skeleton rows while the first load is in flight — without this the list
  // flashed the "No recorded stages yet" empty state before data arrived.
  if (isLoadingStages) {
    return (
      <div className="space-y-2 sm:space-y-3">
        {[0, 1, 2].map((i) => (
          <div data-skeleton-group key={i} data-page-bento className="bg-zinc-900 rounded-2xl p-4 animate-pulse">
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
        <p className="text-white font-medium">{emptyTitleText}</p>
        <p className="text-zinc-500 text-sm mt-1">{emptyHintText}</p>
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

          const stagePath = space.short_id != null ? `/stages/${space.short_id}` : `/stage/${space.id}`;
          const openStage = () => navigate(stagePath);
          const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center transition-all';

          return (
            <div
              key={space.id}
              data-page-bento
              data-recorded-stage
              // The whole card opens the stage's own page. Anything that does
              // its own thing on press (play, the bar, host, speed, comments)
              // is left alone, so a scrub never turns into a page change.
              onClick={(e) => {
                const el = e.target as HTMLElement;
                if (el.closest('button, a, input, textarea, svg, [role="button"], [data-no-navigate]')) return;
                openStage();
              }}
              className="group/rec bg-zinc-900 rounded-2xl p-3 flex flex-col gap-3 cursor-pointer transition-colors hover:bg-zinc-800/70"
            >
              <div className="flex flex-col sm:flex-row gap-3 min-w-0">
                {/* The host's artwork, through the shared component so it is
                    the same 16:9 frame the live and upcoming cards show. Full
                    width on a phone, a fixed thumbnail beside the details on
                    wider screens. It sits beside the text, never beside the
                    bar: the bar used to share its row with the artwork and got
                    squeezed to a sliver nobody could drag. */}
                <StageCoverArt
                  src={space.cover_image_url}
                  title={space.title}
                  stage={space}
                  className="w-full sm:w-44 shrink-0 rounded-xl overflow-hidden self-start"
                />

                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <a
                      href={stagePath}
                      onClick={(e) => {
                        e.preventDefault();
                        openStage();
                      }}
                      className="flex-1 min-w-0 font-semibold text-white text-[15px] leading-snug line-clamp-2 hover:underline underline-offset-2"
                    >
                      {space.title}
                    </a>
                    {isOwnStage && (
                      <button
                        onClick={() => handleDelete(space)}
                        className={cn(iconBtn, '-mt-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10')}
                        title={t('stages.deleteStage')}
                        aria-label={t('stages.deleteStage')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
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
                        className="flex items-center gap-1.5 min-w-0 hover:text-white transition-colors cursor-pointer"
                      >
                        {avatar ? (
                          <img src={avatar} alt="" className="w-5 h-5 rounded-md object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <span className="w-5 h-5 rounded-md bg-zinc-700 flex items-center justify-center text-[9px] text-white font-medium">
                            {(space.host_username || 'A').charAt(0).toUpperCase()}
                          </span>
                        )}
                        <BadgedName lookupId={space.host_username || space.host_wallet_address}>
                          @{space.host_username || t('stages.anonymous')}
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

                  {/* Comments and transcript sit under the details on wide
                      screens, so the player row below is all bar. */}
                  <div className="hidden sm:flex items-center gap-1 mt-auto pt-1">
                    {space.recording_url && <StageRecordingLanguage space={space} className="max-w-44" />}
                    <button
                      onClick={() => setCommentsFor((id) => (id === space.id ? null : space.id))}
                      aria-expanded={commentsFor === space.id}
                      className={cn(
                        'h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs transition-all',
                        commentsFor === space.id
                          ? 'text-white bg-zinc-800/60'
                          : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60',
                      )}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('stages.comments')}
                    </button>
                    {space.recording_url && (
                      <button
                        onClick={() => setTranscriptStage(space)}
                        className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-all"
                      >
                        <FileText className="w-4 h-4" />
                        {t('stages.viewTranscript')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* The player: its own full-width line on every screen. */}
              <div
                data-no-navigate
                // A dark well on dark themes so the bars read even over a
                // textured card (Jungle's wood); a faint ink wash on paper.
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-1.5 pr-2',
                  isPaper ? 'bg-black/[0.03] border-black/[0.06]' : 'bg-black/35 border-white/[0.06]',
                )}
              >
                <button
                  type="button"
                  onClick={() => togglePlay(space)}
                  disabled={!space.recording_url}
                  className={cn(
                    'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all',
                    isLoaded
                      ? 'bg-zinc-700/60 text-white'
                      : space.recording_url
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-zinc-800/60 text-zinc-600',
                  )}
                  aria-label={isPlaying ? t('stages.pause') : t('stages.playRecording')}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5" fill="currentColor" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                  )}
                </button>

                {/* Seek starts playback or scrubs */}
                <div
                  className={cn(
                    'flex items-center gap-2 flex-1 min-w-[96px] h-10 transition-all duration-300',
                    isLoaded ? 'opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-90',
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
                          : 'rgba(255,255,255,0.7)'
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

                {/* Playback speed — persisted, shared with every other surface
                    that plays a recording. */}
                {space.recording_url && <StageRateButton />}
                {/* The corner player, on request: what you press when you are
                    about to leave this page and keep listening. */}
                {space.recording_url && (
                  <button
                    onClick={() => (isPoppedOut ? closeStagePopout() : popOutStageRecording(space))}
                    aria-pressed={isPoppedOut}
                    className={cn(
                      iconBtn,
                      isPoppedOut
                        ? 'text-white bg-zinc-800/60'
                        : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60',
                    )}
                    title={isPoppedOut ? t('stages.closeCornerPlayer') : t('stages.popOutPlayer')}
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Phones: comments and transcript under the player. */}
              <div className="flex sm:hidden items-center gap-1 -mt-1">
                {space.recording_url && <StageRecordingLanguage space={space} />}
                <button
                  onClick={() => setCommentsFor((id) => (id === space.id ? null : space.id))}
                  aria-expanded={commentsFor === space.id}
                  className={cn(
                    'h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs transition-all',
                    commentsFor === space.id
                      ? 'text-white bg-zinc-800/60'
                      : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60',
                  )}
                >
                  <MessageSquare className="w-4 h-4" />
                  {t('stages.comments')}
                </button>
                {space.recording_url && (
                  <button
                    onClick={() => setTranscriptStage(space)}
                    className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    {t('stages.viewTranscript')}
                  </button>
                )}
              </div>

              {/* The stage's chat, carried on past the stage. Mounted only
                  while open — each one holds a realtime subscription, and this
                  list can be long. */}
              {commentsFor === space.id && (
                <div data-no-navigate className="cursor-auto">
                  <StageChat space={space} className="w-full" listClassName="h-52" />
                </div>
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
