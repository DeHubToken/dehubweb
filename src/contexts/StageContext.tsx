/**
 * StageContext - Global context for Stages (audio spaces)
 * =========================================================
 * Persists stage state across navigation so users can browse the app
 * while in a live stage. Similar pattern to RadioPlayerProvider.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
// Deliberately the narrow module and not the `@/lib/api/dehub` barrel: this
// context is mounted app-wide, and the barrel drags the whole API surface in.
import { getAuthToken } from '@/lib/api/dehub/core';
import {
  showRecordingUploading,
  showRecordingSaved,
  showRecordingFailed,
  dismissRecordingToast,
} from '@/lib/stage-recording-toast';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
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

/** What the schedule form collects. */
export interface ScheduleSpaceInput {
  title: string;
  description?: string;
  /** ISO timestamp for the intended start. */
  scheduledAt: string;
  /** Public URL of an already-uploaded cover graphic. */
  coverImageUrl?: string | null;
}

interface StageContextType {
  // State
  liveSpaces: AudioSpace[];
  scheduledSpaces: AudioSpace[];
  currentSpace: AudioSpace | null;
  participants: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  isLoading: boolean;
  isConnected: boolean;
  isMuted: boolean;
  myRole: SpaceRole | null;
  hasRaisedHand: boolean;
  isModalOpen: boolean;
  /** Current voice effect */
  voiceEffect: VoiceEffectId;
  setVoiceEffect: (id: VoiceEffectId) => void;

  // Modal controls
  openModal: (view?: 'browse' | 'create' | 'live') => void;
  closeModal: () => void;
  initialModalView: 'browse' | 'create' | 'live';

