/**
 * AudioSpacesModal - Twitter Spaces-like audio rooms (Stages)
 *
 * Uses StageContext so stage persists while browsing the app.
 * Features:
 * - Create / browse / join stages
 * - Invite links
 * - Add speakers directly
 * - Reactions & Soundboard
 * - Minimize to floating StageMiniPlayer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mic, MicOff, Users, Hand, X, ChevronLeft,
  Loader2, Volume2,
  Link, UserPlus, Minimize2, Play, Square, Clock, Trash2, FileText,
} from 'lucide-react';
import { StageTranscriptDrawer } from './StageTranscriptDrawer';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { StageSoundboard } from './StageSoundboard';
import { StageTTS } from './StageTTS';
import { VoiceEffectSelector } from '@/components/app/stages/VoiceEffectSelector';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { LiveWaveform } from '@/components/app/audio/LiveWaveform';
import { StageReactions, type AvatarReactions } from './StageReactions';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace, SpaceParticipant, RaiseHandRequest } from '@/types/audio-spaces.types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

type View = 'browse' | 'create' | 'live';

export function AudioSpacesModal() {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const {
    liveSpaces,
    currentSpace,
    participants,
    handRequests,
    isLoading,
    isMuted,
    myRole,
    hasRaisedHand,
    isModalOpen,
    openModal,
    closeModal,
    initialModalView,
    createSpace,
    joinSpace,
    leaveSpace,
    endSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker,
    inviteSpeaker,
    volumeLevel,
    voiceEffect,
    setVoiceEffect,
  } = useStage();

  const [view, setView] = useState<View>(initialModalView);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarReactions, setAvatarReactions] = useState<AvatarReactions>({});
  const [playingStageId, setPlayingStageId] = useState<string | null>(null);
  const [playingStageTitle, setPlayingStageTitle] = useState('');
  const [playbackVolume, setPlaybackVolume] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTimeLeft, setPlaybackTimeLeft] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  /** 0–1 seek applied on next `loadedmetadata` when starting playback */
  const pendingSeekRatioRef = useRef<number | null>(null);
  const estimatedDurationRef = useRef<number>(0);
  /** Remove `durationchange` etc. from the active past-stage `<audio>` */
  const pastStageUnsubRef = useRef<(() => void) | null>(null);
  /** `onended` delayed reset so the waveform can show 100% briefly */
  const pastStageEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transcriptStage, setTranscriptStage] = useState<AudioSpace | null>(null);

  // Fetch past (ended) stages for browse view
  const { data: pastStages = [] } = useQuery({
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
    enabled: isModalOpen && !currentSpace,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isModalOpen) {
      if (currentSpace) {
        setView('live');
      } else {
        setView(initialModalView);
      }
    }
  }, [isModalOpen, initialModalView, currentSpace]);

  useEffect(() => {
    if (currentSpace && isModalOpen) {
      setView('live');
    }
  }, [currentSpace, isModalOpen]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleMinimize = () => {
    closeModal();
  };

  const handleClose = () => {
    if (currentSpace) {
      closeModal();
    } else {
      setView('browse');
      closeModal();
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    const space = await createSpace(title.trim(), description.trim() || undefined);
    if (space) {
      setTitle('');
      setDescription('');
    }
  };

  const handleJoin = async (spaceId: string) => {
    await joinSpace(spaceId);
    // Increment listen count
    supabase.rpc('increment_stage_listens', { p_space_id: spaceId }).then(() => {});
  };

  const handleEndOrLeave = () => {
    if (myRole === 'host') {
      if (window.confirm('End this stage for everyone?')) {
        endSpace();
        setView('browse');
      }
    } else {
      leaveSpace();
      setView('browse');
    }
  };

  const handleCopyInviteLink = () => {
    if (!currentSpace) return;
    const url = `${window.location.origin}/stage/${currentSpace.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Invite link copied!');
    }).catch(() => {
      toast.info(`Share this link: ${url}`);
    });
  };

  const stopPastStagePlayback = useCallback(() => {
    if (pastStageEndTimeoutRef.current !== null) {
      clearTimeout(pastStageEndTimeoutRef.current);
      pastStageEndTimeoutRef.current = null;
    }
    pastStageUnsubRef.current?.();
    pastStageUnsubRef.current = null;
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
    analyserRef.current = null;
    pendingSeekRatioRef.current = null;
    setPlayingStageId(null);
    setPlayingStageTitle('');
    setPlaybackVolume(0);
    setPlaybackProgress(0);
    setPlaybackTimeLeft('');
  }, []);

  const startPastStagePlayback = useCallback((space: AudioSpace) => {
    if (!space.recording_url) return;

    // webm recordings often have duration=Infinity — pre-calculate from timestamps as fallback
    const estimatedDuration =
      space.started_at && space.ended_at
        ? Math.max(1, (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000)
        : 0;
    estimatedDurationRef.current = estimatedDuration;

    if (pastStageEndTimeoutRef.current !== null) {
      clearTimeout(pastStageEndTimeoutRef.current);
      pastStageEndTimeoutRef.current = null;
    }
    pastStageUnsubRef.current?.();
    pastStageUnsubRef.current = null;

    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();

    const audio = new Audio(space.recording_url);
    audio.crossOrigin = 'anonymous';

    const applyPendingSeek = () => {
      const ratio = pendingSeekRatioRef.current;
      if (ratio === null) return;
      let dur = audio.duration;
      if (!isFinite(dur) || dur <= 0) {
        try {
          if (audio.seekable && audio.seekable.length > 0) {
            dur = audio.seekable.end(audio.seekable.length - 1);
          }
        } catch {
          /* ignore */
        }
      }
      if (isFinite(dur) && dur > 0) {
        audio.currentTime = ratio * dur;
        pendingSeekRatioRef.current = null;
      }
    };

    audio.addEventListener('loadedmetadata', applyPendingSeek, { once: true });
    audio.addEventListener('canplay', applyPendingSeek, { once: true });

    /** When browser finally knows duration (common for remote recordings) */
    const onDurationChange = () => {
      applyPendingSeek();
      let dur = audio.duration;
      if (!isFinite(dur) || dur <= 0) {
        try {
          if (audio.seekable && audio.seekable.length > 0) {
            dur = audio.seekable.end(audio.seekable.length - 1);
          }
        } catch {
          /* ignore */
        }
      }
      if (isFinite(dur) && dur > 0) {
        setPlaybackProgress(Math.min(1, Math.max(0, audio.currentTime / dur)));
      }
    };
    audio.addEventListener('durationchange', onDurationChange);
    pastStageUnsubRef.current = () => {
      audio.removeEventListener('durationchange', onDurationChange);
    };

    audio.onended = () => {
      cancelAnimationFrame(rafRef.current);
      setPlaybackProgress(1);
      setPlaybackVolume(0);
      setPlaybackTimeLeft('-0:00');
      pastStageEndTimeoutRef.current = setTimeout(() => {
        pastStageEndTimeoutRef.current = null;
        pastStageUnsubRef.current?.();
        pastStageUnsubRef.current = null;
        audio.pause();
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        analyserRef.current = null;
        setPlayingStageId(null);
        setPlayingStageTitle('');
        setPlaybackProgress(0);
        setPlaybackTimeLeft('');
      }, 380);
    };

    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;
    void ctx.resume();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const pump = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setPlaybackVolume(sum / dataArray.length / 255);

      let dur = audio.duration;
      if (!isFinite(dur) || dur <= 0) {
        try {
          if (audio.seekable && audio.seekable.length > 0) {
            dur = audio.seekable.end(audio.seekable.length - 1);
          }
        } catch {
          /* ignore */
        }
      }
      // Last resort: use timestamp-derived duration (webm duration is often Infinity)
      if (!isFinite(dur) || dur <= 0) {
        dur = estimatedDuration;
      }
      if (isFinite(dur) && dur > 0) {
        const t = audio.currentTime;
        const prog = Math.min(1, Math.max(0, t / dur));
        setPlaybackProgress(prog);
        const remaining = Math.max(0, Math.ceil(dur - t));
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setPlaybackTimeLeft(`-${m}:${s.toString().padStart(2, '0')}`);
      }
      rafRef.current = requestAnimationFrame(pump);
    };

    audio.play().then(() => {
      rafRef.current = requestAnimationFrame(pump);
    }).catch(() => {
      toast.error('Could not play recording');
      stopPastStagePlayback();
    });

    audioRef.current = audio;
    setPlayingStageId(space.id);
    setPlayingStageTitle(space.title);
    setPlaybackProgress(0);
    supabase.rpc('increment_stage_listens', { p_space_id: space.id }).then(() => {});
  }, [stopPastStagePlayback]);

  const seekPastStage = useCallback(
    (space: AudioSpace, position: number) => {
      if (!space.recording_url) return;
      const a = audioRef.current;
      if (playingStageId === space.id && a) {
        let dur = a.duration;
        if (!isFinite(dur) || dur <= 0) {
          try {
            if (a.seekable && a.seekable.length > 0) {
              dur = a.seekable.end(a.seekable.length - 1);
            }
          } catch {
            /* ignore */
          }
        }
        if (!isFinite(dur) || dur <= 0) {
          dur = estimatedDurationRef.current;
        }
        if (isFinite(dur) && dur > 0) {
          a.currentTime = position * dur;
          return;
        }
      }
      pendingSeekRatioRef.current = position;
      startPastStagePlayback(space);
    },
    [playingStageId, startPastStagePlayback],
  );

  const togglePastStagePlay = useCallback(
    (space: AudioSpace) => {
      if (!space.recording_url) {
        toast.info('Recording not available for this stage');
        return;
      }
      if (playingStageId === space.id) {
        stopPastStagePlayback();
        return;
      }
      pendingSeekRatioRef.current = null;
      startPastStagePlayback(space);
    },
    [playingStageId, startPastStagePlayback, stopPastStagePlayback],
  );

  // ─── Derived ──────────────────────────────────────────────────────────────

  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter(p => p.role === 'listener');

  return (
    <>
    <Drawer open={isModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-white/10 max-h-[90vh] flex flex-col [&>div:first-child]:hidden">
        {!currentSpace ? (
          <DrawerHeader className="border-b-0 p-3 pb-1">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-white flex items-center gap-2">
                <>
                  <img src={stagesMicIcon} alt="" className="w-7 h-7 object-contain" />
                  Stages
                </>
              </DrawerTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-xl text-white hover:bg-white/10">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </DrawerHeader>
        ) : (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyInviteLink}
              className="rounded-xl text-white/60 hover:text-white hover:bg-white/10"
              title="Share invite link"
            >
              <Link className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMinimize}
              className="rounded-xl text-white/60 hover:text-white hover:bg-white/10"
              title="Minimize — stage keeps running"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-xl text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        <div className={cn("flex-1 overflow-y-auto p-4", currentSpace && "pt-2")}>

          {/* ── Browse View ─────────────────────────────────────────────── */}
           {view === 'browse' && !currentSpace && (
            <div className="space-y-4">
              <div className="space-y-2">
                {liveSpaces.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    <img src={stagesMicIcon} alt="" className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-white">No stages</p>
                    <p className="text-sm text-white/50">Be the first to start one!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveSpaces.map((space) => (
                      <StageCard
                        key={space.id}
                        space={space}
                        onJoin={() => handleJoin(space.id)}
                        isLoading={isLoading}
                      />
                    ))}
                  </div>
                )}
              </div>

              {isAuthenticated && (
                <LiquidGlassBubble2
                  label="Start Stage"
                  icon={<Mic className="w-4 h-4" />}
                  onClick={() => setView('create')}
                  width="100%"
                  height="42px"
                />
              )}

              {/* Past Stages */}
              {pastStages.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-white/60">Past Stages</h3>
                  <div className="space-y-2">
                    {pastStages.map((space) => (
                      <div
                        key={space.id}
                        className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <div className="flex items-center gap-3 shrink-0 min-w-0 sm:max-w-[380px]">
                          <button
                            type="button"
                            onClick={() => togglePastStagePlay(space)}
                            className={cn(
                              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                              playingStageId === space.id
                                ? "bg-white/20 text-white"
                                : space.recording_url
                                  ? "bg-white/10 hover:bg-white/20 text-white"
                                  : "bg-white/5 text-white/20"
                            )}
                          >
                            {playingStageId === space.id ? (
                              <Square className="w-3.5 h-3.5" fill="currentColor" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white text-sm truncate">{space.title}</h4>
                            <div className="flex items-center gap-3 mt-1 text-xs text-white/40 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                {(() => {
                                  const avatar = buildAvatarUrl(space.host_wallet_address || '', space.host_avatar)
                                    || buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
                                  return avatar ? (
                                    <img src={avatar} alt="" className="w-4 h-4 rounded-md object-cover" />
                                  ) : (
                                    <span className="w-4 h-4 rounded-md bg-zinc-700 flex items-center justify-center text-[8px] text-white font-medium">
                                      {(space.host_username || 'A').charAt(0).toUpperCase()}
                                    </span>
                                  );
                                })()}
                                @{space.host_username || 'Anonymous'}
                              </span>
                              {space.ended_at && (
                                <span>
                                  {(() => {
                                    const diff = Date.now() - new Date(space.ended_at).getTime();
                                    const mins = Math.floor(diff / 60000);
                                    const hrs = Math.floor(mins / 60);
                                    const days = Math.floor(hrs / 24);
                                    if (days > 0) return `${days}d ago`;
                                    if (hrs > 0) return `${hrs}h ago`;
                                    if (mins > 0) return `${mins}m ago`;
                                    return 'just now';
                                  })()}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {Math.max(1, (space.speaker_count || 0) + (space.listener_count || 0))}
                              </span>
                              {space.started_at && space.ended_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {(() => {
                                    const dur = Math.round((new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000);
                                    const m = Math.floor(dur / 60);
                                    const s = dur % 60;
                                    return m > 0 ? `${m}m ${s}s` : `${s}s`;
                                  })()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Waveform — full width; seek starts playback or scrubs */}
                        <div className={cn(
                          "hidden sm:flex items-center gap-2 flex-1 min-w-0 h-10 transition-all duration-300",
                          playingStageId === space.id ? "opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "opacity-40"
                        )}>
                          <StaticWaveform
                            seed={space.id}
                            className="w-full min-w-0 h-full flex-1"
                            animated={playingStageId === space.id}
                            volumeLevel={playingStageId === space.id ? playbackVolume : 0}
                            color={playingStageId === space.id ? 'rgba(255,255,255,0.95)' : undefined}
                            progress={playingStageId === space.id ? playbackProgress : undefined}
                            onSeek={space.recording_url ? (pos) => seekPastStage(space, pos) : undefined}
                          />
                          {playingStageId === space.id && playbackTimeLeft && (
                            <span className="text-[10px] text-white/50 font-mono shrink-0 w-10 text-right">{playbackTimeLeft}</span>
                          )}
                        </div>
                        <div className={cn(
                          "sm:hidden w-full min-w-0 transition-all duration-300",
                          playingStageId === space.id ? "opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "opacity-40"
                        )}>
                          <div className="h-12 w-full min-w-0">
                            <StaticWaveform
                              seed={space.id}
                              className="w-full h-full min-w-0"
                              animated={playingStageId === space.id}
                              volumeLevel={playingStageId === space.id ? playbackVolume : 0}
                              color={playingStageId === space.id ? 'rgba(255,255,255,0.95)' : undefined}
                              progress={playingStageId === space.id ? playbackProgress : undefined}
                              onSeek={space.recording_url ? (pos) => seekPastStage(space, pos) : undefined}
                            />
                          </div>
                          {playingStageId === space.id && playbackTimeLeft && (
                            <span className="block text-[10px] text-white/50 font-mono text-right mt-0.5">{playbackTimeLeft}</span>
                          )}
                        </div>
                        {/* Delete button — only for the host */}
                        {walletAddress && space.host_wallet_address &&
                          walletAddress.toLowerCase() === space.host_wallet_address.toLowerCase() && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm('Delete this stage recording?')) return;
                              if (playingStageId === space.id) {
                                stopPastStagePlayback();
                              }
                              if (space.recording_url) {
                                const path = space.recording_url.split('/stage-recordings/')[1];
                                if (path) {
                                  await supabase.storage.from('stage-recordings').remove([decodeURIComponent(path)]);
                                }
                              }
                              await supabase.from('audio_spaces').delete().eq('id', space.id)
                                .setHeader('x-wallet-address', (walletAddress || '').toLowerCase());
                              queryClient.invalidateQueries({ queryKey: ['past-stages'] });
                              toast.success('Stage deleted');
                            }}
                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Delete stage"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Create View ─────────────────────────────────────────────── */}
          {view === 'create' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/60">Stage Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's this stage about?"
                  className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/60">Description (optional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add more details..."
                  className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl resize-none"
                  rows={3}
                  maxLength={280}
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={!title.trim() || isLoading}
                className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl"
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mic className="w-4 h-4 mr-2" />}
                Go Live
              </Button>

              <Button
                variant="ghost"
                onClick={() => setView('browse')}
                className="w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          )}

          {/* ── Live View ───────────────────────────────────────────────── */}
          {(view === 'live' || currentSpace) && currentSpace && (
            <div className="space-y-4 pb-4 relative">

              {/* Stage Info - top left */}
              <div className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-xs font-medium text-white">LIVE</span>
                  <h2 className="text-lg font-semibold text-white">{currentSpace.title}</h2>
                </div>
                {currentSpace.description && (
                  <p className="text-sm text-white/60 ml-4">{currentSpace.description}</p>
                )}
              </div>

              {/* Live Waveform Visualizer */}
              <div className="w-full h-24 sm:h-32 rounded-xl bg-white/5 border border-white/10 overflow-hidden p-2">
                <LiveWaveform active={true} barCount={80} volumeLevel={volumeLevel} />
              </div>

              {/* Speakers Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Speakers ({speakers.length})
                </h3>
                <div className="flex flex-wrap gap-3">
                  {speakers.map((speaker) => (
                    <ParticipantAvatar
                      key={speaker.id}
                      participant={speaker}
                      isHost={speaker.role === 'host'}
                      canRemove={myRole === 'host' && speaker.role === 'speaker'}
                      onRemove={() => removeSpeaker(speaker.wallet_address)}
                      reactionEmoji={avatarReactions[speaker.wallet_address]}
                    />
                  ))}
                </div>
              </div>

              {/* Hand Requests (Host only) */}
              {myRole === 'host' && handRequests.length > 0 && (
                <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Hand className="w-4 h-4" />
                    Requests to Speak ({handRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {handRequests.map((request) => (
                      <HandRequestItem
                        key={request.id}
                        request={request}
                        onApprove={() => approveSpeaker(request.wallet_address)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Listeners Section */}
              {listeners.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Listeners ({listeners.length})
                    {myRole === 'host' && (
                      <span className="text-[10px] text-white/30 ml-1">(tap + to invite as speaker)</span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {listeners.slice(0, 20).map((listener) => (
                      <ListenerItem
                        key={listener.id}
                        participant={listener}
                        canInvite={myRole === 'host'}
                        onInvite={() => inviteSpeaker(listener.wallet_address)}
                        reactionEmoji={avatarReactions[listener.wallet_address]}
                      />
                    ))}
                    {listeners.length > 20 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                          +{listeners.length - 20}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Voice Effect Selector (speakers only) */}
              {(myRole === 'host' || myRole === 'speaker') && (
                <VoiceEffectSelector activeEffect={voiceEffect} onSelect={setVoiceEffect} />
              )}

              {/* Soundboard — always visible for hosts */}
              {myRole === 'host' && (
                <StageSoundboard
                  isVisible={true}
                  onClose={() => {}}
                />
              )}

              {/* Text-to-Speech — hosts and speakers */}
              {(myRole === 'host' || myRole === 'speaker') && (
                <StageTTS />
              )}

              {/* Reactions bento card */}
              <StageReactions
                spaceId={currentSpace.id}
                onAvatarReaction={setAvatarReactions}
              />
            </div>
          )}
        </div>

        {/* Anchored Controls Bar — outside ScrollArea */}
        {currentSpace && (
          <div className="shrink-0 p-3 bg-black/60 backdrop-blur-[24px] border-t border-white/10">
            <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
              {/* Mute Button (speakers only) */}
              {(myRole === 'host' || myRole === 'speaker') && (
                <Button
                  onClick={toggleMute}
                  size="lg"
                  className={cn(
                    "rounded-xl w-12 h-12",
                    isMuted
                      ? "bg-red-500/80 hover:bg-red-500 text-white"
                      : "bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 text-white",
                  )}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
              )}

              {/* Raise/Lower Hand (listeners only) */}
              {myRole === 'listener' && (
                <Button
                  onClick={hasRaisedHand ? lowerHand : raiseHand}
                  size="lg"
                  className={cn(
                    "rounded-xl w-12 h-12",
                    hasRaisedHand
                      ? "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400"
                      : "bg-white/10 hover:bg-white/20 text-white",
                  )}
                >
                  <Hand className="w-5 h-5" />
                </Button>
              )}

              {/* Minimize */}
              <Button
                onClick={handleMinimize}
                size="lg"
                variant="outline"
                className="rounded-xl border-white/10 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white w-12 h-12"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>

              {/* Leave/End Button */}
              <Button
                onClick={handleEndOrLeave}
                size="lg"
                className="rounded-xl bg-red-500/80 hover:bg-red-500 w-12 h-12 text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>

      {/* Floating mini player for past stage recordings */}
      {playingStageId && !isModalOpen && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm bg-black/80 backdrop-blur-xl border border-white/15 rounded-2xl p-3 shadow-2xl"
          onClick={() => openModal('browse')}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stopPastStagePlayback();
              }}
              className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
            >
              <Square className="w-3.5 h-3.5" fill="currentColor" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{playingStageTitle || 'Past Stage'}</p>
              <div className="h-10 mt-0.5">
                <StaticWaveform
                  seed={playingStageId}
                  className="w-full h-full"
                  animated
                  volumeLevel={playbackVolume}
                  color="rgba(255,255,255,0.9)"
                  progress={playbackProgress}
                  onSeek={(pos) => {
                    const audio = audioRef.current;
                    if (!audio) return;
                    let dur = audio.duration;
                    if (!isFinite(dur) || dur <= 0) {
                      try {
                        if (audio.seekable && audio.seekable.length > 0) {
                          dur = audio.seekable.end(audio.seekable.length - 1);
                        }
                      } catch { /* ignore */ }
                    }
                    if (isFinite(dur) && dur > 0) {
                      audio.currentTime = pos * dur;
                    }
                  }}
                />
              </div>
            </div>
            {playbackTimeLeft && (
              <span className="text-[10px] text-white/50 font-mono shrink-0">{playbackTimeLeft}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageCard({
  space,
  onJoin,
  isLoading,
}: {
  space: AudioSpace;
  onJoin: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={onJoin}
      disabled={isLoading}
      className="w-full text-left p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors cursor-pointer disabled:opacity-50"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-xs text-white font-medium">LIVE</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-white/50" />}
      </div>
      <h4 className="font-medium text-white truncate">{space.title}</h4>
      {space.description && (
        <p className="text-sm text-white/50 line-clamp-2 mt-1">{space.description}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-sm text-white/50">
        <span className="flex items-center gap-1">
          {(() => {
            const avatar = buildAvatarUrl(space.host_wallet_address || '', space.host_avatar)
              || buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
            return avatar ? (
              <img src={avatar} alt="" className="w-4 h-4 rounded-md object-cover" />
            ) : (
              <span className="w-4 h-4 rounded-md bg-zinc-700 flex items-center justify-center text-[8px] text-white font-medium">
                {(space.host_username || 'A').charAt(0).toUpperCase()}
              </span>
            );
          })()}
          @{space.host_username || 'Anonymous'}
        </span>
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {Math.max(1, (space.speaker_count || 0) + (space.listener_count || 0))}
        </span>
      </div>
      <div className="mt-3 w-full h-10 rounded-lg overflow-hidden">
        <LiveWaveform active={true} barCount={60} />
      </div>
    </button>
  );
}

function resolveParticipantAvatar(participant: SpaceParticipant): string | undefined {
  const raw = participant.avatar;
  if (!raw) {
    // No avatar stored — try CDN fallback using wallet address
    return buildAvatarCdnFallbackUrl(participant.wallet_address);
  }
  // Try canonical CDN resolution
  return buildAvatarUrl(participant.wallet_address, raw) || raw;
}

function ParticipantAvatar({
  participant,
  isHost,
  canRemove,
  onRemove,
  reactionEmoji,
}: {
  participant: SpaceParticipant;
  isHost: boolean;
  canRemove: boolean;
  onRemove: () => void;
  reactionEmoji?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedAvatar = resolveParticipantAvatar(participant);
  const cdnFallback = buildAvatarCdnFallbackUrl(participant.wallet_address, participant.avatar ?? undefined);
  const activeSrc = imgFailed ? cdnFallback : resolvedAvatar;

  return (
    <div className="flex flex-col items-center gap-1 group relative">
      <div className={cn(
        "relative rounded-full p-0.5",
        !participant.is_muted && "ring-2 ring-white/50 ring-offset-2 ring-offset-black/60",
      )}>
        <Avatar className="w-12 h-12">
          <AvatarImage
            src={activeSrc}
            onError={() => setImgFailed(true)}
          />
          <AvatarFallback className="bg-white/10 text-white">
            {participant.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isHost && (
          <div className="absolute -top-1 -right-1 text-[12px]">
            👑
          </div>
        )}
        {participant.is_muted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
        {/* Reaction emoji overlay */}
        {reactionEmoji && (
          <div className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-sm animate-bounce border border-white/20">
            {reactionEmoji}
          </div>
        )}
      </div>
      <span className="text-xs text-white/60 truncate max-w-full">
        @{participant.username || 'anon'}
      </span>
      {canRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

function ListenerItem({
  participant,
  canInvite,
  onInvite,
  reactionEmoji,
}: {
  participant: SpaceParticipant;
  canInvite: boolean;
  onInvite: () => void;
  reactionEmoji?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedAvatar = resolveParticipantAvatar(participant);
  const cdnFallback = buildAvatarCdnFallbackUrl(participant.wallet_address, participant.avatar ?? undefined);
  const activeSrc = imgFailed ? cdnFallback : resolvedAvatar;

  return (
    <div className="relative group flex flex-col items-center gap-1">
      <div className="relative">
        <Avatar className="w-8 h-8">
          <AvatarImage
            src={activeSrc}
            onError={() => setImgFailed(true)}
          />
          <AvatarFallback className="bg-white/10 text-white text-xs">
            {participant.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {reactionEmoji && (
          <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-xs animate-bounce border border-white/20">
            {reactionEmoji}
          </div>
        )}
        {!reactionEmoji && participant.hand_raised && (
          <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-yellow-500/30 backdrop-blur-sm flex items-center justify-center text-xs border border-yellow-500/40">
            ✋
          </div>
        )}
        {canInvite && (
          <button
            onClick={onInvite}
            title={`Invite ${participant.username || 'listener'} as speaker`}
            className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full items-center justify-center hidden group-hover:flex"
          >
            <UserPlus className="w-2.5 h-2.5 text-white" />
          </button>
        )}
      </div>
      <span className="text-[10px] text-white/40 truncate max-w-[60px]">
        @{participant.username || 'anon'}
      </span>
    </div>
  );
}

function HandRequestItem({
  request,
  onApprove,
}: {
  request: RaiseHandRequest;
  onApprove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-xl">
      <div className="flex items-center gap-2">
        <Avatar className="w-8 h-8">
          <AvatarImage src={request.avatar || undefined} />
          <AvatarFallback className="bg-white/10 text-white text-xs">
            {request.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-white">{request.username || 'Anonymous'}</span>
      </div>
      <Button onClick={onApprove} size="sm" className="bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl">
        Approve
      </Button>
    </div>
  );
}
