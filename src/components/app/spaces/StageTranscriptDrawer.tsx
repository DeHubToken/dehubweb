/**
 * StageTranscriptDrawer
 * Shows the auto-generated, speaker-labeled transcript for an ended Stage.
 * Uses speaker_map to render rich speaker headers (avatar + display name +
 * link to profile for humans, AI badge with voice/source label for AI).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2, RefreshCw, Sparkles, X, Bot, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';

interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface SpeakerMapEntry {
  type: 'ai' | 'user' | 'unknown';
  label?: string;
  source?: string;
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

function formatTs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/** Renders the speaker header chip (avatar + name + link, or AI pill). */
function SpeakerHeader({
  entry,
  fallbackIndex,
  colorClass,
  timestamp,
}: {
  entry: SpeakerMapEntry | undefined;
  fallbackIndex: number;
  colorClass: string;
  timestamp: number;
}) {
  const navigate = useNavigate();
  const isUser = entry?.type === 'user' && !!entry.wallet;
  const { data: profile } = useDeHubProfile({
    address: isUser ? entry!.wallet : undefined,
    username: undefined,
    userId: isUser ? entry!.wallet : undefined,
    enabled: isUser,
  });

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
        <span className="text-[10px] text-white/40 font-mono ml-auto">{formatTs(timestamp)}</span>
      </div>
    );
  }

  if (isUser) {
    const name = profile?.name || profile?.handle || `${entry!.wallet!.slice(0, 6)}…${entry!.wallet!.slice(-4)}`;
    const handle = profile?.handle;
    const onClick = () => {
      if (handle) navigate(`/app/profile/${handle}`);
    };
    return (
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onClick}
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
        <span className="text-[10px] text-white/40 font-mono ml-auto">{formatTs(timestamp)}</span>
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
      <span className="text-[10px] text-white/40 font-mono ml-auto">{formatTs(timestamp)}</span>
    </div>
  );
}

export function StageTranscriptDrawer({ space, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [hasRetriedLegacy, setHasRetriedLegacy] = useState(false);

  const stageId = space?.id;

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

  // Stable diarized-speaker → fallback index for unknown speakers
  const fallbackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    transcript?.segments?.forEach((s) => {
      if (!map.has(s.speaker)) map.set(s.speaker, map.size);
    });
    return map;
  }, [transcript]);

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

  // Auto-trigger transcription when the drawer opens.
  // Also auto re-runs once for legacy transcripts that have no speaker_map
  // (so old "Speaker 1 / Speaker 2" results upgrade to the new system).
  useEffect(() => {
    if (!open || !stageId || !space?.recording_url) return;
    if (transcript === undefined) return; // still loading

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
    }
  }, [open]);

  const status = transcript?.status;
  const hasRecording = !!space?.recording_url;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-white/10 max-h-[90vh] flex flex-col [&>div:first-child]:hidden">
        <DrawerHeader className="border-b-0 p-3 pb-1">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Transcript
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          {space?.title && (
            <p className="text-sm text-white/60 truncate text-left">{space.title}</p>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-hidden p-4 pt-2">
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
                <>
                  <Loader2 className="w-8 h-8 mx-auto animate-spin" />
                  <p>Preparing transcript…</p>
                </>
              )}
            </div>
          ) : status === 'processing' ? (
            <div className="text-center text-white/60 py-12 space-y-3">
              <Loader2 className="w-8 h-8 mx-auto animate-spin" />
              <p>Transcribing the stage…</p>
              <p className="text-xs text-white/40">This usually takes 10–60 seconds.</p>
            </div>
          ) : (
            <ScrollArea className="h-[60vh] pr-2">
              <div className="flex items-center justify-between mb-3">
                {transcript.source_language && (
                  <p className="text-[10px] uppercase tracking-wider text-white/40">
                    Detected language: {transcript.source_language}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleTranscribe(false, true)}
                  disabled={requesting}
                  className="ml-auto rounded-lg text-white/60 hover:bg-white/10 h-7 text-[11px]"
                >
                  {requesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Re-run
                </Button>
              </div>
              <div className="space-y-3">
                {transcript.segments?.length ? (
                  transcript.segments.map((seg, i) => {
                    const idx = fallbackIndexMap.get(seg.speaker) ?? 0;
                    const entry = transcript.speaker_map?.[seg.speaker];
                    return (
                      <div
                        key={i}
                        className="bg-white/5 border border-white/10 rounded-xl p-3"
                      >
                        <SpeakerHeader
                          entry={entry}
                          fallbackIndex={idx}
                          colorClass={speakerColors[idx % speakerColors.length]}
                          timestamp={seg.start}
                        />
                        <p className="text-sm text-white/90 leading-relaxed">{seg.text}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-white/60 whitespace-pre-wrap">
                    {transcript.full_text}
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