  // Actions
  createSpace: (title: string, description?: string) => Promise<AudioSpace | null>;
  scheduleSpace: (input: ScheduleSpaceInput) => Promise<AudioSpace | null>;
  startScheduledSpace: (spaceId: string) => Promise<boolean>;
  cancelScheduledSpace: (spaceId: string) => Promise<void>;
  refreshScheduledSpaces: () => Promise<void>;
  joinSpace: (spaceId: string) => Promise<boolean>;
  /**
   * Listen-only join for signed-out visitors landing on an invite link:
   * Agora audience with a subscriber token, no participant row, no counts.
   * The stage page is the player — there is no mini-player for a guest.
   */
  guestListen: (spaceId: string) => Promise<boolean>;
  guestStopListening: () => Promise<void>;
  guestSpace: AudioSpace | null;
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
  /** The screen currently on the room's wall, or null when nobody is sharing. */
  screenShare: StageScreenShare | null;
  /** True while THIS client is the one sharing. */
  isScreenSharing: boolean;
  /** Whether this device can capture a screen at all — see detectScreenShareSupport. */
  canScreenShare: boolean;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

/** The one screen a room can be showing, whoever it belongs to. */
export interface StageScreenShare {
  /** Agora video track — our own local track while sharing, else the remote one. */
  track: any;
  /** Agora uid of the publisher; null for our own local track. */
  uid: number | string | null;
  isLocal: boolean;
}

/**
 * Screen capture is a desktop-only affair. No mobile browser implements
 * `getDisplayMedia` — iOS Safari has no such method at all, and Chrome on
 * Android does not ship it either — so the control is gated on the capability
 * plus a pointing device, and a mobile host never sees a button that could
 * only fail. Watching a share is NOT gated: a phone subscribes to the video
 * track like any other participant.
 *
 * `any-pointer`, not `pointer`: a Surface with its keyboard folded back
 * reports its *primary* pointer as coarse while still being a desktop browser
 * that can share perfectly well. Phones and tablets are already excluded by
 * the capability check above, so the looser query costs nothing.
 */
function detectScreenShareSupport(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return false;
  return window.matchMedia?.('(any-pointer: fine)').matches ?? false;
}

/**
 * Should this device take the low-resolution copy of a shared screen?
 *
 * A phone has no use for a 1920×1080 stream it renders into ~340 CSS pixels,
 * and on cellular it is the difference between a stage that plays and one that
 * stutters. Small viewports and touch devices take the small stream; anything
 * desktop-sized keeps the full one.
 */
function prefersLowVideoStream(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 1023px), (pointer: coarse)').matches ?? false;
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

// ─── Volume store ────────────────────────────────────────────────────────────
// Agora's volume-indicator fires ~every 2s while in a stage. Keeping the level
// OUT of the context value means the ~15 useStage() consumers (sidebar, bottom
// nav, feed bars) don't re-render on every tick — only the waveform widgets
// that subscribe via useStageVolumeLevel() do.

let stageVolumeLevel = 0;
const stageVolumeSubscribers = new Set<() => void>();

function setStageVolumeLevel(level: number) {
  if (level === stageVolumeLevel) return;
  stageVolumeLevel = level;
  stageVolumeSubscribers.forEach(cb => cb());
}

function subscribeStageVolume(cb: () => void) {
  stageVolumeSubscribers.add(cb);
  return () => stageVolumeSubscribers.delete(cb);
}

/** Aggregate audio volume level 0-1 from all speakers (live-updating). */
export function useStageVolumeLevel(): number {
  return useSyncExternalStore(subscribeStageVolume, () => stageVolumeLevel);
}

// ─── Live spaces store ──────────────────────────────────────────────────────
// StageProvider already keeps the live-spaces list fresh (one fetch at boot +
// one debounced realtime channel). Sidebar/carousel widgets used to run their
// OWN queries and realtime channels against audio_spaces — a triple-fetch at
// boot and duplicate subscriptions. They subscribe here instead; the store
// updates whenever the provider refreshes, without making subscribers consume
// the full (churny) stage context value.

let liveSpacesStore: AudioSpace[] = [];
const liveSpacesSubscribers = new Set<() => void>();

function publishLiveSpaces(spaces: AudioSpace[]) {
  liveSpacesStore = spaces;
  liveSpacesSubscribers.forEach(cb => cb());
}

function subscribeLiveSpaces(cb: () => void) {
  liveSpacesSubscribers.add(cb);
  return () => liveSpacesSubscribers.delete(cb);
}

/** Live audio spaces list, shared from StageProvider's single fetch+realtime. */
export function useLiveSpaces(): AudioSpace[] {
  return useSyncExternalStore(subscribeLiveSpaces, () => liveSpacesStore);
}

// ─── Scheduled spaces store ─────────────────────────────────────────────────
// Same shape as the live-spaces store above, for the same reason: the upcoming
// shelf appears on the stages page, the music carousel and (once scheduled) any
// card in the feed, and none of those should run their own query.

let scheduledSpacesStore: AudioSpace[] = [];
const scheduledSpacesSubscribers = new Set<() => void>();

function publishScheduledSpaces(spaces: AudioSpace[]) {
  scheduledSpacesStore = spaces;
  scheduledSpacesSubscribers.forEach(cb => cb());
}

function subscribeScheduledSpaces(cb: () => void) {
  scheduledSpacesSubscribers.add(cb);
  return () => scheduledSpacesSubscribers.delete(cb);
}

/** Upcoming (scheduled) stages, soonest first. */
export function useScheduledSpaces(): AudioSpace[] {
  return useSyncExternalStore(subscribeScheduledSpaces, () => scheduledSpacesStore);
}

/**
 * How long a scheduled stage stays on the upcoming shelf after its start time
 * passes. Hosts run late, and a stage vanishing from the list at the exact
 * minute it was due — while people are still arriving from the link — reads as
 * the feature being broken.
 */
const SCHEDULED_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Wallet equality, the way the rest of the stack does it.
 *
 * Every RLS policy on a stage table compares `lower(...)`, and the deep-link
 * page lowercases before deciding who the host is. The auth layer happens to
 * hand this context a lowercase address today, so a raw `===` worked — but it
 * made the host check depend on a normalisation two files away, and a row
 * written with a checksummed address (a hand-inserted stage, an import, a
 * future signup path) would silently lock its own host out of starting it and
 * rejoin them as a listener.
 */
function sameWallet(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Recount a stage's headcounts from its participant rows.
 *
 * The cast is load-bearing and temporary. `src/integrations/supabase/types.ts`
 * is generated from the LIVE schema, and `recount_space()` is created by
 * `20260819180000_stage_write_policies.sql`, which is deliberately not applied
 * until the mobile release carrying the wallet headers is adopted — so the
 * generated union of RPC names cannot contain it yet and tsc rejects the
 * literal. Drop the casts once that migration is applied and Lovable
 * regenerates the types; nothing else has to change.
 *
 * Kept in one place so that is one edit rather than five, and so the reason is
 * written down once.
 */
async function recountSpace(spaceId: string): Promise<void> {
  const { error } = await supabase.rpc('recount_space' as never, {
    p_space_id: spaceId,
  } as never);
  if (!error) return;

  // The RPC does not exist until the staged migration is applied, and shipping
  // a client that depends on it ahead of the DB froze every headcount on the
  // row — the error came back in the result object and nothing read it. Until
  // the function exists, recount inline exactly the way this code did before
  // the RPC: three queries, counts derived from the rows. The fallback runs
  // against today's open policies; once the migration lands, the RPC answers
  // first and this path never executes again.
  try {
    const { count: listeners } = await supabase
      .from('space_participants')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .eq('role', 'listener')
      .is('left_at', null);

    const { count: speakers } = await supabase
      .from('space_participants')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .in('role', ['host', 'speaker'])
      .is('left_at', null);

    await supabase
      .from('audio_spaces')
      .update({ listener_count: listeners ?? 0, speaker_count: speakers ?? 1 })
      .eq('id', spaceId);
  } catch (err) {
    // A headcount is not worth failing a join or a leave over.
    console.warn('[Stage] Headcount recount failed:', err);
  }
}

// ─── Modal opener (subscription-free) ───────────────────────────────────────
// Several widely-mounted components (PostActionBar renders once PER POST in
// the feed) only ever need to OPEN the stages modal. Consuming the full stage
// context for that re-renders them on every stage state change. This module
// function routes to the provider without any context subscription.

let stageModalOpener: ((view?: 'browse' | 'create' | 'live') => void) | null = null;

/** Open the stages modal without subscribing to stage context state. */
export function openStageModal(view: 'browse' | 'create' | 'live' = 'browse') {
  stageModalOpener?.(view);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function StageProvider({ children }: { children: ReactNode }) {
  const { walletAddress, user } = useAuth();

  // Stage state
  const [liveSpaces, setLiveSpaces] = useState<AudioSpace[]>([]);
  const [scheduledSpaces, setScheduledSpaces] = useState<AudioSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<AudioSpace | null>(null);
  /** Signed-out listen-only session — mutually exclusive with currentSpace. */
  const [guestSpace, setGuestSpace] = useState<AudioSpace | null>(null);
  const guestSpaceRef = useRef<AudioSpace | null>(null);
  guestSpaceRef.current = guestSpace;
  const [participants, setParticipants] = useState<SpaceParticipant[]>([]);
  const [handRequests, setHandRequests] = useState<RaiseHandRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [myRole, setMyRole] = useState<SpaceRole | null>(null);
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const [voiceEffect, setVoiceEffectState] = useState<VoiceEffectId>('none');
  /** Whoever's screen is currently on the wall — ours or a remote publisher's. */
  const [screenShare, setScreenShare] = useState<StageScreenShare | null>(null);
  const canScreenShare = useMemo(detectScreenShareSupport, []);
  const voiceEffectsHook = useVoiceEffects();
  const voiceEffectsHookRef = useRef(voiceEffectsHook);
  voiceEffectsHookRef.current = voiceEffectsHook;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalView, setInitialModalView] = useState<'browse' | 'create' | 'live'>('browse');

  // Agora refs
  const agoraClientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);
  /** The display capture we publish while sharing, and its optional system audio. */
  const screenVideoTrackRef = useRef<any>(null);
  const screenAudioTrackRef = useRef<any>(null);

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
  /** True while the finished recording is being uploaded — read by the unload guard. */
  const recordingUploadInFlightRef = useRef(false);

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

  /**
   * Every stage WRITE goes through this.
   *
   * The stage tables' write policies check `get_request_wallet_address()`,
   * which reads the `x-wallet-address` request header — and the plain supabase
   * client never sends it. Reads are `USING (true)` and need nothing; writes
   * that skip this are refused outright once the policies are tightened, and
   * refused silently, because a policy failure on an un-inspected update
   * returns no rows rather than throwing.
   *
   * Read through the ref, not the closure, so this stays correct in the
   * background teardown paths that outlive their render.
   */
  const signed = useCallback(
    <T,>(query: T): T => withWalletHeader(query as never, walletAddressRef.current) as T,
    [],
  );

  /** Avoid re-subscribing realtime on every currentSpace object change (leaveSpace depends on currentSpace). */
  const leaveSpaceRef = useRef<() => Promise<void>>(async () => {});
  const upgradeSpeakerRef = useRef<() => Promise<void>>(async () => {});
  /** startScheduledSpace falls back to a plain rejoin, and is defined above joinSpace. */
  const joinSpaceRef = useRef<(spaceId: string) => Promise<boolean>>(async () => false);
  /** joinSpace tears a guest session down first, and is defined above it. */
  const guestStopListeningRef = useRef<() => Promise<void>>(async () => {});

  // ─── Modal controls ──────────────────────────────────────────────────────

  const openModal = useCallback((view: 'browse' | 'create' | 'live' = 'browse') => {
    setInitialModalView(view);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Feed the subscription-free module-level opener (see openStageModal above).
  useEffect(() => {
    stageModalOpener = openModal;
    return () => { stageModalOpener = null; };
  }, [openModal]);

  // ─── Keep a live host from silently killing their own recording ─────────
  //
  // Two windows where closing the tab destroys the recording with no error:
  // while on air (the recorder's chunks exist only in page memory), and the
  // minute or two after pressing End, when the UI has already reset but the
  // upload is still in flight — endSpace deliberately closes the modal before
  // the upload finishes, which makes leaving feel natural at exactly the
  // moment it loses the file. The browser's generic leave-site prompt is the
  // strongest signal a page is allowed to give there. Listeners and guests
  // never hit this: the handler only arms for a recording host or a pending
  // upload, and an armed-but-idle handler costs nothing.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      const recording =
        mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive';
      if (recording || recordingUploadInFlightRef.current) {
        e.preventDefault();
        // Required by Chrome for the dialog to actually appear.
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
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

    // Read by the beforeunload guard: from here until the finally below, a
    // one- to two-hour recording exists ONLY as in-memory chunks and an
    // in-flight fetch. The End flow deliberately resets the UI before this
    // finishes, which makes closing the tab feel natural at exactly the moment
    // it destroys the recording.
    recordingUploadInFlightRef.current = true;
    // The unload guard's browser dialog is the last line of defence; this is
    // the first — a corner card with the app's preloader, so the after-End
    // wait reads as progress instead of something the host has to guess at.
    showRecordingUploading();

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const chunks = recordingChunksRef.current;
          if (chunks.length === 0) { dismissRecordingToast(); resolve(); return; }

          const blob = new Blob(chunks, { type: 'audio/webm' });
          const path = `${spaceId}/recording.webm`;

          // One retry, and a visible failure. This upload is the only copy of
          // the stage in existence, the finally below wipes the chunks
          // whatever happens, and until now the only trace of a failed upload
          // was a console line nobody was looking at — the host walked away
          // believing the recording existed. A single retry absorbs the
          // transient blip that is the common failure here; a persistent toast
          // covers the rest honestly.
          let uploadErr: { message: string } | null = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            const { error } = await supabase.storage
              .from('stage-recordings')
              .upload(path, blob, { contentType: 'audio/webm', upsert: true });
            uploadErr = error;
            if (!uploadErr) break;
            console.warn(`[Stage] Upload attempt ${attempt + 1} failed:`, uploadErr.message);
          }

          if (uploadErr) {
            console.error('[Stage] Upload failed:', uploadErr.message);
            showRecordingFailed();
            resolve();
            return;
          }

          const { data: urlData } = supabase.storage
            .from('stage-recordings')
            .getPublicUrl(path);

          if (urlData?.publicUrl) {
            await signed(
              supabase
                .from('audio_spaces')
                .update({ recording_url: urlData.publicUrl })
                .eq('id', spaceId),
            );
            console.log('[Stage] Recording saved:', urlData.publicUrl);
            showRecordingSaved();

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
          showRecordingFailed();
        } finally {
          recordingUploadInFlightRef.current = false;
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
      const spaces = (data as AudioSpace[]) || [];
      setLiveSpaces(spaces);
      publishLiveSpaces(spaces);
    } catch (err) {
      console.error('Error fetching stages:', err);
    }
  }, []);

  /**
   * Upcoming stages, soonest first.
   *
   * Stages that came and went without the host ever starting them are dropped
   * from the list after a grace period rather than deleted — the row stays
   * reachable by link (so a shared card still resolves) but stops occupying
   * the upcoming shelf forever.
   */
  const refreshScheduledSpaces = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - SCHEDULED_GRACE_MS).toISOString();
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'scheduled')
        .gte('scheduled_at', cutoff)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      const spaces = (data as AudioSpace[]) || [];
      setScheduledSpaces(spaces);
      publishScheduledSpaces(spaces);
    } catch (err) {
      console.error('Error fetching scheduled stages:', err);
    }
  }, []);

  // ─── Agora helpers ───────────────────────────────────────────────────────

  /**
   * Take a remote screen off the wall, by publisher. Never touches our own
   * share: a remote user leaving must not blank the screen we are publishing.
   */
  const clearRemoteScreenShare = useCallback((uid: number | string | undefined) => {
    setScreenShare(prev => (prev && !prev.isLocal && prev.uid === uid ? null : prev));
  }, []);

  const getAgoraToken = async (
    channelName: string,
    role: 'publisher' | 'subscriber',
  ): Promise<AgoraTokenResponse | null> => {
    const requestToken = async (withIdentity: boolean): Promise<AgoraTokenResponse> => {
      // A subscriber token stays anonymous — that is what lets a signed-out
      // visitor on an invite link hear the room. A publisher token is gated on
      // the caller actually holding a host/speaker seat, so identify ourselves
      // whenever we are asking to speak. The wallet header is only a
      // cross-check; the function takes the address off the verified token.
      const authToken = withIdentity && role === 'publisher' ? getAuthToken() : null;
      const headers =
        authToken && walletAddress
          ? { 'x-dehub-token': authToken, 'x-wallet-address': walletAddress.toLowerCase() }
          : undefined;

      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, role },
        ...(headers ? { headers } : {}),
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tokenData = data as AgoraTokenResponse;
      if (!tokenData?.appId || !tokenData?.token) {
        throw new Error('Agora credentials not configured');
      }
      return tokenData;
    };

    try {
      try {
        return await requestToken(true);
      } catch (err) {
        // The identity headers are only understood by the redeployed function:
        // the previous deployment's CORS allow-list predates them, so the
        // browser's preflight fails and the request never leaves. Shipping the
        // headers ahead of that redeploy locked every host out of going live.
        // One bare retry keeps the client working against either deployment —
        // the old function never gated anything, so a token minted without
        // identity is exactly what it would have issued anyway, and once the
        // new function is live the first attempt succeeds and this path goes
        // dead. It does not mask a real refusal: an enforced 403 stays a 403
        // with or without headers.
        if (role !== 'publisher') throw err;
        console.warn('[Stage] Publisher token with identity failed, retrying bare:', err);
        return await requestToken(false);
      }
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
          setStageVolumeLevel(0);
          return;
        }
        const maxVol = Math.max(...volumes.map((v: any) => v.level || 0));
        // Agora levels are 0-100, normalize to 0-1
        setStageVolumeLevel(maxVol / 100);
      });

      if (role === 'host' || role === 'speaker') {
        await client.setClientRole('host');
      } else {
        await client.setClientRole('audience');
      }

      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'audio') {
          // One remote audio track per user even when the host publishes both a
          // mic and a screen-audio track — the SDK mixes them before they leave.
          remoteUser.audioTrack?.play();
        } else if (mediaType === 'video' && remoteUser.videoTrack) {
          // Take the small copy on phones and tablets. Throws when the sharer's
          // browser refused dual-stream mode, in which case there is only the
          // one stream to have and everyone takes it.
          if (prefersLowVideoStream()) {
            try {
              await client.setRemoteVideoStreamType(remoteUser.uid, 1);
            } catch (err) {
              console.warn('[Stage] Low-quality screen stream unavailable', err);
            }
          }
          // Video only ever means a screen share here; nobody publishes a camera.
          // Agora replays this for publishers already in the room when we join,
          // so walking in on a share picks it up without any extra handshake.
          setScreenShare({ track: remoteUser.videoTrack, uid: remoteUser.uid, isLocal: false });
        }
      });

      client.on('user-unpublished', (remoteUser: any, mediaType: 'audio' | 'video') => {
        // Participant bookkeeping rides realtime DB events; the only thing Agora
        // has to tell us here is that a screen went away.
        if (mediaType === 'video') clearRemoteScreenShare(remoteUser?.uid);
      });

      // A sharer who closes the tab never gets to unpublish.
      client.on('user-left', (remoteUser: any) => {
        clearRemoteScreenShare(remoteUser?.uid);
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

  /**
   * Put the host on the air for a stage row that already exists.
   *
   * Shared by "go live now" and "start the stage I scheduled", because from
   * the Agora side those are the same operation — the only difference is where
   * the row goes back to if connecting fails. A stage created on the spot is
   * dead if it never connected, so it rolls back to `ended`; a scheduled one
   * must go back to `scheduled` or a failed start would quietly destroy an
   * announcement people are already holding a link to.
   */
  const goLiveAsHost = useCallback(
    async (space: AudioSpace, rollbackStatus: 'ended' | 'scheduled'): Promise<AudioSpace> => {
      await signed(
        supabase.from('space_participants').insert({
          space_id: space.id,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          role: 'host',
          is_muted: true,
        }),
      );

      const rollback = async () => {
        await signed(
          supabase
            .from('audio_spaces')
            .update({ status: rollbackStatus })
            .eq('id', space.id),
        );
      };

      const tokenData = await getAgoraToken(space.channel_name, 'publisher');
      if (!tokenData) {
        await rollback();
        throw new Error('Failed to get audio token');
      }

      const connected = await initializeAgora(tokenData, 'host');
      if (!connected) {
        await rollback();
        throw new Error('Failed to connect to audio');
      }

      setCurrentSpace(space);
      setMyRole('host');
      hasHandledStageEndRef.current = false;
      // Start recording (host side — captures all audio they hear)
      startRecording(space.id);
      return space;
    },
    [walletAddress, user, startRecording, signed],
  );

  const createSpace = useCallback(
    async (title: string, description?: string): Promise<AudioSpace | null> => {
      if (!walletAddress) { toast.error('Please log in first'); return null; }
      setIsLoading(true);
      try {
        const channelName = `stage_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const { data: space, error } = await signed(
          supabase
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
            .single(),
        );
        if (error) throw error;

        await goLiveAsHost(space as AudioSpace, 'ended');
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
    [walletAddress, user, goLiveAsHost, signed],
  );

  // ─── Schedule a stage for later ──────────────────────────────────────────

  const scheduleSpace = useCallback(
    async (input: ScheduleSpaceInput): Promise<AudioSpace | null> => {
      if (!walletAddress) { toast.error('Please log in first'); return null; }
      setIsLoading(true);
      try {
        // The channel name is minted now and kept for the whole life of the
        // stage, so the link handed out today is the room people walk into.
        const channelName = `stage_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const { data: space, error } = await signed(
          supabase
            .from('audio_spaces')
            .insert({
              channel_name: channelName,
              title: input.title,
              description: input.description,
              host_wallet_address: walletAddress,
              host_username: user?.username || null,
              host_avatar: user?.avatarImageUrl || null,
              status: 'scheduled',
              scheduled_at: input.scheduledAt,
              cover_image_url: input.coverImageUrl ?? null,
              speaker_count: 0,
              listener_count: 0,
            })
            .select()
            .single(),
        );
        if (error) throw error;

        await refreshScheduledSpaces();
        return space as AudioSpace;
      } catch (err) {
        console.error('Error scheduling stage:', err);
        toast.error('Failed to schedule stage');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, user, refreshScheduledSpaces, signed],
  );

  /** Take a stage that was scheduled earlier live now. Host only. */
  const startScheduledSpace = useCallback(
    async (spaceId: string): Promise<boolean> => {
      if (!walletAddress) { toast.error('Please log in first'); return false; }
      setIsLoading(true);
      try {
        const { data: existing, error: readErr } = await supabase
          .from('audio_spaces')
          .select('*')
          .eq('id', spaceId)
          .single();
        if (readErr || !existing) throw new Error('Stage not found');
        // Compared case-insensitively, like every other host check (the deep
        // link page, the RLS policies). The auth layer hands us a lowercase
        // address today, but a row written by any other route with a
        // checksummed one would otherwise lock its own host out of starting it.
        if (!sameWallet(existing.host_wallet_address, walletAddress)) {
          toast.error('Only the host can start this stage');
          return false;
        }
        if (existing.status === 'live') {
          // Already running — treat "start" as "rejoin" rather than erroring.
          return await joinSpaceRef.current(spaceId);
        }
        if (existing.status !== 'scheduled') {
          toast.error('This stage has already ended');
          return false;
        }

        const { data: space, error } = await signed(
          supabase
            .from('audio_spaces')
            .update({
              status: 'live',
              // started_at defaulted to the moment the row was inserted, which
              // for a scheduled stage is whenever it was announced. Stamp the
              // real start so duration and the recorded list stay honest.
              started_at: new Date().toISOString(),
              speaker_count: 1,
            })
            .eq('id', spaceId)
            .select()
            .single(),
        );
        if (error) throw error;

        await goLiveAsHost(space as AudioSpace, 'scheduled');
        await refreshScheduledSpaces();
        toast.success("You're now live.");
        return true;
      } catch (err) {
        console.error('Error starting scheduled stage:', err);
        if (err instanceof Error && !err.message.includes('token')) {
          toast.error('Failed to start stage');
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, goLiveAsHost, refreshScheduledSpaces, signed],
  );

  /** Call off a scheduled stage. Host only; the row is removed outright. */
  const cancelScheduledSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      if (!walletAddress) return;
      try {
        const { error } = await supabase
          .from('audio_spaces')
          .delete()
          .eq('id', spaceId)
          .eq('status', 'scheduled')
          // The delete policy compares the host wallet to this header, and the
          // plain client never sends it — without this the row silently stays.
          .setHeader('x-wallet-address', walletAddress.toLowerCase());
        if (error) throw error;
        await refreshScheduledSpaces();
        toast.success('Stage cancelled');
      } catch (err) {
        console.error('Error cancelling scheduled stage:', err);
        toast.error('Failed to cancel stage');
      }
    },
    [walletAddress, refreshScheduledSpaces],
  );

  // ─── Join stage ──────────────────────────────────────────────────────────

  const joinSpace = useCallback(
    async (spaceId: string): Promise<boolean> => {
      if (!walletAddress) { toast.error('Please log in first'); return false; }
      // A visitor who was guest-listening and then logged in joins properly —
      // drop the listen-only session before taking the real one.
      if (guestSpaceRef.current) await guestStopListeningRef.current();
      setIsLoading(true);
      try {
        const { data: space, error: spaceError } = await supabase
          .from('audio_spaces')
          .select('*')
          .eq('id', spaceId)
          .single();
        if (spaceError || !space) throw new Error('Stage not found');

        // A stage that is not live has no channel to join. Without this the
        // invite link for an ended stage opened an Agora connection to an empty
        // room and sat there looking connected; with scheduled stages it would
        // also let anyone walk into a room before its host had started it.
        if (space.status !== 'live') {
          toast.error(
            space.status === 'scheduled'
              ? "This stage hasn't started yet"
              : 'This stage has ended',
          );
          return false;
        }

        // Determine role: if this user is the host, preserve host/speaker role on rejoin
        const isHost = sameWallet(space.host_wallet_address, walletAddress);

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

        await signed(
          supabase.from('space_participants').upsert(
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
          ),
        );

        // Recount from the participant rows so a rejoin cannot drift the
        // figures. Through the RPC rather than three statements here: once
        // audio_spaces UPDATE is host-only, a listener writing these columns
        // directly is refused, and a listener arriving is exactly when the
        // count has to move. recount_space derives both numbers server-side.
        await recountSpace(spaceId);

        const agoraRole = isSpeakerRole ? 'publisher' : 'subscriber';
        const tokenData = await getAgoraToken(space.channel_name, agoraRole);
        if (!tokenData) throw new Error('Failed to get token');

        const connected = await initializeAgora(tokenData, rejoiningRole === 'listener' ? 'listener' : 'speaker');
        if (!connected) throw new Error('Failed to connect');

        setCurrentSpace(space as AudioSpace);
        setMyRole(rejoiningRole as any);
        setHasRaisedHand(false);
        hasHandledStageEndRef.current = false;
        // A host coming back after a refresh or a network drop is still ON AIR
        // — but the recorder died with the old page, and the only other
        // startRecording call is in goLiveAsHost, which a rejoin never passes
        // through. Without this, everything said after a mid-stage refresh was
        // silently absent from the recording and the transcript: at End,
        // mediaRecorderRef was null and stopAndUploadRecording returned
        // without uploading anything.
        if (isHost) startRecording(spaceId);
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
    [walletAddress, user, startRecording],
  );

  // ─── Guest listening ─────────────────────────────────────────────────────
  //
  // A signed-out visitor holding an invite link can hear the room without an
  // account: the agora-token function takes only a channel name (verify_jwt is
  // off), so a subscriber token is mintable with the publishable key alone.
  // Deliberately no DB writes — no participant row, no listener_count bump —
  // so a guest can never strand state a wallet-scoped teardown can't reach.

  const guestStopListening = useCallback(async () => {
    const client = agoraClientRef.current;
    agoraClientRef.current = null;
    setGuestSpace(null);
    setIsConnected(false);
    setScreenShare(null);
    if (client) {
      try { await client.leave(); } catch { /* noop */ }
    }
  }, []);

  const guestListen = useCallback(
    async (spaceId: string): Promise<boolean> => {
      // The logged-in flow owns the Agora client; never steal it mid-stage.
      if (currentSpace) return false;
      if (guestSpaceRef.current?.id === spaceId) return true;
      if (guestSpaceRef.current) await guestStopListening();
      setIsLoading(true);
      try {
        const { data: space, error } = await supabase
          .from('audio_spaces')
          .select('*')
          .eq('id', spaceId)
          .single();
        if (error || !space) throw new Error('Stage not found');
        if (space.status !== 'live') {
          toast.error(
            space.status === 'scheduled'
              ? "This stage hasn't started yet"
              : 'This stage has ended',
          );
          return false;
        }
        const tokenData = await getAgoraToken(space.channel_name, 'subscriber');
        if (!tokenData) return false;
        const connected = await initializeAgora(tokenData, 'listener');
        if (!connected) return false;
        setGuestSpace(space as AudioSpace);
        return true;
      } catch (err) {
        console.error('Error joining stage as guest:', err);
        toast.error('Failed to join stage');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [currentSpace, guestStopListening],
  );

  // A guest has no participant row, so the normal end-of-stage teardown never
  // reaches them — watch the row itself and drop the audio when the host ends.
  useEffect(() => {
    if (!guestSpace) return;
    const channel = supabase
      .channel(`guest_stage_${guestSpace.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audio_spaces', filter: `id=eq.${guestSpace.id}` },
        (payload) => {
          if ((payload.new as { status?: string })?.status === 'ended') {
            toast.info('Stage ended', {
              description: `The host ended "${guestSpace.title}".`,
              duration: 6000,
            });
            void guestStopListening();
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [guestSpace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const screenVideo = screenVideoTrackRef.current;
    const screenAudio = screenAudioTrackRef.current;
    agoraClientRef.current = null;
    localAudioTrackRef.current = null;
    screenVideoTrackRef.current = null;
    screenAudioTrackRef.current = null;
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
    setScreenShare(null);

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
        // Closing the display capture is what drops the browser's "you are
        // sharing" bar — leaving the channel alone would leave it up.
        for (const track of [screenVideo, screenAudio]) {
          if (track) { try { track.stop(); track.close(); } catch { /* noop */ } }
        }
        if (client) {
          try { await client.leave(); } catch { /* noop */ }
        }
        voiceEffectsHook.cleanup();

        await signed(
          supabase
            .from('space_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('space_id', space.id)
            .eq('wallet_address', wallet),
        );

        await recountSpace(space.id);
      } catch (err) {
        console.error('Error during stage teardown:', err);
      }
    })();
  }, [currentSpace, walletAddress, signed]);

  leaveSpaceRef.current = leaveSpace;
  upgradeSpeakerRef.current = upgradeSpeaker;
  joinSpaceRef.current = joinSpace;
  guestStopListeningRef.current = guestStopListening;

  // ─── End stage (host) ────────────────────────────────────────────────────

  const endSpace = useCallback(async () => {
    const space = currentSpace;
    if (!space || myRole !== 'host' || hasHandledStageEndRef.current) return;
    hasHandledStageEndRef.current = true;

    // Optimistic: reset the UI now (leaveSpace closes instantly + tears down in
    // the background) and mark the space ended in the background too, so ending
    // never looks frozen. If the direct update fails, the DB auto-end trigger covers it.
    // The room is gone, so the sheet goes with it. Leaving under your own
    // steam is different — that lands you back on the stage list.
    setIsModalOpen(false);
    toast.success('Stage ended');
    void leaveSpace();
    void signed(
      supabase
        .from('audio_spaces')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', space.id),
    ).then(({ error }) => {
      if (error) console.warn('Direct end failed (will auto-end via trigger):', error.message);
    });
  }, [currentSpace, myRole, leaveSpace, signed]);

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
          sameWallet(p.wallet_address, walletAddress) ? { ...p, is_muted: newMuted } : p
        ));
      }
      if (currentSpace && walletAddress) {
        // `void`, not bare: a postgrest builder only issues its request inside
        // then(), so an un-awaited chain here sent nothing at all — every
        // remote participant stayed at the is_muted: true written on join, so
        // the room rendered everyone permanently muted and the speaking ring
        // never appeared for anybody but yourself.
        void signed(
          supabase
            .from('space_participants')
            .update({ is_muted: newMuted })
            .eq('space_id', currentSpace.id)
            .eq('wallet_address', walletAddress),
        ).then(({ error }) => {
          if (error) console.warn('[Stage] Failed to persist mute state:', error.message);
        });
      }
    }
  }, [isMuted, myRole, currentSpace, walletAddress, signed]);

  // ─── Screen share ────────────────────────────────────────────────────────
  //
  // The host publishes their display alongside the mic track they already have,
  // and every other client picks it up through the same `user-published` path
  // that already carries the audio — listeners stay `audience` and only ever
  // subscribe, so nothing about their connection changes. An Agora client can
  // publish exactly one video track, which is also the reason a room shows one
  // screen at a time: the host's.

  const stopScreenShare = useCallback(async () => {
    const video = screenVideoTrackRef.current;
    const audio = screenAudioTrackRef.current;
    if (!video && !audio) return;
    screenVideoTrackRef.current = null;
    screenAudioTrackRef.current = null;
    // Only clear the wall if what's on it is ours — a remote share must survive
    // us stopping our own.
    setScreenShare(prev => (prev?.isLocal ? null : prev));

    const client = agoraClientRef.current;
    const tracks = [video, audio].filter(Boolean);
    if (client && tracks.length) {
      try { await client.unpublish(tracks); } catch { /* already gone */ }
    }
    for (const track of tracks) {
      try { track.stop(); track.close(); } catch { /* noop */ }
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!agoraClientRef.current) { toast.error('Not connected to a stage'); return; }
    if (screenVideoTrackRef.current) return;

    let videoTrack: any = null;
    let audioTrack: any = null;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      // 'auto' hands back a pair only when the sharer ticked "share tab audio"
      // in the picker, so a plain window share stays a single track.
      const created = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1', optimizationMode: 'detail' },
        'auto',
      );
      videoTrack = Array.isArray(created) ? created[0] : created;
      audioTrack = Array.isArray(created) ? created[1] : null;

      // Re-read the client: the picker is modal and the host may have left the
      // stage while it was open.
      const client = agoraClientRef.current;
      if (!client) throw new Error('Left the stage before sharing started');

      screenVideoTrackRef.current = videoTrack;
      screenAudioTrackRef.current = audioTrack;

      // Send a second, small copy of the screen so phones and weak connections
      // have something to take. Keeping it at 1/3 of the full resolution (not
      // the SDK's 160×120 default) both keeps shared text legible on a handset
      // and stays clear of the ≥1/4 ratio Agora warns about. Subscribers pick
      // the small stream by device in the `user-published` handler, and Agora
      // additionally drops anyone to it on a poor network by default.
      // Best-effort: a browser that refuses simulcast still publishes normally.
      try {
        client.setLowStreamParameter({ width: 640, height: 360, framerate: 5, bitrate: 350 });
        await client.enableDualStream();
      } catch (err) {
        console.warn('[Stage] Dual-stream unavailable — everyone takes the full-size screen', err);
      }

      await client.publish([videoTrack]);

      // Tab/system audio rides as a SECOND published audio track, which the SDK
      // mixes with the mic on the way out. Deliberately NOT routed through the
      // voice-effect graph the way TTS and the soundboard are: that graph is
      // gated shut by the mute button, and a muted host sharing a video should
      // still be heard. It is also outside the host-side recording for the same
      // reason — the recorder taps the effect graph, not the channel.
      if (audioTrack) {
        try {
          await client.publish([audioTrack]);
        } catch (err) {
          console.warn('[Stage] Screen audio publish failed — sharing video only', err);
          screenAudioTrackRef.current = null;
          try { audioTrack.close(); } catch { /* noop */ }
        }
      }

      // The browser's own "Stop sharing" bar bypasses our button entirely.
      videoTrack.on('track-ended', () => { void stopScreenShare(); });

      setScreenShare({ track: videoTrack, uid: null, isLocal: true });
    } catch (err) {
      screenVideoTrackRef.current = null;
      screenAudioTrackRef.current = null;
      for (const track of [videoTrack, audioTrack]) {
        if (track) { try { track.close(); } catch { /* noop */ } }
      }
      // Dismissing the picker is a normal outcome, not a failure worth a toast.
      const code = (err as { code?: string } | null)?.code;
      const name = (err as { name?: string } | null)?.name;
      if (code === 'PERMISSION_DENIED' || name === 'NotAllowedError' || name === 'AbortError') return;
      console.error('Error starting screen share:', err);
      toast.error('Failed to share screen');
    }
  }, [stopScreenShare]);

  // ─── Raise / lower hand ──────────────────────────────────────────────────

  const raiseHand = useCallback(async () => {
    if (!currentSpace || !walletAddress || myRole !== 'listener' || hasRaisedHand) return;
    try {
      const { error } = await signed(
        supabase.from('raise_hand_requests').insert({
          space_id: currentSpace.id,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          status: 'pending',
        }),
      );
      // The table is UNIQUE on (space_id, wallet_address, status), and a
      // pending row survives a disconnect while the local hasRaisedHand state
      // does not — so a listener who dropped and rejoined got "Failed to raise
      // hand" on every press for the rest of the stage. A duplicate pending
      // row IS the state being asked for; treat it as success.
      if (error && error.code !== '23505') throw error;
      setHasRaisedHand(true);
      toast.success('Hand raised! Waiting for host approval.');
    } catch (err) {
      console.error('Error raising hand:', err);
      toast.error('Failed to raise hand');
    }
  }, [currentSpace, walletAddress, user, myRole, hasRaisedHand, signed]);

  const lowerHand = useCallback(async () => {
    if (!currentSpace || !walletAddress) return;
    try {
      await signed(
        supabase
          .from('raise_hand_requests')
          .update({ status: 'rejected', resolved_at: new Date().toISOString() })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', walletAddress)
          .eq('status', 'pending'),
      );
      setHasRaisedHand(false);
    } catch (err) {
      console.error('Error lowering hand:', err);
    }
  }, [currentSpace, walletAddress, signed]);

  // ─── Approve speaker ─────────────────────────────────────────────────────

  const approveSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        await signed(
          supabase
            .from('raise_hand_requests')
            .update({ status: 'approved', resolved_at: new Date().toISOString() })
            .eq('space_id', currentSpace.id)
            .eq('wallet_address', targetWallet)
            .eq('status', 'pending'),
        );

        await signed(
          supabase
            .from('space_participants')
            .update({ role: 'speaker' })
            .eq('space_id', currentSpace.id)
            .eq('wallet_address', targetWallet),
        );

        // Recount rather than ±1: the arithmetic here assumed the promoted
        // wallet was a listener sitting in the count, and moved both figures
        // even when it was not, so a promotion could leave the room reporting
        // a listener it did not have.
        await recountSpace(currentSpace.id);

        toast.success('Speaker approved');
      } catch (err) {
        console.error('Error approving speaker:', err);
      }
    },
    [currentSpace, myRole, signed],
  );

  // ─── Remove speaker ──────────────────────────────────────────────────────

  const removeSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        await signed(
          supabase
            .from('space_participants')
            .update({ role: 'listener' })
            .eq('space_id', currentSpace.id)
            .eq('wallet_address', targetWallet),
        );

        await recountSpace(currentSpace.id);

        toast.success('Speaker removed');
      } catch (err) {
        console.error('Error removing speaker:', err);
      }
    },
    [currentSpace, myRole, signed],
  );

  // ─── Invite speaker directly ─────────────────────────────────────────────

  const inviteSpeaker = useCallback(
    async (targetWallet: string) => {
      if (!currentSpace || myRole !== 'host') return;
      try {
        // Directly promote listener to speaker (no hand-raise needed)
        await signed(
          supabase
            .from('space_participants')
            .update({ role: 'speaker' })
            .eq('space_id', currentSpace.id)
            .eq('wallet_address', targetWallet),
        );

        await recountSpace(currentSpace.id);

        toast.success('Invited as speaker');
      } catch (err) {
        console.error('Error inviting speaker:', err);
        toast.error('Failed to invite speaker');
      }
    },
    [currentSpace, myRole, signed],
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
                sameWallet(updated.wallet_address, walletAddressRef.current) &&
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
            if (sameWallet(updated.wallet_address, walletAddressRef.current) && updated.status !== 'pending') {
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
              // Named and given room to be read: the room vanishing off the
              // screen is the only other signal a listener gets.
              toast.info('Stage ended', {
                description: `The host ended "${updated.title}".`,
                duration: 6000,
              });
            }
            // The room ended, so the sheet goes with it rather than sitting
            // there empty — its live view has nothing left to render.
            setIsModalOpen(false);
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
  //
  // The upcoming list rides the same channel and the same debounce. Every event
  // that changes one can change the other — scheduling inserts a row, starting
  // one moves it from scheduled to live — and a second subscription on the same
  // table would just double the traffic to learn the same thing.
  useEffect(() => {
    void refreshSpaces();
    void refreshScheduledSpaces();
    const scheduleLiveSpacesRefresh = () => {
      if (liveSpacesRefreshDebounceRef.current) clearTimeout(liveSpacesRefreshDebounceRef.current);
      liveSpacesRefreshDebounceRef.current = setTimeout(() => {
        liveSpacesRefreshDebounceRef.current = null;
        void refreshSpaces();
        void refreshScheduledSpaces();
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
  }, [refreshSpaces, refreshScheduledSpaces]);

  // Memoized: the provider re-renders on every participant/realtime event
  // while a space is live — an inline value object handed every consumer a
  // fresh reference each time, re-rendering all of them regardless of what
  // actually changed.
  const contextValue = useMemo(
    () => ({
      liveSpaces,
      scheduledSpaces,
      currentSpace,
      participants,
      handRequests,
      isLoading,
      isConnected,
      isMuted,
      myRole,
      hasRaisedHand,
      voiceEffect,
      setVoiceEffect,
      isModalOpen,
      openModal,
      closeModal,
      initialModalView,
      createSpace,
      scheduleSpace,
      startScheduledSpace,
      cancelScheduledSpace,
      refreshScheduledSpaces,
      joinSpace,
      guestListen,
      guestStopListening,
      guestSpace,
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
      screenShare,
      isScreenSharing: !!screenShare?.isLocal,
      canScreenShare,
      startScreenShare,
      stopScreenShare,
    }),
    [
      liveSpaces, scheduledSpaces, currentSpace, participants, handRequests, isLoading,
      isConnected, isMuted, myRole, hasRaisedHand, voiceEffect, setVoiceEffect,
      isModalOpen, openModal, closeModal, initialModalView, createSpace,
      scheduleSpace, startScheduledSpace, cancelScheduledSpace, refreshScheduledSpaces,
      joinSpace, guestListen, guestStopListening, guestSpace, leaveSpace, endSpace,
      toggleMute, raiseHand, lowerHand,
      approveSpeaker, removeSpeaker, inviteSpeaker, refreshSpaces, injectAudio,
      stopInject, screenShare, canScreenShare, startScreenShare, stopScreenShare,
    ],
  );

  return (
    <StageContext.Provider value={contextValue}>
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
