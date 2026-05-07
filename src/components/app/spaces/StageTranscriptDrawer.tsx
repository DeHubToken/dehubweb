/**
 * StageTranscriptDrawer
 * Shows the auto-generated, speaker-labeled transcript for an ended Stage.
 * Hosts can trigger transcription if it doesn't yet exist.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';

interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface StageTranscript {
  id: string;
  stage_id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  source_language: string | null;
  full_text: string | null;
  segments: Segment[];
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

export function StageTranscriptDrawer({ space, open, onOpenChange }: Props) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);

  const stageId = space?.id;
  const isHost = !!(
    walletAddress &&
    space?.host_wallet_address &&
    walletAddress.toLowerCase() === space.host_wallet_address.toLowerCase()
  );

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

  // Map speaker IDs to a stable index/colour
  const speakerMap = useMemo(() => {
    const map = new Map<string, number>();
    transcript?.segments?.forEach((s) => {
      if (!map.has(s.speaker)) map.set(s.speaker, map.size);
    });
    return map;
  }, [transcript]);

  const handleTranscribe = async () => {
    if (!stageId || !walletAddress) return;
    setRequesting(true);
    try {
      const { error } = await supabase.functions.invoke('transcribe-stage', {
        body: { stageId },
        headers: { 'x-wallet-address': walletAddress.toLowerCase() },
      });
      if (error) throw error;
      toast.success('Transcribing — this may take a moment');
      queryClient.invalidateQueries({ queryKey: ['stage-transcript', stageId] });
      refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start transcription');
    } finally {
      setRequesting(false);
    }
  };

  useEffect(() => {
    if (!open) setRequesting(false);
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
              <Sparkles className="w-10 h-10 mx-auto opacity-50" />
              <p>
                {status === 'failed'
                  ? `Transcription failed${transcript?.error ? `: ${transcript.error}` : ''}`
                  : 'No transcript yet for this stage.'}
              </p>
              {isHost ? (
                <Button
                  onClick={handleTranscribe}
                  disabled={requesting}
                  className="rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
                >
                  {requesting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</>
                  ) : status === 'failed' ? (
                    <><RefreshCw className="w-4 h-4 mr-2" /> Try again</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generate transcript</>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-white/40">Only the host can generate a transcript.</p>
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
              {transcript.source_language && (
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
                  Detected language: {transcript.source_language}
                </p>
              )}
              <div className="space-y-3">
                {transcript.segments?.length ? (
                  transcript.segments.map((seg, i) => {
                    const idx = speakerMap.get(seg.speaker) ?? 0;
                    return (
                      <div
                        key={i}
                        className="bg-white/5 border border-white/10 rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn('text-xs font-semibold', speakerColors[idx % speakerColors.length])}>
                            Speaker {idx + 1}
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">
                            {formatTs(seg.start)}
                          </span>
                        </div>
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
