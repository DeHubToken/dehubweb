/**
 * StageTranscriptDrawer — phase 2
 * ---------------------------------
 * Shows the auto-generated, speaker-labeled transcript for an ended Stage.
 * Includes:
 *  - Inline audio player (click any segment timestamp / chapter chip to seek)
 *  - AI summary + chapter chips (generated server-side by summarize-transcript)
 *  - On-demand translation (cached in stage_transcript_translations)
 *  - Search filter, copy / download .txt / .srt, share quote
 *  - Host-only: speaker rename + privacy toggle (public / members / private)
 *  - Quote-as-post on text selection (prefills composer with deep-link)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText, Loader2, RefreshCw, Sparkles, X, Bot, User, Search, Globe2, MoreHorizontal,
  Copy, Download, Share2, Pencil, Lock, Users as UsersIcon, Eye, Play, Pause, Quote,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';
import { formatTimestamp, formatTxt, formatSrt, downloadFile } from '@/lib/transcript-format';
import { useAuth } from '@/contexts/AuthContext';

interface Segment { speaker: string; text: string; start: number; end: number }
interface Chapter { title: string; start: number; end: number }

interface SpeakerMapEntry {
  type: 'ai' | 'user' | 'unknown';
  label?: string;
  source?: string;
  wallet?: string;
}

interface SpeakerOverride {
  username?: string;
  wallet?: string;
}

interface StageTranscript {
  id: string;
  stage_id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  source_language: string | null;
  full_text: string | null;
  segments: Segment[];
  speaker_map: Record<string, SpeakerMapEntry> | null;
  speaker_overrides: Record<string, SpeakerOverride> | null;
  summary: string | null;
  chapters: Chapter[] | null;
  summary_status: 'pending' | 'processing' | 'ready' | 'failed';
  privacy: 'public' | 'members' | 'private';
  error: string | null;
}

interface Translation {
  status: 'processing' | 'ready' | 'failed';
  segments: Segment[];
  summary: string | null;
  chapters: Chapter[];
  error: string | null;
}

interface Props {
  space: AudioSpace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const speakerColors = [
  'text-sky-300', 'text-emerald-300', 'text-amber-300',
  'text-pink-300', 'text-violet-300', 'text-rose-300',
];

const LANGUAGES = [
  { code: 'original', name: 'Original' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

/* ────────────────────────────── Speaker Header ────────────────────────────── */

function SpeakerHeader({
  entry,
  override,
  fallbackIndex,
  colorClass,
  timestamp,
  onSeek,
  isHost,
  onRename,
}: {
  entry: SpeakerMapEntry | undefined;
  override: SpeakerOverride | undefined;
  fallbackIndex: number;
  colorClass: string;
  timestamp: number;
  onSeek: () => void;
  isHost: boolean;
  onRename: () => void;
}) {
  const navigate = useNavigate();
  const overrideUser = override?.username;
  const isUser = !overrideUser && entry?.type === 'user' && !!entry.wallet;
  const { data: profile } = useDeHubProfile({
    address: isUser ? entry!.wallet : undefined,
    userId: isUser ? entry!.wallet : undefined,
    enabled: isUser,
  });

  const renameButton = isHost && entry?.type !== 'ai' ? (
    <button
      onClick={onRename}
      className="ml-1 p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition"
      title="Rename speaker"
    >
      <Pencil className="w-3 h-3" />
    </button>
  ) : null;

  const tsButton = (
    <button
      onClick={onSeek}
      className="text-[10px] text-white/40 hover:text-white font-mono ml-auto px-1.5 py-0.5 rounded-md hover:bg-white/10 transition"
    >
      {formatTimestamp(timestamp)}
    </button>
  );

  // Manual override (host renamed → @username)
  if (overrideUser) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="w-6 h-6 border border-white/15">
          <AvatarFallback className="bg-white/10 text-white/70 text-[10px]">
            <User className="w-3 h-3" />
          </AvatarFallback>
        </Avatar>
        <button
          onClick={() => navigate(`/app/profile/${overrideUser}`)}
          className="text-xs font-semibold text-white/90 hover:underline truncate max-w-[200px]"
        >
          @{overrideUser}
        </button>
        {renameButton}
        {tsButton}
      </div>
    );
  }

  if (entry?.type === 'ai') {
    return (
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-white/80" />
        </div>
        <span className="text-xs font-semibold text-white/90 truncate max-w-[200px]">
          {entry.label || 'AI voice'}
        </span>
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/10">
          AI
        </span>
        {tsButton}
      </div>
    );
  }

  if (isUser) {
    const name = profile?.name || profile?.handle || `${entry!.wallet!.slice(0, 6)}…${entry!.wallet!.slice(-4)}`;
    const handle = profile?.handle;
    return (
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => handle && navigate(`/app/profile/${handle}`)}
          className="flex items-center gap-2 group min-w-0"
          disabled={!handle}
        >
          <Avatar className="w-6 h-6 border border-white/15">
            <AvatarImage src={profile?.avatarUrl} />
            <AvatarFallback className="bg-white/10 text-white/70 text-[10px]">
              <User className="w-3 h-3" />
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-semibold text-white/90 group-hover:underline truncate max-w-[180px]">
            {name}
          </span>
          {handle && <span className="text-[11px] text-white/50 truncate">@{handle}</span>}
        </button>
        {renameButton}
        {tsButton}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        <User className="w-3 h-3 text-white/60" />
      </div>
      <span className={cn('text-xs font-semibold', colorClass)}>
        Speaker {fallbackIndex + 1}
      </span>
      {renameButton}
      {tsButton}
    </div>
  );
}

