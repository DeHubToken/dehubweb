/**
 * StageContext - Global context for Stages (audio spaces)
 * =========================================================
 * Persists stage state across navigation so users can browse the app
 * while in a live stage. Similar pattern to RadioPlayerProvider.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useVoiceEffects } from '@/hooks/use-voice-effects';
import type { VoiceEffectId } from '@/constants/voice-effects.constants';
import type {
  AudioSpace,
  SpaceParticipant,
  RaiseHandRequest,
  AgoraTokenResponse,
  SpaceRole,
} from '@/types/audio-spaces.types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StageContextType {
  // State
  liveSpaces: AudioSpace[];
  currentSpace: AudioSpace | null;
  participants: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  isLoading: boolean;
  isConnected: boolean;
  isMuted: boolean;
  myRole: SpaceRole | null;
  hasRaisedHand: boolean;
  isModalOpen: boolean;
  /** Aggregate audio volume level 0-1 from all speakers */
  volumeLevel: number;
  /** Current voice effect */
  voiceEffect: VoiceEffectId;
  setVoiceEffect: (id: VoiceEffectId) => void;

  // Modal controls
  openModal: (view?: 'browse' | 'create' | 'live') => void;
  closeModal: () => void;
  initialModalView: 'browse' | 'create' | 'live';

  // Actions
  createSpace: (title: string, description?: string) => Promise<AudioSpace | null>;
  joinSpace: (spaceId: string) => Promise<boolean>;
  leaveSpace: () => Promise<void>;
  endSpace: () => Promise<void>;
  toggleMute: () => void;
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  approveSpeaker: (walletAddress: string) => Promise<void>;
  removeSpeaker: (walletAddress: string) => Promise<void>;
  inviteSpeaker: (walletAddress: string) => Promise<void>;
  refreshSpaces: () => Promise<void>;
  injectAudio: (audioBlob: Blob, source?: AudioInjectionSource) => Promise<void>;
  /** Cut off whatever soundboard/TTS clip is currently playing on the stage. */
  stopInject: () => void;
}

/**
 * Describes who/what is producing an audio injection so the post-stage
 * transcript can label diarized speakers correctly. Used to log entries
 * into `recordingTimelineRef`.
 */
export interface AudioInjectionSource {
  /** "ai" for TTS / soundboard, "human" for live mic (rarely used here). */
  kind: 'ai' | 'human';
  /** "tts", "soundboard", "voice-clone", etc. */
  source: string;
  /** Human-readable label, e.g. "AI – Aria", "Soundboard: Air Horn". */
  label: string;
}

