import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { apiCall, getAuthToken } from '@/lib/api/dehub/core';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { simpleCallCheck, debugAllCalls } from '@/utils/simple-call-check';
import { formatCallDuration } from '@/lib/call-duration';
import { visualActivity } from '@/lib/visual-activity';

export interface CallSession {
  id: string; caller_address: string; recipient_address: string;
  status: 'ringing' | 'connected' | 'ended'; call_type: 'audio' | 'video';
  signaling_data?: any; created_at: string;
}
export interface UseCallReturn {
  isCallActive: boolean; isIncoming: boolean; currentCall: CallSession | null;
  isConnecting: boolean; isMuted: boolean; isCameraOff: boolean; isUserOffline: boolean;
  callFailureReason: 'user_offline' | 'technical_error' | null;
  clearCallFailure: () => void; isMinimized: boolean;
  minimizeCall: () => void; maximizeCall: () => void; callStartedAt: number | null;
  mediaRevision: number; peerAddress: string;
  localVideoRef: React.RefObject<HTMLDivElement>; remoteVideoRef: React.RefObject<HTMLDivElement>;
  attachLocalVideo: (node: HTMLDivElement | null) => void;
  attachRemoteVideo: (node: HTMLDivElement | null) => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  startCall: (recipientAddress: string, callType?: 'audio' | 'video') => Promise<void>;
  endCall: () => void; acceptCall: () => void; rejectCall: () => void;
  toggleMute: () => void; toggleCamera: () => void; switchCamera: () => void;
  localVideoTrack: React.MutableRefObject<any>; debugCallState: () => void;
  checkForCalls: () => Promise<void>;
  setCallMessageHandler: (handler: ((content: string) => void) | null) => void;
}
type CallMedia = { client: any; audio: any; video: any; remoteVideo: any; remoteAudio: any; closed: boolean };