/* ────────────────────────────── Inline Player ────────────────────────────── */

function InlinePlayer({
  src,
  audioRef,
  currentTime,
}: {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  currentTime: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => setDuration(a.duration || 0);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('loadedmetadata', onMeta);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('loadedmetadata', onMeta);
    };
  }, [audioRef]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-white/5 backdrop-blur-[24px] border border-white/10 rounded-xl p-3 flex items-center gap-3">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Button
        size="icon"
        onClick={toggle}
        className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <div
        onClick={onSeek}
        className="flex-1 h-1.5 rounded-full bg-white/10 cursor-pointer relative overflow-hidden"
      >
        <div
          className="absolute inset-y-0 left-0 bg-white/80 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-white/60 tabular-nums">
        {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
      </span>
    </div>
  );
}

/* ────────────────────────────── Main Drawer ────────────────────────────── */

export function StageTranscriptDrawer({ space, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { walletAddress } = useDeHubAuth();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [requesting, setRequesting] = useState(false);
  const [hasRetriedLegacy, setHasRetriedLegacy] = useState(false);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<string>('original');
  const [currentTime, setCurrentTime] = useState(0);
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [quoteFor, setQuoteFor] = useState<{ seg: Segment; text: string } | null>(null);

  const stageId = space?.id;
  const isHost = !!walletAddress && !!space?.host_wallet_address &&
    walletAddress.toLowerCase() === space.host_wallet_address.toLowerCase();

  /* ────── transcript ────── */
  const { data: transcript, refetch } = useQuery<StageTranscript | null>({
    queryKey: ['stage-transcript', stageId],
    enabled: open && !!stageId,
    refetchInterval: (q) => {
      const s = (q.state.data as StageTranscript | null)?.status;
      return s === 'processing' || s === 'pending' ? 4000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_transcripts')
        .select('*')
        .eq('stage_id', stageId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StageTranscript) || null;
    },
  });

  /* ────── translation (when language !== 'original') ────── */
  const { data: translation } = useQuery<Translation | null>({
    queryKey: ['stage-transcript-translation', stageId, language],
    enabled: open && !!stageId && language !== 'original' && transcript?.status === 'ready',
    refetchInterval: (q) => {
      const s = (q.state.data as Translation | null)?.status;
      return s === 'processing' ? 3000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_transcript_translations')
        .select('status, segments, summary, chapters, error')
        .eq('stage_id', stageId!)
        .eq('language', language)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Translation) || null;
    },
  });

  // Trigger translation if not cached
  useEffect(() => {
    if (!open || !stageId || language === 'original') return;
    if (transcript?.status !== 'ready') return;
    if (translation === undefined) return;
    if (translation && (translation.status === 'ready' || translation.status === 'processing')) return;
    supabase.functions.invoke('translate-transcript', { body: { stageId, language } })
      .then(() => queryClient.invalidateQueries({ queryKey: ['stage-transcript-translation', stageId, language] }))
      .catch(() => {});
  }, [open, stageId, language, transcript?.status, translation, queryClient]);

  /* ────── realtime ────── */
  useEffect(() => {
    if (!open || !stageId) return;
    const ch = supabase
      .channel(`stage-transcript-${stageId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stage_transcripts',
        filter: `stage_id=eq.${stageId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['stage-transcript', stageId] });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stage_transcript_translations',
        filter: `stage_id=eq.${stageId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['stage-transcript-translation', stageId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, stageId, queryClient]);

  /* ────── audio current time tracking ────── */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    a.addEventListener('timeupdate', onTime);
    return () => a.removeEventListener('timeupdate', onTime);
  }, [open, transcript]);

  const handleTranscribe = async (silent = false, force = false) => {
    if (!stageId) return;
    setRequesting(true);
    try {
      const { error } = await supabase.functions.invoke('transcribe-stage', {
        body: { stageId, force },
      });
      if (error) throw error;
      if (!silent) toast.success('Transcribing — this may take a moment');
      queryClient.invalidateQueries({ queryKey: ['stage-transcript', stageId] });
      refetch();
    } catch (e) {
      if (!silent) toast.error((e as Error).message || 'Failed to start transcription');
    } finally {
      setRequesting(false);
    }
  };

  // Auto-trigger transcription on open + legacy upgrade
  useEffect(() => {
    if (!open || !stageId || !space?.recording_url) return;
    if (transcript === undefined) return;
    if (!transcript || transcript.status === 'failed') {
      handleTranscribe(true, false);
      return;
    }
    const hasMap = transcript.speaker_map && Object.keys(transcript.speaker_map).length > 0;
    if (transcript.status === 'ready' && !hasMap && !hasRetriedLegacy) {
      setHasRetriedLegacy(true);
      handleTranscribe(true, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stageId, transcript?.status, space?.recording_url, hasRetriedLegacy]);

  useEffect(() => {
    if (!open) {
      setRequesting(false);
      setHasRetriedLegacy(false);
      setSearch('');
      setLanguage('original');
      setCurrentTime(0);
      setQuoteFor(null);
      audioRef.current?.pause();
    }
  }, [open]);

  /* ────── derived data ────── */
  const status = transcript?.status;
  const hasRecording = !!space?.recording_url;

  const useTranslated = language !== 'original' && translation?.status === 'ready';
  const segments: Segment[] = useTranslated
    ? translation!.segments
    : (transcript?.segments || []);
  const summary: string | null = useTranslated ? translation!.summary : (transcript?.summary || null);
  const chapters: Chapter[] = useTranslated ? (translation!.chapters || []) : (transcript?.chapters || []);
  const overrides = transcript?.speaker_overrides || {};

  const fallbackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((s) => { if (!map.has(s.speaker)) map.set(s.speaker, map.size); });
    return map;
  }, [segments]);

  const filteredSegments = useMemo(() => {
    if (!search.trim()) return segments;
    const q = search.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, search]);

  const speakerName = (speakerId: string): string => {
    const ov = overrides[speakerId];
    if (ov?.username) return `@${ov.username}`;
    const entry = transcript?.speaker_map?.[speakerId];
    if (entry?.type === 'ai') return entry.label || 'AI';
    if (entry?.type === 'user' && entry.wallet) return `${entry.wallet.slice(0, 6)}…${entry.wallet.slice(-4)}`;
    const idx = fallbackIndexMap.get(speakerId) ?? 0;
    return `Speaker ${idx + 1}`;
  };

  /* ────── seek helpers ────── */
  const seekTo = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
    a.play().catch(() => {});
  };

  const activeSegmentIndex = useMemo(() => {
    return segments.findIndex((s) => currentTime >= s.start && currentTime < (s.end || s.start + 2));
  }, [segments, currentTime]);

  /* ────── actions ────── */
  const stageDeepLink = (t?: number) => {
    if (!stageId) return '';
    const base = `${window.location.origin}/app/spaces/${stageId}`;
    return typeof t === 'number' ? `${base}?t=${Math.floor(t)}` : base;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatTxt(segments, speakerName));
    toast.success('Transcript copied');
  };

  const handleDownloadTxt = () => {
    downloadFile(formatTxt(segments, speakerName), `stage-${stageId}.txt`);
  };

  const handleDownloadSrt = () => {
    downloadFile(formatSrt(segments, speakerName), `stage-${stageId}.srt`, 'application/x-subrip');
  };

  const handleShare = async () => {
    const url = stageDeepLink();
    await navigator.clipboard.writeText(url);
    toast.success('Stage link copied');
  };

  const handleQuoteAsPost = (seg: Segment, text: string) => {
    const quoted = `> "${text}"\n— ${speakerName(seg.speaker)} on ${space?.title || 'a stage'}\n${stageDeepLink(seg.start)}`;
    sessionStorage.setItem('composer-prefill', quoted);
    toast.success('Opening composer with your quote');
    window.dispatchEvent(new CustomEvent('open-composer', { detail: { content: quoted } }));
    setQuoteFor(null);
  };

  const handleSelectionInside = (seg: Segment) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 0) {
      setQuoteFor({ seg, text });
    }
  };

  /* ────── speaker rename ────── */
  const openRename = (speakerId: string) => {
    setRenamingFor(speakerId);
    setRenameValue(overrides[speakerId]?.username || '');
  };

  const saveRename = async () => {
    if (!renamingFor || !transcript) return;
    const username = renameValue.trim().replace(/^@/, '');
    const next = { ...overrides };
    if (username) next[renamingFor] = { username };
    else delete next[renamingFor];
    const { error } = await supabase
      .from('stage_transcripts')
      .update({ speaker_overrides: next })
      .eq('stage_id', stageId!);
    if (error) toast.error('Could not save: ' + error.message);
    else toast.success('Speaker updated');
    setRenamingFor(null);
    queryClient.invalidateQueries({ queryKey: ['stage-transcript', stageId] });
  };

  /* ────── privacy ────── */
  const setPrivacy = async (next: 'public' | 'members' | 'private') => {
    if (!stageId) return;
    const { error } = await supabase
      .from('stage_transcripts')
      .update({ privacy: next })
      .eq('stage_id', stageId);
    if (error) toast.error('Could not update privacy');
    else toast.success(`Transcript is now ${next}`);
    queryClient.invalidateQueries({ queryKey: ['stage-transcript', stageId] });
  };

  const PrivacyIcon = transcript?.privacy === 'private' ? Lock
    : transcript?.privacy === 'members' ? UsersIcon : Eye;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-white/10 max-h-[92vh] flex flex-col [&>div:first-child]:hidden">
        <DrawerHeader className="border-b-0 p-3 pb-1">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="text-white flex items-center gap-2 min-w-0">
              <FileText className="w-5 h-5 shrink-0" />
              <span className="truncate">Transcript</span>
            </DrawerTitle>
            <div className="flex items-center gap-1">
              {isHost && transcript && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg text-white/80 hover:bg-white/10 h-8 px-2"
                    >
                      <PrivacyIcon className="w-3.5 h-3.5 mr-1.5" />
                      <span className="text-xs capitalize">{transcript.privacy}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-black/80 backdrop-blur-[24px] border-white/10 text-white">
                    <DropdownMenuItem onClick={() => setPrivacy('public')}>
                      <Eye className="w-3.5 h-3.5 mr-2" /> Public
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPrivacy('members')}>
                      <UsersIcon className="w-3.5 h-3.5 mr-2" /> Members
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPrivacy('private')}>
                      <Lock className="w-3.5 h-3.5 mr-2" /> Private
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          {space?.title && (
            <p className="text-sm text-white/60 truncate text-left">{space.title}</p>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-hidden p-4 pt-2 space-y-3">
          {!hasRecording ? (
            <div className="text-center text-white/60 py-12">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No recording available for this stage.</p>
            </div>
          ) : !transcript || status === 'pending' || status === 'failed' ? (
            <div className="text-center text-white/60 py-12 space-y-4">
              {status === 'failed' ? (
                <>
                  <Sparkles className="w-10 h-10 mx-auto opacity-50" />
                  <p>Transcript unavailable{transcript?.error ? `: ${transcript.error}` : ''}</p>
                  <Button
                    onClick={() => handleTranscribe(false, true)}
                    disabled={requesting}
                    className="rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  >
                    {requesting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Retrying…</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-2" /> Try again</>
                    )}
                  </Button>
                </>
              ) : (
                <SkeletonSegments />
              )}
            </div>
          ) : status === 'processing' ? (
            <SkeletonSegments />
          ) : (
            <>
              {/* Inline player */}
              <InlinePlayer
                src={space.recording_url!}
                audioRef={audioRef}
                currentTime={currentTime}
              />

              {/* AI Summary + chapters */}
              {(summary || chapters.length > 0 || transcript.summary_status === 'processing') && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-white/80">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Summary</span>
                    {transcript.summary_status === 'processing' && (
                      <span className="text-[10px] text-white/40 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> generating…
                      </span>
                    )}
                  </div>
                  {summary && (
                    <p className="text-sm text-white/85 leading-relaxed whitespace-pre-line">
                      {summary}
                    </p>
                  )}
                  {chapters.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                      {chapters.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => seekTo(c.start)}
                          className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-white/85 transition"
                        >
                          <span className="font-mono text-white/50 mr-1.5">{formatTimestamp(c.start)}</span>
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar: search + language + actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search transcript…"
                    className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-lg"
                  />
                </div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white rounded-lg w-auto min-w-[120px] gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 opacity-70" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur-[24px] border-white/10 text-white">
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code} className="text-xs">
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-white hover:bg-white/10">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-black/80 backdrop-blur-[24px] border-white/10 text-white">
                    <DropdownMenuItem onClick={handleCopy}>
                      <Copy className="w-3.5 h-3.5 mr-2" /> Copy transcript
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadTxt}>
                      <Download className="w-3.5 h-3.5 mr-2" /> Download .txt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadSrt}>
                      <Download className="w-3.5 h-3.5 mr-2" /> Download .srt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare}>
                      <Share2 className="w-3.5 h-3.5 mr-2" /> Share stage link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {language !== 'original' && translation?.status === 'processing' && (
                <p className="text-[11px] text-white/50 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Translating…
                </p>
              )}
              {language !== 'original' && translation?.status === 'failed' && (
                <p className="text-[11px] text-rose-300/80">Translation failed. Try another language.</p>
              )}

              <ScrollArea className="h-[50vh] pr-2">
                {transcript.source_language && language === 'original' && (
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
                    Detected language: {transcript.source_language}
                  </p>
                )}
                <div className="space-y-3">
                  {filteredSegments.length ? filteredSegments.map((seg, i) => {
                    const idx = fallbackIndexMap.get(seg.speaker) ?? 0;
                    const entry = transcript.speaker_map?.[seg.speaker];
                    const ov = overrides[seg.speaker];
                    const isActive = segments[activeSegmentIndex] === seg;
                    return (
                      <div
                        key={i}
                        onMouseUp={() => handleSelectionInside(seg)}
                        className={cn(
                          'border rounded-xl p-3 transition',
                          isActive
                            ? 'bg-white/10 border-white/25'
                            : 'bg-white/5 border-white/10 hover:bg-white/[0.07]',
                        )}
                      >
                        <SpeakerHeader
                          entry={entry}
                          override={ov}
                          fallbackIndex={idx}
                          colorClass={speakerColors[idx % speakerColors.length]}
                          timestamp={seg.start}
                          onSeek={() => seekTo(seg.start)}
                          isHost={isHost}
                          onRename={() => openRename(seg.speaker)}
                        />
                        <p className="text-sm text-white/90 leading-relaxed select-text">
                          {highlightMatches(seg.text, search)}
                        </p>
                      </div>
                    );
                  }) : (
                    <p className="text-sm text-white/50 text-center py-8">
                      {search ? 'No matches' : 'No segments'}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Floating Quote-as-post button */}
        {quoteFor && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2">
            <Button
              onClick={() => handleQuoteAsPost(quoteFor.seg, quoteFor.text)}
              className="rounded-2xl bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-[24px] shadow-lg"
            >
              <Quote className="w-4 h-4 mr-2" />
              Quote as post
            </Button>
          </div>
        )}

        {/* Speaker rename popover (rendered inline so it positions near the button) */}
        {renamingFor && (
          <div
            className="absolute inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
            onClick={() => setRenamingFor(null)}
          >
            <div
              className="bg-black/80 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4 w-full max-w-xs space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-white">Rename speaker</p>
              <p className="text-xs text-white/60">
                Enter a username to label this speaker across the whole transcript.
              </p>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="@username"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-lg h-9"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  className="rounded-xl text-white/70 hover:bg-white/10 h-8 text-xs"
                  onClick={() => setRenamingFor(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/15 h-8 text-xs"
                  onClick={saveRename}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

/* ────────────────────────────── Helpers ────────────────────────────── */

function SkeletonSegments() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />
            <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-12 bg-white/5 rounded animate-pulse ml-auto" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-white/10 rounded animate-pulse" />
            <div className="h-3 bg-white/10 rounded animate-pulse w-[85%]" />
            <div className="h-3 bg-white/10 rounded animate-pulse w-[60%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function highlightMatches(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const found = lower.indexOf(ql, i);
    if (found === -1) {
      out.push(text.slice(i));
      break;
    }
    if (found > i) out.push(text.slice(i, found));
    out.push(
      <mark key={found} className="bg-white/25 text-white rounded px-0.5">
        {text.slice(found, found + q.length)}
      </mark>,
    );
    i = found + q.length;
  }
  return out;
}
