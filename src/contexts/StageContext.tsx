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

  // Stable refs for realtime callbacks
  const walletAddressRef = useRef(walletAddress);
  const myRoleRef = useRef(myRole);
  const hasHandledStageEndRef = useRef(false);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

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
      // Capture all audio playing in the tab (what the host hears = all speakers mixed)
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      // Connect system audio (tab capture) if available, otherwise use a silent stream
      // The Agora remote tracks play through the speaker — we capture via getDisplayMedia
      // For simplicity and broad compatibility we use getUserMedia with echoCancellation off
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false })
        .then((stream) => {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

          const recorder = new MediaRecorder(stream, { mimeType });
          recordingChunksRef.current = [];
          recordingSpaceIdRef.current = spaceId;

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordingChunksRef.current.push(e.data);
          };

          recorder.start(1000); // collect chunks every 1s
          mediaRecorderRef.current = recorder;
          console.log('[Stage] Recording started');
        })
        .catch((err) => {
          console.warn('[Stage] Could not start recording:', err.message);
        });
    } catch (err) {
      console.warn('[Stage] Recording setup failed:', err);
    }
  }, []);

  const stopAndUploadRecording = useCallback(async (spaceId: string) => {
    const recorder = mediaRecorderRef.current;
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
          }
        } catch (err) {
          console.error('[Stage] Recording upload error:', err);
        } finally {
          recordingChunksRef.current = [];
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
        const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = localAudioTrack;
        localAudioTrack.setMuted(true);
        await client.publish([localAudioTrack]);
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
      const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = localAudioTrack;
      localAudioTrack.setMuted(true);
      await agoraClientRef.current.publish([localAudioTrack]);
      setMyRole('speaker');
      setIsMuted(true);
      setHasRaisedHand(false);
      toast.success("You're now a speaker! Unmute to talk.");
    } catch (err) {
      console.error('Error upgrading to speaker:', err);
      toast.error('Failed to enable microphone');
    }
  }, []);

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
    if (!currentSpace || !walletAddress) return;
    try {
      // If host is leaving, stop and upload recording first
      if (myRoleRef.current === 'host' && mediaRecorderRef.current) {
        await stopAndUploadRecording(currentSpace.id);
      }

      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (agoraClientRef.current) {
        await agoraClientRef.current.leave();
        agoraClientRef.current = null;
      }

      await supabase
        .from('space_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', walletAddress);

      // Recount from actual participants
      const { count: remainingListeners } = await supabase
        .from('space_participants')
        .select('*', { count: 'exact', head: true })
        .eq('space_id', currentSpace.id)
        .eq('role', 'listener')
        .is('left_at', null);

      const { count: remainingSpeakers } = await supabase
        .from('space_participants')
        .select('*', { count: 'exact', head: true })
        .eq('space_id', currentSpace.id)
        .in('role', ['host', 'speaker'])
        .is('left_at', null);

      await supabase
        .from('audio_spaces')
        .update({
          listener_count: remainingListeners ?? 0,
          speaker_count: remainingSpeakers ?? 1,
        })
        .eq('id', currentSpace.id);

      setCurrentSpace(null);
      setIsConnected(false);
      setMyRole(null);
      setParticipants([]);
      setHandRequests([]);
      setHasRaisedHand(false);
      // Toast handled by caller (endSpace or realtime listener)
    } catch (err) {
      console.error('Error leaving stage:', err);
    }
  }, [currentSpace, walletAddress, myRole]);

  // ─── End stage (host) ────────────────────────────────────────────────────

  const endSpace = useCallback(async () => {
    if (!currentSpace || myRole !== 'host' || hasHandledStageEndRef.current) return;
    hasHandledStageEndRef.current = true;

    try {
      const { error: updateErr } = await supabase
        .from('audio_spaces')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', currentSpace.id);

      if (updateErr) {
        console.warn('Direct end failed (will auto-end via trigger):', updateErr.message);
      }

      await leaveSpace();
      toast.success('Host ended space.');
    } catch (err) {
      hasHandledStageEndRef.current = false;
      console.error('Error ending stage:', err);
    }
  }, [currentSpace, myRole, leaveSpace]);

  // ─── Toggle mute ─────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (localAudioTrackRef.current && (myRole === 'host' || myRole === 'speaker')) {
      const newMuted = !isMuted;
      localAudioTrackRef.current.setMuted(newMuted);
      setIsMuted(newMuted);
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
                upgradeSpeaker();
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
          if (payload.eventType === 'INSERT') {
            const r = payload.new as RaiseHandRequest;
            if (r.status === 'pending') {
              setHandRequests(prev => prev.some(x => x.id === r.id) ? prev : [...prev, r]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as RaiseHandRequest;
            if (updated.status !== 'pending') {
              setHandRequests(prev => prev.filter(r => r.id !== updated.id));
              if (updated.wallet_address === walletAddressRef.current) setHasRaisedHand(false);
            } else {
              setHandRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            }
          } else if (payload.eventType === 'DELETE') {
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
            leaveSpace();
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
  }, [currentSpace?.id, leaveSpace, upgradeSpeaker]);

  // Live spaces subscription
  useEffect(() => {
    refreshSpaces();
    const channel = supabase
      .channel('live_spaces_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_spaces' }, refreshSpaces)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
