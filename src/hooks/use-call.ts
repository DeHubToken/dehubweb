import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast as sonnerToast } from 'sonner';
import { simpleCallCheck, testCallDetection, debugAllCalls } from '@/utils/simple-call-check';

/** Maps holder-chat shadcn toast shape to Sonner */
function callToast(opts: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}) {
  const { title, description, variant, duration } = opts;
  if (variant === 'destructive') {
    sonnerToast.error(title, description ? { description } : undefined);
  } else {
    sonnerToast(title, { description, duration });
  }
}

export interface CallSession {
  id: string;
  caller_address: string;
  recipient_address: string;
  status: 'ringing' | 'connected' | 'ended';
  call_type: 'audio' | 'video';
  signaling_data?: any;
  created_at: string;
}

export interface UseCallReturn {
  isCallActive: boolean;
  isIncoming: boolean;
  currentCall: CallSession | null;
  isConnecting: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isUserOffline: boolean;
  callFailureReason: 'user_offline' | 'technical_error' | null;
  callDuration: string;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  startCall: (recipientAddress: string, callType?: 'audio' | 'video') => Promise<void>;
  endCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  debugCallState: () => void;
  checkForCalls: () => Promise<void>;
}

export const useCall = (): UseCallReturn => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isUserOffline, setIsUserOffline] = useState(false);
  const [callFailureReason, setCallFailureReason] = useState<'user_offline' | 'technical_error' | null>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDuration, setCallDuration] = useState<string>('00:00');

  // Agora refs
  const agoraClientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);
  const localVideoTrackRef = useRef<any>(null);

  // Stable currentCall ref to avoid stale closures
  const currentCallRef = useRef<CallSession | null>(null);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

  // Timer refs
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Video/audio element refs (kept for interface compat; Agora renders into these)
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const { walletAddress: userAddress } = useAuth();

  // ── Timer ───────────────────────────────────────────────────────────────────

  const startCallTimer = useCallback(() => {
    const startTime = new Date();
    setCallStartTime(startTime);
    const update = () => {
      const secs = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      setCallDuration(`${m}:${s}`);
    };
    update();
    callTimerRef.current = setInterval(update, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallStartTime(null);
    setCallDuration('00:00');
  }, []);

  // ── Agora token fetch ────────────────────────────────────────────────────────

  const getAgoraToken = useCallback(async (channelName: string): Promise<{ token: string; appId: string; uid: number } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, role: 'publisher' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.appId || !data?.token) throw new Error('Agora credentials not configured');
      return { token: data.token, appId: data.appId, uid: data.uid ?? 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get call token';
      callToast({ title: 'Call Error', description: msg, variant: 'destructive' });
      return null;
    }
  }, []);

  // ── Agora cleanup ────────────────────────────────────────────────────────────

  const cleanupAgora = useCallback(async () => {
    try {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }
      if (agoraClientRef.current) {
        await agoraClientRef.current.leave();
        agoraClientRef.current = null;
      }
    } catch (err) {
      console.warn('Agora cleanup error (non-fatal):', err);
    }
    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  // ── Join Agora channel (shared by caller + callee) ───────────────────────────

  const joinAgoraChannel = useCallback(async (
    callSession: CallSession,
    callType: 'audio' | 'video',
  ): Promise<boolean> => {
    const channelName = `dm-call-${callSession.id}`;
    const tokenData = await getAgoraToken(channelName);
    if (!tokenData) return false;

    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3); // warnings only

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;

      // Handle remote user publishing (they joined and started sending media)
      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        await client.subscribe(remoteUser, mediaType);
        console.log(`✅ Subscribed to remote ${mediaType}`);

        if (mediaType === 'audio') {
          remoteUser.audioTrack?.play();
        }
        if (mediaType === 'video') {
          if (remoteVideoRef.current) {
            remoteUser.videoTrack?.play(remoteVideoRef.current);
          }
        }

        // Mark call as active once remote user publishes
        setIsCallActive(true);
        setIsConnecting(false);
        startCallTimer();
      });

      client.on('user-unpublished', (_remoteUser: any, mediaType: 'audio' | 'video') => {
        console.log(`Remote user unpublished ${mediaType}`);
      });

      client.on('user-left', async () => {
        console.log('Remote user left the channel');
        // Other side hung up — auto end on our side
        const call = currentCallRef.current;
        if (call) {
          await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', call.id);
        }
        await cleanupAgora();
        stopCallTimer();
        setIsCallActive(false);
        setIsIncoming(false);
        setCurrentCall(null);
        setIsConnecting(false);
        callToast({ title: 'Call ended', description: 'The other person left the call.' });
      });

      await client.join(tokenData.appId, channelName, tokenData.token, tokenData.uid);
      console.log(`✅ Joined Agora channel: ${channelName}`);

      // Publish local tracks
      const tracksToPublish: any[] = [];

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = audioTrack;
      tracksToPublish.push(audioTrack);

      if (callType === 'video') {
        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;
        tracksToPublish.push(videoTrack);
        if (localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }
      }

      await client.publish(tracksToPublish);
      console.log('✅ Published local tracks to Agora');

      return true;
    } catch (err) {
      console.error('Agora join error:', err);
      callToast({ title: 'Connection failed', description: 'Could not connect to call', variant: 'destructive' });
      await cleanupAgora();
      return false;
    }
  }, [getAgoraToken, cleanupAgora, startCallTimer]);

  // ── endCall ──────────────────────────────────────────────────────────────────

  const endCall = useCallback(async () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    await cleanupAgora();
    stopCallTimer();

    const call = currentCallRef.current;
    if (call) {
      await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', call.id);
    }

    setIsCallActive(false);
    setIsIncoming(false);
    setCurrentCall(null);
    setIsConnecting(false);
    setIsMuted(false);
    setIsCameraOff(false);
  }, [cleanupAgora, stopCallTimer]);

  // ── startCall ────────────────────────────────────────────────────────────────

  const startCall = useCallback(async (recipientAddress: string, callType: 'audio' | 'video' = 'audio') => {
    if (!userAddress) return;

    setCallFailureReason(null);
    setIsUserOffline(false);
    setIsConnecting(true);

    try {
      // Check if recipient is online via a recent call_sessions presence ping
      // (simple heuristic: if they have a connected call session < 5 min, assume online)
      // We skip the complex WebRTC offline check — just try and handle failure

      // Create call session in Supabase for signaling
      const { data: session, error } = await supabase
        .from('call_sessions')
        .insert({
          caller_address: userAddress,
          recipient_address: recipientAddress,
          call_type: callType,
          status: 'ringing',
        })
        .select()
        .single();

      if (error || !session) {
        console.error('Failed to create call session:', error);
        callToast({ title: 'Call failed', description: 'Could not initiate call', variant: 'destructive' });
        setIsConnecting(false);
        return;
      }

      const callSession = session as CallSession;
      setCurrentCall(callSession);
      currentCallRef.current = callSession;

      // Join Agora channel (caller side — will publish, wait for callee)
      const joined = await joinAgoraChannel(callSession, callType);
      if (!joined) {
        await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', callSession.id);
        setCurrentCall(null);
        currentCallRef.current = null;
        setIsConnecting(false);
        return;
      }

      // 30-second ring timeout
      callTimeoutRef.current = setTimeout(async () => {
        const current = currentCallRef.current;
        if (current?.status === 'ringing') {
          callToast({
            title: 'No answer',
            description: 'The other person did not pick up.',
          });
          setCallFailureReason('user_offline');
          setIsUserOffline(true);
          await endCall();
        }
      }, 30_000);

      // Poll for callee accepting (update call_sessions.status = 'connected')
      pollingIntervalRef.current = setInterval(async () => {
        const current = currentCallRef.current;
        if (!current) {
          clearInterval(pollingIntervalRef.current!);
          return;
        }
        const { data } = await supabase
          .from('call_sessions')
          .select('status')
          .eq('id', current.id)
          .single();

        if (data?.status === 'connected') {
          clearInterval(pollingIntervalRef.current!);
          pollingIntervalRef.current = null;
          setCurrentCall(prev => prev ? { ...prev, status: 'connected' } : prev);
          // user-published event will fire setIsCallActive(true)
        } else if (data?.status === 'ended') {
          clearInterval(pollingIntervalRef.current!);
          pollingIntervalRef.current = null;
          await endCall();
        }
      }, 1500);

    } catch (err) {
      console.error('startCall error:', err);
      setCallFailureReason('technical_error');
      setIsConnecting(false);
    }
  }, [userAddress, joinAgoraChannel, endCall]);

  // ── acceptCall ───────────────────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    setIsConnecting(true);
    setIsIncoming(false);

    // Update status to connected so caller stops polling
    await supabase.from('call_sessions').update({ status: 'connected' }).eq('id', call.id);

    const joined = await joinAgoraChannel(call, call.call_type as 'audio' | 'video');
    if (!joined) {
      await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', call.id);
      setCurrentCall(null);
      currentCallRef.current = null;
      setIsConnecting(false);
    }
  }, [joinAgoraChannel]);

  // ── rejectCall ───────────────────────────────────────────────────────────────

  const rejectCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (call) {
      await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', call.id);
    }
    setIsIncoming(false);
    setCurrentCall(null);
    currentCallRef.current = null;
  }, []);

  // ── toggleMute ───────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localAudioTrackRef.current) return;
    const next = !isMuted;
    localAudioTrackRef.current.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  // ── toggleCamera ─────────────────────────────────────────────────────────────

  const toggleCamera = useCallback(() => {
    if (!localVideoTrackRef.current) return;
    const next = !isCameraOff;
    localVideoTrackRef.current.setMuted(next);
    setIsCameraOff(next);
  }, [isCameraOff]);

  // ── switchCamera ─────────────────────────────────────────────────────────────

  const switchCamera = useCallback(async () => {
    if (!localVideoTrackRef.current) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length < 2) return;
      // Get current deviceId and pick the other one
      const currentId = (localVideoTrackRef.current as any).getTrackLabel?.() ?? '';
      const next = videoDevices.find(d => d.label !== currentId) ?? videoDevices[0];
      await localVideoTrackRef.current.setDevice(next.deviceId);
    } catch (err) {
      console.warn('switchCamera error:', err);
    }
  }, []);

  // ── debugCallState ───────────────────────────────────────────────────────────

  const debugCallState = useCallback(() => {
    console.log('📞 Call state:', {
      isCallActive,
      isIncoming,
      currentCall: currentCallRef.current,
      isConnecting,
      isMuted,
      isCameraOff,
      agoraClient: !!agoraClientRef.current,
      localAudio: !!localAudioTrackRef.current,
      localVideo: !!localVideoTrackRef.current,
    });
    debugAllCalls();
  }, [isCallActive, isIncoming, isConnecting, isMuted, isCameraOff]);

  // ── checkForCalls (manual / polling fallback) ────────────────────────────────

  const checkForCalls = useCallback(async () => {
    if (!userAddress || isCallActive || isIncoming || isConnecting) return;

    const call = await simpleCallCheck(userAddress);
    if (!call) return;

    // Ignore calls older than 45 seconds
    const age = Date.now() - new Date(call.created_at).getTime();
    if (age > 45_000) return;

    console.log('📞 Incoming call detected:', call);
    const callSession = call as CallSession;
    setCurrentCall(callSession);
    currentCallRef.current = callSession;
    setIsIncoming(true);
  }, [userAddress, isCallActive, isIncoming, isConnecting]);

  // ── Supabase realtime — listen for incoming calls ────────────────────────────

  useEffect(() => {
    if (!userAddress) return;

    const channel = supabase
      .channel(`incoming-calls-${userAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `recipient_address=eq.${userAddress}`,
        },
        (payload) => {
          const call = payload.new as CallSession;
          if (call.status !== 'ringing') return;

          const age = Date.now() - new Date(call.created_at).getTime();
          if (age > 45_000) return;

          // Don't show if already in a call
          if (isCallActive || isIncoming || isConnecting) return;

          console.log('📞 Realtime incoming call:', call);
          setCurrentCall(call);
          currentCallRef.current = call;
          setIsIncoming(true);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `recipient_address=eq.${userAddress}`,
        },
        (payload) => {
          const updated = payload.new as CallSession;
          if (updated.status === 'ended' && currentCallRef.current?.id === updated.id) {
            endCall();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress, isCallActive, isIncoming, isConnecting, endCall]);

  // ── Periodic polling fallback (every 5s) for missed realtime events ──────────

  useEffect(() => {
    if (!userAddress) return;

    const interval = setInterval(() => {
      checkForCalls();
    }, 5_000);

    return () => clearInterval(interval);
  }, [userAddress, checkForCalls]);

  // ── Play local video track into ref once modal mounts ────────────────────────
  // When the video modal opens, `localVideoRef.current` becomes available.
  // We need to replay the local track into the element if it was created before.

  useEffect(() => {
    if (isCallActive && localVideoTrackRef.current && localVideoRef.current) {
      try {
        localVideoTrackRef.current.play(localVideoRef.current);
      } catch { /* ignore */ }
    }
  }, [isCallActive]);

  return {
    isCallActive,
    isIncoming,
    currentCall,
    isConnecting,
    isMuted,
    isCameraOff,
    isUserOffline,
    callFailureReason,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    debugCallState,
    checkForCalls,
  };
};
