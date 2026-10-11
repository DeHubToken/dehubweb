import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Segment Marker Drawer
 * =====================
 * Where a viewer marks the sponsor read they just sat through, and where the
 * marks other people left are shown and voted on.
 *
 * The video keeps playing underneath, which is the whole design: you catch the
 * start, tap Start, let it run to the end of the read, tap End. Typing
 * timestamps into boxes would be more precise and nobody would ever do it.
 *
 * @module components/app/cards/SegmentMarkerDrawer
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AppState } from '@/components/app/AppState';
import { useAuth } from '@/contexts/AuthContext';
import { useSegmentActions, useVideoSegments } from '@/hooks/use-video-segments';
import { SEGMENT_CATEGORIES, SEGMENT_LABELS, type SegmentCategory } from '@/lib/api/video-segments';

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

interface SegmentMarkerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string;
  /** Reads the player's clock at the moment a button is tapped. */
  getCurrentTime: () => number;
}

export function SegmentMarkerDrawer({ open, onOpenChange, tokenId, getCurrentTime }: SegmentMarkerDrawerProps) {
  const { t: _copy } = _useCopy();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  // Always fetched while the drawer is open, whatever the skip preference —
  // this is the screen where the marks are the point.
  const { segments, isLoading } = useVideoSegments(tokenId, open);
  const { submit, vote, remove } = useSegmentActions(tokenId);

  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [category, setCategory] = useState<SegmentCategory>('sponsor');

  // A fresh drawer is a fresh mark; keeping the last one would submit a range
  // from a video the viewer has already scrolled past.
  useEffect(() => {
    if (!open) {
      setStart(null);
      setEnd(null);
      setCategory('sponsor');
    }
  }, [open]);

  const canSubmit = start !== null && end !== null && end > start && !submit.isPending;

  const handleSubmit = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (start === null || end === null) return;
    submit.mutate(
      { category, startSeconds: start, endSeconds: end },
      { onSuccess: () => { setStart(null); setEnd(null); } },
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* No overlay dim and no modal lock: the point is to watch the video
          underneath while marking where the sponsor read ends. */}
      <DrawerContent scrollable column glass className="px-4 pb-6">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-white text-lg">{_copy("copy.30f4d96b8d72", { defaultValue: "Skippable sections" })}</DrawerTitle>
        </DrawerHeader>

        <p className="text-xs text-zinc-500 mb-3">{_copy("copy.b5f85f952b0b", { defaultValue: "Mark a sponsor read or intro and everyone with skipping on jumps past it. Let the video run — tap Start when it begins and End when it stops." })}</p>

        {/* Mark */}
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { const t = getCurrentTime(); setStart(t); if (end !== null && end <= t) setEnd(null); }}
              className="flex-1 h-9 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700"
            >
              {start === null ? _copy("copy.e4bb9f1ece9a", { defaultValue: "Start" }) : _copy("copy.5e2495b60820", { defaultValue: "Start {{value1}}", value1: clock(start) })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={start === null}
              onClick={() => setEnd(getCurrentTime())}
              className="flex-1 h-9 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              {end === null ? _copy("copy.f4db1e48476f", { defaultValue: "End" }) : _copy("copy.78de1ed22dcb", { defaultValue: "End {{value1}}", value1: clock(end) })}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SEGMENT_CATEGORIES.map((value) => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  category === value
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                )}
              >
                {SEGMENT_LABELS[value]}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full h-9 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-40"
          >
            {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              start !== null && end !== null ? _copy("copy.5218ce9ed7ab", { defaultValue: "Submit {{value1}} – {{value2}}", value1: clock(start), value2: clock(end) }) : _copy("copy.155f816c0407", { defaultValue: "Submit" })
            )}
          </Button>
        </div>

        {/* Existing */}
        <div className="mt-4 space-y-2 max-h-[40vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : segments.length === 0 ? (
            <AppState icon="videos" title={_copy("copy.e5f6facf9cbe", { defaultValue: "Nothing marked on this video yet" })} size="compact" />
          ) : (
            segments.map((segment) => {
              const isMine = !!walletAddress && segment.address.toLowerCase() === walletAddress.toLowerCase();
              return (
                <div key={segment.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {SEGMENT_LABELS[segment.category]}
                      <span className="text-zinc-500"> · {clock(segment.start_seconds)} – {clock(segment.end_seconds)}</span>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {segment.votes_up}{_copy("copy.72915d37182e", { defaultValue: " agree" })}{segment.votes_down > 0 ? _copy("copy.2f41333ad013", { defaultValue: " · {{value1}} disagree", value1: segment.votes_down }) : ''}
                    </p>
                  </div>
                  {isMine ? (
                    <button
                      onClick={() => remove.mutate(segment.id)}
                      aria-label={_copy("copy.77f3aefe8b8b", { defaultValue: "Remove your mark" })}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => isAuthenticated ? vote.mutate({ segmentId: segment.id, value: 1 }) : openLoginModal()}
                        aria-label={_copy("copy.dc469bffc7c0", { defaultValue: "This section is right" })}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => isAuthenticated ? vote.mutate({ segmentId: segment.id, value: -1 }) : openLoginModal()}
                        aria-label={_copy("copy.58db9997b230", { defaultValue: "This section is wrong" })}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!isAuthenticated && (
          <p className="mt-3 text-xs text-zinc-500 text-center">{_copy("copy.3c42f559d757", { defaultValue: "Sign in to mark or vote. Skipping works either way." })}</p>
        )}

        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="mt-3 w-full h-9 rounded-lg text-zinc-400 hover:text-white"
        >
          <Check className="w-4 h-4 mr-1" />{_copy("copy.12e9a0c0cda7", { defaultValue: " Done" })}</Button>
      </DrawerContent>
    </Drawer>
  );
}