const StageContext = createContext<StageContextType | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function StageProvider({ children }: { children: ReactNode }) {
  const { walletAddress, user } = useAuth();

  // Stage state
  const [liveSpaces, setLiveSpaces] = useState<AudioSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<AudioSpace | null>(null);
  const [participants, setParticipants] = useState<SpaceParticipant[]>([]);
  const [handRequests, setHandRequests] = useState<RaiseHandRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [myRole, setMyRole] = useState<SpaceRole | null>(null);
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [voiceEffect, setVoiceEffectState] = useState<VoiceEffectId>('none');
  const voiceEffectsHook = useVoiceEffects();
  const voiceEffectsHookRef = useRef(voiceEffectsHook);
  voiceEffectsHookRef.current = voiceEffectsHook;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalView, setInitialModalView] = useState<'browse' | 'create' | 'live'>('browse');

  // Agora refs
  const agoraClientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);

  // Recording refs (host only)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingSpaceIdRef = useRef<string | null>(null);
  /** Wall-clock ms when recording started — used to compute relative timeline timestamps */
  const recordingStartMsRef = useRef<number>(0);
  /** Timeline of AI / non-host audio windows captured during recording. */
  const recordingTimelineRef = useRef<Array<{
    start: number; end: number; kind: 'ai' | 'human'; source: string; label: string;
  }>>([]);

  /** Serialize injectAudio (TTS / soundboard) so tracks don’t overlap on Agora */
  const injectAudioChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Guard against concurrent setVoiceEffect calls */
  const isEffectSwitchingRef = useRef(false);
  /** Coalesce bursts of audio_spaces realtime events into one list fetch */
  const liveSpacesRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs for realtime callbacks
  const walletAddressRef = useRef(walletAddress);
  const myRoleRef = useRef(myRole);
  const hasHandledStageEndRef = useRef(false);
  // Keep refs aligned before effects run (avoids host-only fetches seeing stale role on first mount).
  walletAddressRef.current = walletAddress;
  myRoleRef.current = myRole;

  /** Avoid re-subscribing realtime on every currentSpace object change (leaveSpace depends on currentSpace). */
  const leaveSpaceRef = useRef<() => Promise<void>>(async () => {});
  const upgradeSpeakerRef = useRef<() => Promise<void>>(async () => {});

  // ─── Modal controls ──────────────────────────────────────────────────────

  const openModal = useCallback((view: 'browse' | 'create' | 'live' = 'browse') => {
    setInitialModalView(view);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // ─── Recording helpers (host only) ──────────────────────────────────────

  const startRecording = useCallback((spaceId: string) => {
    try {
      // Record the voice-effect-processed stream (same audio that Agora publishes).
      // Accessed via ref so this callback stays stable with [] deps.
      const processedStream = voiceEffectsHookRef.current.getProcessedStream();
      if (!processedStream) {
        console.warn('[Stage] Cannot start recording — processed audio stream not ready');
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(processedStream, { mimeType });
      recordingChunksRef.current = [];
      recordingSpaceIdRef.current = spaceId;
      recordingTimelineRef.current = [];
      recordingStartMsRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect chunks every 1s
      mediaRecorderRef.current = recorder;
      console.log('[Stage] Recording started (voice-effect-processed stream)');
    } catch (err) {
      console.warn('[Stage] Recording setup failed:', err);
    }
  }, []); // stable — reads voiceEffectsHookRef.current at call time

  const stopAndUploadRecording = useCallback(async (spaceId: string, recorderArg?: MediaRecorder) => {
    const recorder = recorderArg ?? mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const chunks = recordingChunksRef.current;
          if (chunks.length === 0) { resolve(); return; }

          const blob = new Blob(chunks, { type: 'audio/webm' });
          const path = `${spaceId}/recording.webm`;

          const { error: uploadErr } = await supabase.storage
            .from('stage-recordings')
            .upload(path, blob, { contentType: 'audio/webm', upsert: true });

          if (uploadErr) {
            console.error('[Stage] Upload failed:', uploadErr.message);
            resolve();
            return;
          }

          const { data: urlData } = supabase.storage
            .from('stage-recordings')
            .getPublicUrl(path);

          if (urlData?.publicUrl) {
            await supabase
              .from('audio_spaces')
              .update({ recording_url: urlData.publicUrl })
              .eq('id', spaceId);
            console.log('[Stage] Recording saved:', urlData.publicUrl);

            // Trigger transcription as soon as the recording is uploaded.
            // Pass the timeline so the edge function can label diarized speakers
            // (host vs AI/TTS/soundboard) instead of "Speaker 1/2".
            const timeline = recordingTimelineRef.current.slice();
            supabase.functions
              .invoke('transcribe-stage', { body: { stageId: spaceId, timeline } })
              .catch((err) => console.warn('[Stage] Transcription trigger failed:', err));
          }
        } catch (err) {
          console.error('[Stage] Recording upload error:', err);
        } finally {
          recordingChunksRef.current = [];
          recordingTimelineRef.current = [];
          recordingSpaceIdRef.current = null;
          mediaRecorderRef.current = null;
          resolve();
        }
      };

      recorder.stop();
    });
  }, []);

  // ─── Fetch live stages ───────────────────────────────────────────────────

  const refreshSpaces = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'live')
        .order('started_at', { ascending: false });
      if (error) throw error;
      setLiveSpaces((data as AudioSpace[]) || []);
    } catch (err) {
      console.error('Error fetching stages:', err);
    }
  }, []);

  // ─── Agora helpers ───────────────────────────────────────────────────────

  const getAgoraToken = async (
    channelName: string,
    role: 'publisher' | 'subscriber',
  ): Promise<AgoraTokenResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tokenData = data as AgoraTokenResponse;
      if (!tokenData?.appId || !tokenData?.token) {
        throw new Error('Agora credentials not configured');
      }
      return tokenData;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get audio token';
      toast.error(msg);
      return null;
    }
  };

  const initializeAgora = async (
    tokenData: AgoraTokenResponse,
    role: SpaceRole,
  ): Promise<boolean> => {
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClientRef.current = client;

      // Enable volume indicator for live waveform
      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', (volumes: any[]) => {
        if (!volumes || volumes.length === 0) {
          setVolumeLevel(0);
          return;
        }
        const maxVol = Math.max(...volumes.map((v: any) => v.level || 0));
        // Agora levels are 0-100, normalize to 0-1
        setVolumeLevel(maxVol / 100);
      });

      if (role === 'host' || role === 'speaker') {
        await client.setClientRole('host');
      } else {
        await client.setClientRole('audience');
      }

      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'audio') remoteUser.audioTrack?.play();
      });

      client.on('user-unpublished', (_remoteUser: any) => {
        // cleanup handled by realtime DB events
      });

      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);

      if (role === 'host' || role === 'speaker') {
        const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const processedTrack = await voiceEffectsHook.processStream(rawStream, voiceEffect);
        const AgoraRTC2 = AgoraRTC; // reuse import
        const customTrack = AgoraRTC2.createCustomAudioTrack({ mediaStreamTrack: processedTrack });
        localAudioTrackRef.current = customTrack;
        customTrack.setMuted(true);
        await client.publish([customTrack]);
      }

      setIsConnected(true);
      return true;
    } catch (err) {
      console.error('Error initializing Agora:', err);
      toast.error('Failed to connect to audio');
      return false;
    }
  };

  // ─── Upgrade listener → speaker ──────────────────────────────────────────

  const upgradeSpeaker = useCallback(async () => {
    if (!agoraClientRef.current) return;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      await agoraClientRef.current.setClientRole('host');
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const processedTrack = await voiceEffectsHook.processStream(rawStream, voiceEffect);
      const customTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: processedTrack });
      localAudioTrackRef.current = customTrack;
      customTrack.setMuted(true);
      await agoraClientRef.current.publish([customTrack]);
      setMyRole('speaker');
      setIsMuted(true);
      setHasRaisedHand(false);
      toast.success("You're now a speaker! Unmute to talk.");
    } catch (err) {
      console.error('Error upgrading to speaker:', err);
      toast.error('Failed to enable microphone');
    }
  }, [voiceEffect, voiceEffectsHook]);

  // ─── Create stage ────────────────────────────────────────────────────────

  const createSpace = useCallback(
    async (title: string, description?: string): Promise<AudioSpace | null> => {
      if (!walletAddress) { toast.error('Please log in first'); return null; }
      setIsLoading(true);
      try {
        const channelName = `stage_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const { data: space, error } = await supabase
          .from('audio_spaces')
          .insert({
            channel_name: channelName,
            title,
            description,
            host_wallet_address: walletAddress,
            host_username: user?.username || null,
            host_avatar: user?.avatarImageUrl || null,
            status: 'live',
            speaker_count: 1,
            listener_count: 0,
          })
          .select()
          .single();
        if (error) throw error;

        await supabase.from('space_participants').insert({
          space_id: space.id,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          role: 'host',
          is_muted: true,
        });

        const tokenData = await getAgoraToken(channelName, 'publisher');
        if (!tokenData) {
          await supabase.from('audio_spaces').update({ status: 'ended' }).eq('id', space.id);
          throw new Error('Failed to get audio token');
        }

        const connected = await initializeAgora(tokenData, 'host');
        if (!connected) {
          await supabase.from('audio_spaces').update({ status: 'ended' }).eq('id', space.id);
          throw new Error('Failed to connect to audio');
        }

        setCurrentSpace(space as AudioSpace);
        setMyRole('host');
        hasHandledStageEndRef.current = false;
        // Start recording (host side — captures all audio they hear)
        startRecording(space.id);
        toast.success("Stage created! You're now live.");
        return space as AudioSpace;
      } catch (err) {
        console.error('Error creating stage:', err);
        if (err instanceof Error && !err.message.includes('token')) {
          toast.error('Failed to create stage');
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, user],
  );

  // ─── Join stage ──────────────────────────────────────────────────────────

  const joinSpace = useCallback(
    async (spaceId: string): Promise<boolean> => {
      if (!walletAddress) { toast.error('Please log in first'); return false; }
      setIsLoading(true);
      try {
        const { data: space, error: spaceError } = await supabase
          .from('audio_spaces')
          .select('*')
          .eq('id', spaceId)
          .single();
        if (spaceError || !space) throw new Error('Stage not found');

        // Determine role: if this user is the host, preserve host/speaker role on rejoin
        const isHost = space.host_wallet_address === walletAddress;

        // Check if user already has an active participant record (e.g. was speaker before disconnect)
        const { data: existingParticipant } = await supabase
          .from('space_participants')
          .select('role')
          .eq('space_id', spaceId)
          .eq('wallet_address', walletAddress)
          .is('left_at', null)
          .maybeSingle();

        const rejoiningRole = isHost
          ? 'host'
          : existingParticipant?.role === 'speaker' || existingParticipant?.role === 'host'
            ? 'speaker'
            : 'listener';

        const isSpeakerRole = rejoiningRole === 'host' || rejoiningRole === 'speaker';

        await supabase.from('space_participants').upsert(
          {
            space_id: spaceId,
            wallet_address: walletAddress,
            username: user?.username || null,
            avatar: user?.avatarImageUrl || null,
            role: rejoiningRole,
            is_muted: true,
            left_at: null,
          },
          { onConflict: 'space_id,wallet_address' },
        );

        // Recount listeners from actual participants to avoid drift on rejoin
        const { count: listenerCount } = await supabase
          .from('space_participants')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', spaceId)
          .eq('role', 'listener')
          .is('left_at', null);

        const { count: speakerCount } = await supabase
          .from('space_participants')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', spaceId)
          .in('role', ['host', 'speaker'])
          .is('left_at', null);

        await supabase
          .from('audio_spaces')
          .update({
            listener_count: listenerCount ?? 0,
            speaker_count: speakerCount ?? 1,
          })
          .eq('id', spaceId);

        const agoraRole = isSpeakerRole ? 'publisher' : 'subscriber';
        const tokenData = await getAgoraToken(space.channel_name, agoraRole);
        if (!tokenData) throw new Error('Failed to get token');

        const connected = await initializeAgora(tokenData, rejoiningRole === 'listener' ? 'listener' : 'speaker');
        if (!connected) throw new Error('Failed to connect');

        setCurrentSpace(space as AudioSpace);
        setMyRole(rejoiningRole as any);
        setHasRaisedHand(false);
        hasHandledStageEndRef.current = false;
        toast.success(isHost ? 'Rejoined as host!' : 'Joined the stage!');
        return true;
      } catch (err) {
        console.error('Error joining stage:', err);
        toast.error('Failed to join stage');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, user],
  );

  // ─── Leave stage ─────────────────────────────────────────────────────────

  const leaveSpace = useCallback(async () => {
    const space = currentSpace;
    const wallet = walletAddress;
    if (!space || !wallet) return;

    const wasHost = myRoleRef.current === 'host';
    // Capture the heavy resources, then detach the refs so the UI can reset
    // instantly and nothing else touches them mid-teardown.
    const recorder = mediaRecorderRef.current;
    const client = agoraClientRef.current;
    const localTrack = localAudioTrackRef.current;
    agoraClientRef.current = null;
    localAudioTrackRef.current = null;
    mediaRecorderRef.current = null;

    // ── Optimistic UI reset — synchronous, so the mini-player/modal close
    //    immediately instead of waiting on the recording upload + network. ──
    setCurrentSpace(null);
    setIsConnected(false);
    setMyRole(null);
    setParticipants([]);
    setHandRequests([]);
    setHasRaisedHand(false);
    setVoiceEffectState('none');

    // ── Teardown in the background (recording upload, Agora leave, DB counts).
    //    Order matters: stop/upload the recording before closing the audio graph. ──
    void (async () => {
      try {
        if (wasHost && recorder) {
          await stopAndUploadRecording(space.id, recorder);
        }
        if (localTrack) {
          try { localTrack.stop(); localTrack.close(); } catch { /* noop */ }
        }
        if (client) {
          try { await client.leave(); } catch { /* noop */ }
        }
        voiceEffectsHook.cleanup();

        await supabase
          .from('space_participants')
          .update({ left_at: new Date().toISOString() })
          .eq('space_id', space.id)
          .eq('wallet_address', wallet);

        const { count: remainingListeners } = await supabase
          .from('space_participants')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', space.id)
          .eq('role', 'listener')
          .is('left_at', null);

        const { count: remainingSpeakers } = await supabase
          .from('space_participants')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', space.id)
          .in('role', ['host', 'speaker'])
          .is('left_at', null);

        await supabase
          .from('audio_spaces')
          .update({
            listener_count: remainingListeners ?? 0,
            speaker_count: remainingSpeakers ?? 1,
          })
          .eq('id', space.id);
      } catch (err) {
        console.error('Error during stage teardown:', err);
      }
    })();
  }, [currentSpace, walletAddress]);

  leaveSpaceRef.current = leaveSpace;
  upgradeSpeakerRef.current = upgradeSpeaker;

  // ─── End stage (host) ────────────────────────────────────────────────────

  const endSpace = useCallback(async () => {
    const space = currentSpace;
    if (!space || myRole !== 'host' || hasHandledStageEndRef.current) return;
    hasHandledStageEndRef.current = true;

    // Optimistic: reset the UI now (leaveSpace closes instantly + tears down in
    // the background) and mark the space ended in the background too, so ending
    // never looks frozen. If the direct update fails, the DB auto-end trigger covers it.
    toast.success('Host ended space.');
    void leaveSpace();
    void supabase
      .from('audio_spaces')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', space.id)
      .then(({ error }) => {
        if (error) console.warn('Direct end failed (will auto-end via trigger):', error.message);
      });
  }, [currentSpace, myRole, leaveSpace]);

  // ─── Set voice effect ─────────────────────────────────────────────────────

  const setVoiceEffect = useCallback(async (effectId: VoiceEffectId) => {
    setVoiceEffectState(effectId);
    if (!agoraClientRef.current || !localAudioTrackRef.current) return;
    // Prevent concurrent calls from racing against each other
    if (isEffectSwitchingRef.current) return;
    isEffectSwitchingRef.current = true;
    try {
      // Build a fresh AudioContext + fresh processed track for the new effect.
      // We use rebuildEffect (not switchEffect) because Agora snapshots the
      // MediaStreamTrack reference at publish-time; rewiring the Web Audio graph
      // on the same track is not reliably picked up by the Agora RTC stack.
      const newTrack = await voiceEffectsHookRef.current.rebuildEffect(effectId);
      if (!newTrack) {
        console.warn('[VoiceEffect] rebuildEffect returned null — mic stream not yet captured');
        return;
      }

      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const wasMuted = localAudioTrackRef.current.muted;

      // Swap: unpublish old track, publish brand-new custom track
      await agoraClientRef.current.unpublish([localAudioTrackRef.current]);
      // Don't .close() the old Agora track — it may internally reference the raw stream

      const customTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: newTrack });
      customTrack.setMuted(wasMuted);
      localAudioTrackRef.current = customTrack;
      await agoraClientRef.current.publish([customTrack]);

      // rebuildEffect closes the old AudioContext and creates a new one, so the
      // MediaStreamDestination (and its track) is brand-new. Restart the MediaRecorder
      // on the new stream so the recording continues with the active voice effect.
      const activeRecorder = mediaRecorderRef.current;
      if (activeRecorder && activeRecorder.state !== 'inactive') {
        activeRecorder.addEventListener('stop', () => {
          const newStream = voiceEffectsHookRef.current.getProcessedStream();
          if (!newStream) return;
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          const newRecorder = new MediaRecorder(newStream, { mimeType });
          newRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordingChunksRef.current.push(e.data);
          };
          newRecorder.start(1000);
          mediaRecorderRef.current = newRecorder;
        }, { once: true });
        activeRecorder.stop();
      }

      toast.success(`Voice: ${effectId === 'none' ? 'Normal' : effectId}`);
    } catch (err) {
      console.error('Error switching voice effect:', err);
      toast.error('Failed to switch voice effect');
    } finally {
      isEffectSwitchingRef.current = false;
    }
  }, []); // stable — all Agora and hook state accessed via refs

  // ─── Toggle mute ─────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (localAudioTrackRef.current && (myRole === 'host' || myRole === 'speaker')) {
      const newMuted = !isMuted;
      // Mute at Agora SDK level
      localAudioTrackRef.current.setMuted(newMuted);
      // Also disable the underlying MediaStreamTrack to truly stop audio
      try {
        const mediaTrack = localAudioTrackRef.current.getMediaStreamTrack?.();
        if (mediaTrack) {
          mediaTrack.enabled = !newMuted;
        }
      } catch (_) { /* fallback: SDK mute is still applied */ }
      setIsMuted(newMuted);
      // Optimistically update the local participant's is_muted in state
      if (walletAddress) {
        setParticipants(prev => prev.map(p =>
          p.wallet_address === walletAddress ? { ...p, is_muted: newMuted } : p
        ));
      }
      if (currentSpace && walletAddress) {
        supabase
          .from('space_participants')
          .update({ is_muted: newMuted })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', walletAddress);
      }
    }
  }, [isMuted, myRole, currentSpace, walletAddress]);

  // ─── Raise / lower hand ──────────────────────────────────────────────────

  const raiseHand = useCallback(async () => {
    if (!currentSpace || !walletAddress || myRole !== 'listener' || hasRaisedHand) return;
    try {
      const { error } = await supabase.from('raise_hand_requests').insert({
        space_id: currentSpace.id,
        wallet_address: walletAddress,
        username: user?.username || null,
        avatar: user?.avatarImageUrl || null,
        status: 'pending',
      });
      if (error) throw error;
      setHasRaisedHand(true);
      toast.success('Hand raised! Waiting for host approval.');
    } catch (err) {
      console.error('Error raising hand:', err);
      toast.error('Failed to raise hand');
    }
  }, [currentSpace, walletAddress, user, myRole, hasRaisedHand]);

  const lowerHand = useCallback(async () => {
    if (!currentSpace || !walletAddress) return;
    try {
      await supabase
        .from('raise_hand_requests')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', walletAddress)
        .eq('status', 'pending');
      setHasRaisedHand(false);
    } catch (err) {
      console.error('Error lowering hand:', err);
    }
  }, [currentSpace, walletAddress]);

  // ─── Approve speaker ─────────────────────────────────────────────────────

  const approveSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        await supabase
          .from('raise_hand_requests')
          .update({ status: 'approved', resolved_at: new Date().toISOString() })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', targetWallet)
          .eq('status', 'pending');

        await supabase
          .from('space_participants')
          .update({ role: 'speaker' })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', targetWallet);

        await supabase
          .from('audio_spaces')
          .update({
            speaker_count: (currentSpace.speaker_count || 1) + 1,
            listener_count: Math.max(0, (currentSpace.listener_count || 1) - 1),
          })
          .eq('id', currentSpace.id);

        toast.success('Speaker approved');
      } catch (err) {
        console.error('Error approving speaker:', err);
      }
    },
    [currentSpace, myRole],
  );

  // ─── Remove speaker ──────────────────────────────────────────────────────

  const removeSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        await supabase
          .from('space_participants')
          .update({ role: 'listener' })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', targetWallet);

        await supabase
          .from('audio_spaces')
          .update({
            speaker_count: Math.max(1, (currentSpace.speaker_count || 2) - 1),
            listener_count: (currentSpace.listener_count || 0) + 1,
          })
          .eq('id', currentSpace.id);

        toast.success('Speaker removed');
      } catch (err) {
        console.error('Error removing speaker:', err);
      }
    },
    [currentSpace, myRole],
  );

  // ─── Invite speaker directly ─────────────────────────────────────────────

  const inviteSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        // Directly promote listener to speaker (no hand-raise needed)
        await supabase
          .from('space_participants')
          .update({ role: 'speaker' })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', targetWallet);

        await supabase
          .from('audio_spaces')
          .update({
            speaker_count: (currentSpace.speaker_count || 1) + 1,
            listener_count: Math.max(0, (currentSpace.listener_count || 1) - 1),
          })
          .eq('id', currentSpace.id);

        toast.success('Invited as speaker');
      } catch (err) {
        console.error('Error inviting speaker:', err);
        toast.error('Failed to invite speaker');
      }
    },
    [currentSpace, myRole],
  );

  // ─── Realtime subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    if (!currentSpace) return;

    const participantsChannel = supabase
      .channel(`participants:${currentSpace.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_participants', filter: `space_id=eq.${currentSpace.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const p = payload.new as SpaceParticipant;
            if (!p.left_at) {
              setParticipants(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as SpaceParticipant;
            if (updated.left_at) {
              setParticipants(prev => prev.filter(p => p.id !== updated.id));
            } else {
              setParticipants(prev => prev.map(p => p.id === updated.id ? updated : p));
              if (
                updated.wallet_address === walletAddressRef.current &&
                updated.role === 'speaker' &&
                myRoleRef.current === 'listener'
              ) {
                void upgradeSpeakerRef.current();
              }
            }
          } else if (payload.eventType === 'DELETE') {
            setParticipants(prev => prev.filter(p => p.id !== (payload.old as SpaceParticipant).id));
          }
        },
      )
      .subscribe();

    const handChannel = supabase
      .channel(`hands:${currentSpace.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raise_hand_requests', filter: `space_id=eq.${currentSpace.id}` },
        (payload) => {
          const host = myRoleRef.current === 'host';
          if (payload.eventType === 'INSERT') {
            const r = payload.new as RaiseHandRequest;
            if (host && r.status === 'pending') {
              setHandRequests(prev => prev.some(x => x.id === r.id) ? prev : [...prev, r]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as RaiseHandRequest;
            if (updated.wallet_address === walletAddressRef.current && updated.status !== 'pending') {
              setHasRaisedHand(false);
            }
            if (!host) return;
            if (updated.status !== 'pending') {
              setHandRequests(prev => prev.filter(r => r.id !== updated.id));
            } else {
              setHandRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            }
          } else if (payload.eventType === 'DELETE') {
            if (!host) return;
            setHandRequests(prev => prev.filter(r => r.id !== (payload.old as RaiseHandRequest).id));
          }
        },
      )
      .subscribe();

    const spaceChannel = supabase
      .channel(`space:${currentSpace.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audio_spaces', filter: `id=eq.${currentSpace.id}` },
        (payload) => {
          const updated = payload.new as AudioSpace;
          if (updated.status === 'ended') {
            if (hasHandledStageEndRef.current) return;
            hasHandledStageEndRef.current = true;
            if (myRoleRef.current !== 'host') {
              toast.info('Host ended space.');
            }
            void leaveSpaceRef.current();
          } else {
            setCurrentSpace(updated);
          }
        },
      )
      .subscribe();

    // Initial fetch
    supabase
      .from('space_participants')
      .select('*')
      .eq('space_id', currentSpace.id)
      .is('left_at', null)
      .then(({ data }) => { if (data) setParticipants(data as SpaceParticipant[]); });

    if (myRoleRef.current === 'host') {
      supabase
        .from('raise_hand_requests')
        .select('*')
        .eq('space_id', currentSpace.id)
        .eq('status', 'pending')
        .then(({ data }) => { if (data) setHandRequests(data as RaiseHandRequest[]); });
    }

    return () => {
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(handChannel);
      supabase.removeChannel(spaceChannel);
    };
  }, [currentSpace?.id]);

  // ─── Inject TTS audio into Agora channel ────────────────────────────────

  const injectAudio = useCallback(async (audioBlob: Blob, injectionSource?: AudioInjectionSource) => {
    // DJ-deck: a new clip cuts off whatever is currently playing. Stopping the
    // active source resolves its injectSound promise, so the serialized chain
    // below advances immediately to this clip instead of queueing behind it.
    voiceEffectsHookRef.current.stopInjectedSound();

    const run = async () => {
      const track = localAudioTrackRef.current;
      if (!track) {
        throw new Error('Not connected to a stage');
      }

      // The clip is mixed straight into the effect graph's MediaStreamDestination
      // (see useVoiceEffects.injectSound). That destination is the exact track this
      // client already publishes for the mic — so every listener hears the clip on a
      // track that provably carries audio. No new track, no publish/unpublish, no
      // second (possibly-suspended) AudioContext. The clip is also captured by the
      // host-side stage recording, since the recorder reads the same destination.
      const wasMuted = track.muted;
      const destTrack = track.getMediaStreamTrack?.() as MediaStreamTrack | undefined;

      // While muted, the outgoing track is gated shut (SDK mute + destTrack.enabled
      // = false) and would swallow the clip. Open the gate for the clip's duration,
      // but first silence the raw mic so ONLY the clip goes out — no mic bleed.
      if (wasMuted) {
        voiceEffectsHookRef.current.setRawMicEnabled(false);
        if (destTrack) destTrack.enabled = true;
        track.setMuted(false);
      }

      // Record an AI/soundboard window (host-side only) for post-stage diarization.
      const recStart = recordingStartMsRef.current;
      const winStart = recStart > 0 ? (Date.now() - recStart) / 1000 : 0;

      try {
        await voiceEffectsHookRef.current.injectSound(audioBlob);
      } finally {
        if (recStart > 0) {
          const winEnd = (Date.now() - recStart) / 1000;
          recordingTimelineRef.current.push({
            start: Math.max(0, winStart),
            end: Math.max(winStart + 0.1, winEnd),
            kind: injectionSource?.kind ?? 'ai',
            source: injectionSource?.source ?? 'tts',
            label: injectionSource?.label ?? 'AI voice',
          });
        }
        // Restore the pre-injection mute state.
        if (wasMuted) {
          track.setMuted(true);
          if (destTrack) destTrack.enabled = false;
          voiceEffectsHookRef.current.setRawMicEnabled(true);
        }
      }
    };

    const prev = injectAudioChainRef.current;
    const next = prev.then(() => run(), () => run());
    injectAudioChainRef.current = next.catch(() => {});
    await next;
  }, []);

  const stopInject = useCallback(() => {
    voiceEffectsHookRef.current.stopInjectedSound();
  }, []);

  // Live spaces: one fetch on mount + debounced refetch on realtime (avoids N requests per burst)
  useEffect(() => {
    void refreshSpaces();
    const scheduleLiveSpacesRefresh = () => {
      if (liveSpacesRefreshDebounceRef.current) clearTimeout(liveSpacesRefreshDebounceRef.current);
      liveSpacesRefreshDebounceRef.current = setTimeout(() => {
        liveSpacesRefreshDebounceRef.current = null;
        void refreshSpaces();
      }, 750);
    };
    const channel = supabase
      .channel('live_spaces_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_spaces' }, scheduleLiveSpacesRefresh)
      .subscribe();
    return () => {
      if (liveSpacesRefreshDebounceRef.current) clearTimeout(liveSpacesRefreshDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [refreshSpaces]);

  return (
    <StageContext.Provider
      value={{
        liveSpaces,
        currentSpace,
        participants,
        handRequests,
        isLoading,
        isConnected,
        isMuted,
        myRole,
        hasRaisedHand,
        volumeLevel,
        voiceEffect,
        setVoiceEffect,
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
        refreshSpaces,
        injectAudio,
        stopInject,
      }}
    >
      {children}
    </StageContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useStage() {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error('useStage must be used within a StageProvider');
  return ctx;
}