export const useCall = (): UseCallReturn => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isUserOffline, setIsUserOffline] = useState(false);
  const [callFailureReason, setCallFailureReason] = useState<'user_offline' | 'technical_error' | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const currentCallRef = useRef<CallSession | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const ringCheckRef = useRef<{ wallet: string; generation: number; recover: boolean } | null>(null);
  const joiningRef = useRef(false);
  const mediaRef = useRef<CallMedia | null>(null);
  const localVideoTrack = useRef<any>(null);
  const callMessageHandlerRef = useRef<((content: string) => void) | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const { walletAddress: userAddress } = useAuth();

  const publishCall = useCallback((call: CallSession | null) => {
    currentCallRef.current = call;
    setCurrentCall(call);
  }, []);
  const setCallMessageHandler = useCallback((handler: ((content: string) => void) | null) => {
    callMessageHandlerRef.current = handler;
  }, []);
  const markEnded = useCallback(async (call: CallSession | null) => {
    if (!call || call.id === 'pending') return;
    try { await supabase.from('call_sessions').update({ status: 'ended' }).eq('id', call.id); }
    catch (error) { console.warn('Call status update failed', error); }
  }, []);
  const clearTimers = useCallback(() => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    callTimeoutRef.current = null;
    pollingIntervalRef.current = null;
  }, []);
  const disposeMedia = useCallback(async (media: CallMedia | null) => {
    if (!media) return;
    if (!media.closed) {
      media.closed = true;
      // Release independently so a failed camera close cannot keep the mic alive.
      for (const track of [media.audio, media.video]) {
        try { track?.stop(); } catch {}
        try { track?.close(); } catch {}
      }
      for (const track of [media.remoteAudio, media.remoteVideo]) { try { track?.stop(); } catch {} }
      try { media.client?.removeAllListeners(); } catch {}
    }
    // Retry leaving if a pending join completed after the first teardown.
    try { await media.client?.leave(); } catch {}
  }, []);
  const endCall = useCallback(async () => {
    const call = currentCallRef.current;
    const startedAt = startedAtRef.current;
    generationRef.current += 1;
    joiningRef.current = false;
    publishCall(null);
    startedAtRef.current = null;
    clearTimers();
    const media = mediaRef.current;
    mediaRef.current = null;
    localVideoTrack.current = null;
    setCallStartedAt(null);
    setIsCallActive(false); setIsIncoming(false); setIsConnecting(false);
    setIsMuted(false); setIsCameraOff(false); setIsMinimized(false);
    visualActivity.setCall(false, false);
    if (call && startedAt != null) {
      callMessageHandlerRef.current?.(`📞 ${call.call_type === 'video' ? 'Video' : 'Voice'} call ended · ${formatCallDuration(startedAt)}`);
    }
    await Promise.all([disposeMedia(media), markEnded(call)]);
  }, [publishCall, clearTimers, disposeMedia, markEnded]);

  const joinAgoraChannel = useCallback(async (call: CallSession, generation: number): Promise<boolean> => {
    const current = () => generationRef.current === generation && currentCallRef.current?.id === call.id;
    if (!current()) return false;
    let media: CallMedia | null = null;
    try {
      const authToken = getAuthToken();
      const headers = authToken && userAddress
        ? { 'x-dehub-token': authToken, 'x-wallet-address': userAddress.toLowerCase() } : undefined;
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName: `dm-call-${call.id}`, role: 'publisher' }, ...(headers ? { headers } : {}),
      });
      if (!current()) return false;
      if (error || data?.error || !data?.appId || !data?.token) throw new Error('Could not get call credentials');
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      if (!current()) return false;
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      media = { client, audio: null, video: null, remoteVideo: null, remoteAudio: null, closed: false };
      const ownedMedia = media;
      mediaRef.current = media;
      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        if (!current() || ownedMedia.closed) return;
        try {
          await client.subscribe(remoteUser, mediaType);
          if (!current() || ownedMedia.closed) {
            remoteUser[mediaType === 'audio' ? 'audioTrack' : 'videoTrack']?.stop();
            return;
          }
          if (mediaType === 'audio') {
            ownedMedia.remoteAudio = remoteUser.audioTrack;
            remoteUser.audioTrack?.play();
          } else {
            ownedMedia.remoteVideo = remoteUser.videoTrack;
            setMediaRevision(revision => revision + 1);
          }
          publishCall({ ...currentCallRef.current!, status: 'connected' });
          setIsCallActive(true); setIsConnecting(false);
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          // Publishing audio, video or a replacement camera shares one clock.
          if (startedAtRef.current == null) {
            startedAtRef.current = Date.now();
            setCallStartedAt(startedAtRef.current);
          }
        } catch (error) {
          if (current()) { console.warn('Call subscription failed', error); void endCall(); }
        }
      });
      client.on('user-unpublished', (_user: any, type: 'audio' | 'video') => {
        if (!current()) return;
        if (type === 'video') {
          ownedMedia.remoteVideo?.stop();
          ownedMedia.remoteVideo = null; setMediaRevision(revision => revision + 1);
        }
      });
      client.on('user-left', () => { if (current()) void endCall(); });
      await client.join(data.appId, `dm-call-${call.id}`, data.token, data.uid ?? 0);
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      const audio = await AgoraRTC.createMicrophoneAudioTrack();
      if (!current() || media.closed) { audio.close(); await disposeMedia(media); return false; }
      media.audio = audio;
      if (call.call_type === 'video') {
        const video = await AgoraRTC.createCameraVideoTrack();
        if (!current() || media.closed) { video.close(); await disposeMedia(media); return false; }
        media.video = video;
        localVideoTrack.current = video;
        setMediaRevision(revision => revision + 1);
      }
      await client.publish([media.audio, ...(media.video ? [media.video] : [])]);
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      return true;
    } catch (error) {
      await disposeMedia(media);
      if (current()) {
        console.warn('Call connection failed', error);
        setCallFailureReason('technical_error');
        toast.error('Could not connect to call');
      }
      return false;
    }
  }, [userAddress, disposeMedia, publishCall, endCall]);

  const startCall = useCallback(async (recipientAddress: string, callType: 'audio' | 'video' = 'audio') => {
    if (!userAddress || currentCallRef.current) return;
    const generation = ++generationRef.current;
    const pending: CallSession = {
      id: 'pending', caller_address: userAddress.toLowerCase(), recipient_address: recipientAddress.toLowerCase(),
      status: 'ringing', call_type: callType, created_at: new Date().toISOString(),
    };
    publishCall(pending);
    setIsMinimized(false); setCallFailureReason(null); setIsUserOffline(false); setIsConnecting(true);
    visualActivity.setCall(true, true);
    try {
      const { data, error } = await supabase.from('call_sessions').insert({
        caller_address: pending.caller_address, recipient_address: pending.recipient_address,
        call_type: callType, status: 'ringing',
      }).select().single();
      if (error || !data) throw error ?? new Error('Could not initiate call');
      const call = data as CallSession;
      if (generationRef.current !== generation) { await markEnded(call); return; }
      publishCall(call);
      void apiCall('/api/push/call-ring', { method: 'POST', body: { sessionId: call.id }, requiresAuth: true })
        .catch(error => console.warn('Call ring push failed', error));
      callMessageHandlerRef.current?.(callType === 'video' ? '📹 Video call' : '📞 Voice call');
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current !== generation) return;
      if (!joined) { await endCall(); return; }
      if (startedAtRef.current == null) {
        callTimeoutRef.current = setTimeout(() => {
          if (generationRef.current !== generation || startedAtRef.current != null) return;
          setCallFailureReason('user_offline'); setIsUserOffline(true);
          callMessageHandlerRef.current?.(callType === 'video' ? '📵 Missed video call' : '📵 Missed voice call');
          void endCall();
        }, 30_000);
      }
      let checking = false;
      pollingIntervalRef.current = setInterval(async () => {
        if (checking || generationRef.current !== generation) return;
        checking = true;
        try {
          const { data: status } = await supabase.from('call_sessions').select('status').eq('id', call.id).single();
          if (generationRef.current !== generation) return;
          if (status?.status === 'ended') void endCall();
          else if (status?.status === 'connected') {
            publishCall({ ...currentCallRef.current!, status: 'connected' });
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } catch (error) { console.warn('Call status check failed', error); }
        finally { checking = false; }
      }, 1500);
    } catch (error) {
      if (generationRef.current === generation) {
        console.warn('Call start failed', error); setCallFailureReason('technical_error'); await endCall();
      }
    }
  }, [userAddress, publishCall, markEnded, joinAgoraChannel, endCall]);

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || joiningRef.current || call.status !== 'ringing') return;
    const generation = generationRef.current;
    joiningRef.current = true;
    setIsIncoming(false); setIsConnecting(true); clearTimers();
    try {
      const { error } = await supabase.from('call_sessions').update({ status: 'connected' }).eq('id', call.id);
      if (generationRef.current !== generation) { await markEnded(call); return; }
      if (error) throw error;
      publishCall({ ...call, status: 'connected' });
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current === generation && !joined) await endCall();
    } catch (error) {
      if (generationRef.current === generation) { setCallFailureReason('technical_error'); await endCall(); }
    } finally { if (generationRef.current === generation) joiningRef.current = false; }
  }, [clearTimers, publishCall, joinAgoraChannel, endCall, markEnded]);
  const checkForCalls = useCallback(async (recover = false): Promise<void> => {
    if (!userAddress || currentCallRef.current || document.visibilityState === 'hidden') return;
    const generation = generationRef.current;
    const pending = ringCheckRef.current;
    if (pending?.wallet === userAddress && pending.generation === generation) {
      // A ring may have been inserted after the running query took its snapshot.
      pending.recover ||= recover;
      return;
    }
    const request = { wallet: userAddress, generation, recover: false };
    ringCheckRef.current = request;
    try {
      const call = await simpleCallCheck(userAddress);
      if (!call || generationRef.current !== generation || currentCallRef.current || document.visibilityState === 'hidden') return;
      const age = Date.now() - new Date(call.created_at).getTime();
      if (!Number.isFinite(age) || age > 45_000) return;
      ++generationRef.current;
      publishCall(call as CallSession); setIsMinimized(false); setIsIncoming(true);
      visualActivity.setCall(true, true);
      const ringGeneration = generationRef.current;
      callTimeoutRef.current = setTimeout(() => {
        if (generationRef.current === ringGeneration && !joiningRef.current) void endCall();
      }, Math.max(0, 45_000 - age));
    } finally {
      if (ringCheckRef.current === request) {
        ringCheckRef.current = null;
        if (request.recover && generationRef.current === generation) void checkRef.current();
      }
    }
  }, [userAddress, publishCall, endCall]);
  const checkRef = useRef(checkForCalls);
  checkRef.current = checkForCalls;
  useEffect(() => {
    if (!userAddress) return;
    const channel = supabase.channel(`call:${userAddress.toLowerCase()}`, { config: { private: true } })
      .on('broadcast', { event: 'call' }, (message: { payload?: Pick<CallSession, 'id' | 'status'> }) => {
        const ping = message.payload;
        if (ping?.status === 'ringing') void checkRef.current(true);
        else if (ping?.status === 'ended' && currentCallRef.current?.id === ping.id) void endCall();
      }).subscribe(status => { if (status === 'SUBSCRIBED') void checkRef.current(); });
    const poll = () => { if (document.visibilityState !== 'hidden') void checkRef.current(); };
    const interval = setInterval(poll, 15_000);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('online', poll);
    poll();
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('online', poll);
      void supabase.removeChannel(channel);
    };
  }, [userAddress, endCall]);
  useEffect(() => {
    publishCall(null);
    startedAtRef.current = null;
    joiningRef.current = false;
    setCallStartedAt(null); setIsCallActive(false); setIsIncoming(false); setIsConnecting(false);
    setIsMuted(false); setIsCameraOff(false); setIsMinimized(false);
    return () => {
    generationRef.current += 1;
    clearTimers();
    const call = currentCallRef.current;
    currentCallRef.current = null;
    const media = mediaRef.current;
    mediaRef.current = null;
    localVideoTrack.current = null;
    visualActivity.setCall(false, false);
    void disposeMedia(media); void markEnded(call);
    };
  }, [userAddress, clearTimers, disposeMedia, markEnded, publishCall]);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || media.closed || isMinimized) return;
    try { if (media.video && localVideoRef.current) media.video.play(localVideoRef.current); } catch {}
    try { if (media.remoteVideo && remoteVideoRef.current) media.remoteVideo.play(remoteVideoRef.current); } catch {}
  }, [mediaRevision, isCallActive, isConnecting, isMinimized]);
  // Portal surfaces can mount after the publication effect has already run.
  const attachLocalVideo = useCallback((node: HTMLDivElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    const media = mediaRef.current;
    if (node && media && !media.closed) { try { media.video?.play(node); } catch {} }
  }, []);
  const attachRemoteVideo = useCallback((node: HTMLDivElement | null) => {
    (remoteVideoRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    const media = mediaRef.current;
    if (node && media && !media.closed) { try { media.remoteVideo?.play(node); } catch {} }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = mediaRef.current?.audio;
    if (audio) setIsMuted(previous => { void audio.setMuted(!previous); return !previous; });
  }, []);
  const toggleCamera = useCallback(() => {
    const video = mediaRef.current?.video;
    if (video) setIsCameraOff(previous => { void video.setMuted(!previous); return !previous; });
  }, []);
  const switchCamera = useCallback(async () => {
    const video = mediaRef.current?.video;
    if (!video) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      if (mediaRef.current?.video !== video || devices.length < 2) return;
      const label = video.getTrackLabel?.() ?? '';
      await video.setDevice((devices.find(device => device.label !== label) ?? devices[0]).deviceId);
    } catch (error) { console.warn('Camera switch failed', error); }
  }, []);
  const minimizeCall = useCallback(() => setIsMinimized(true), []);
  const maximizeCall = useCallback(() => setIsMinimized(false), []);
  const clearCallFailure = useCallback(() => { setCallFailureReason(null); setIsUserOffline(false); }, []);
  const debugCallState = useCallback(() => { console.log('Call state', currentCallRef.current); debugAllCalls(); }, []);
  const peerAddress = currentCall
    ? currentCall.caller_address.toLowerCase() === userAddress?.toLowerCase()
      ? currentCall.recipient_address : currentCall.caller_address : '';
  return useMemo(() => ({
    isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, localVideoRef, remoteVideoRef,
    attachLocalVideo, attachRemoteVideo, remoteAudioRef, startCall, endCall, acceptCall, rejectCall: endCall, toggleMute, toggleCamera, switchCamera,
    localVideoTrack, debugCallState, checkForCalls, setCallMessageHandler,
  }), [isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, startCall, endCall, acceptCall,
    attachLocalVideo, attachRemoteVideo, toggleMute, toggleCamera, switchCamera, debugCallState, checkForCalls, setCallMessageHandler]);
};
