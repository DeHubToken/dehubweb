/**
 * Schedule Stage Panel
 * ====================
 * The "later" half of the create view: announce a stage now, host it at a set
 * time. Lives in its own file because the create view already carries the
 * go-live-now path and AudioSpacesModal is long enough.
 *
 * Scheduling deliberately does NOT publish a post. Publishing on DeHub is an
 * on-chain mint from the user's wallet, so firing one as a side effect of
 * filling in a form would spend gas the host never agreed to. Instead the
 * stage is saved first, and the success state hands them the normal composer
 * pre-filled with the link — they get the usual review-and-confirm, and can
 * skip posting entirely without losing the stage.
 */

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Loader2, ImagePlus, X, Check, Copy, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useStage } from '@/contexts/StageContext';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { supabase } from '@/integrations/supabase/client';
import { dehubLinkFor } from '@/lib/dehub-links';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';

/** 8 MB — a cover is decoration, not an upload feature. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** `datetime-local`-style value for an input, in the user's own timezone. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleStagePanel({
  title,
  setTitle,
  description,
  setDescription,
  onDone,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  onDone: () => void;
}) {
  const { scheduleSpace, isLoading } = useStage();
  const { openPostModal } = useGlobalDropZone();

  // Default to the next round half-hour an hour out — far enough ahead to be
  // plausible, close enough that most hosts only adjust the time.
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
    return toLocalInputValue(d);
  });

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scheduled, setScheduled] = useState<AudioSpace | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('That file is not an image');
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      toast.error('Cover must be under 8 MB');
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const clearCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startsAt = when ? new Date(when) : null;
  const isValidTime = !!startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now();
  const canSubmit = !!title.trim() && isValidTime && !isLoading && !uploading;

  const handleSchedule = async () => {
    if (!canSubmit || !startsAt) return;

    let coverImageUrl: string | null = null;
    if (coverFile) {
      setUploading(true);
      try {
        const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        // Timestamped path: storage RLS here is insert-only by design, so a
        // unique name is what keeps one upload from clobbering another.
        const path = `stages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('community-media')
          .upload(path, coverFile, { cacheControl: '31536000' });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('community-media').getPublicUrl(path);
        coverImageUrl = urlData.publicUrl;
      } catch (err) {
        console.error('[Stage] Cover upload failed:', err);
        // A failed graphic must not cost the host the stage — carry on without
        // it and say so, rather than throwing the whole form away.
        toast.error('Cover image failed to upload — scheduling without it');
      } finally {
        setUploading(false);
      }
    }

    const space = await scheduleSpace({
      title: title.trim(),
      description: description.trim() || undefined,
      scheduledAt: startsAt.toISOString(),
      coverImageUrl,
    });

    if (space) {
      setScheduled(space);
      toast.success('Stage scheduled');
    }
  };

  // ── Success state ────────────────────────────────────────────────────────

  if (scheduled) {
    const link = dehubLinkFor.stage(scheduled.id);
    const at = scheduled.scheduled_at ? new Date(scheduled.scheduled_at) : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center gap-2 py-2">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <Check className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-white font-semibold">Stage scheduled</h3>
          {at && (
            <p className="text-sm text-white/60">{format(at, 'EEEE, d MMMM · h:mm a')}</p>
          )}
          <p className="text-xs text-white/40 max-w-[280px]">
            It's on the Upcoming shelf now. Share the link and it opens as a card
            wherever you paste it.
          </p>
        </div>

        <Button
          onClick={() => {
            // Pre-filled, not published: the composer still asks for the mint.
            openPostModal(
              at
                ? `🎙️ ${scheduled.title} — live on Stages ${format(at, 'EEE d MMM, h:mm a')}\n\n${link}`
                : `🎙️ ${scheduled.title} — live on Stages\n\n${link}`,
            );
            onDone();
          }}
          className="w-full bg-white text-black hover:bg-white/90 border-0 rounded-xl"
        >
          <Send className="w-4 h-4 mr-2" />
          Post about it
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(link).then(
              () => toast.success('Link copied'),
              () => toast.error('Could not copy link'),
            );
          }}
          className="w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy link
        </Button>

        <Button
          variant="ghost"
          onClick={onDone}
          className="w-full text-white/40 hover:text-white hover:bg-white/10 rounded-xl"
        >
          Done
        </Button>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  return (
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
          rows={2}
          maxLength={280}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/60 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Starts at *
        </label>
        <Input
          type="datetime-local"
          value={when}
          min={toLocalInputValue(new Date())}
          onChange={(e) => setWhen(e.target.value)}
          className="bg-white/10 border-white/10 text-white rounded-xl [color-scheme:dark]"
        />
        {when && !isValidTime && (
          <p className="text-xs text-red-400">Pick a time in the future.</p>
        )}
      </div>

      {/* Cover graphic */}
      <div className="space-y-2">
        <label className="text-sm text-white/60">Cover graphic (optional)</label>
        {coverPreview ? (
          <div className="relative rounded-xl overflow-hidden border border-white/10">
            <img src={coverPreview} alt="Stage cover preview" className="w-full h-28 object-cover" />
            {/* The same scrim the card and the live room use, so what the host
                sees here is what the graphic will actually look like in use. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/50" />
            <div className="absolute inset-0 flex items-end p-3">
              <span className="text-white text-sm font-semibold line-clamp-1">
                {title.trim() || 'Your stage title'}
              </span>
            </div>
            <button
              type="button"
              onClick={clearCover}
              aria-label="Remove cover graphic"
              className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'w-full h-20 rounded-xl border border-dashed border-white/15',
              'flex flex-col items-center justify-center gap-1',
              'text-white/40 hover:text-white/70 hover:border-white/30 transition-colors',
            )}
          >
            <ImagePlus className="w-5 h-5" />
            <span className="text-xs">Add a graphic</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverChange}
          className="hidden"
        />
      </div>

      <Button
        onClick={handleSchedule}
        disabled={!canSubmit}
        className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl"
      >
        {isLoading || uploading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Calendar className="w-4 h-4 mr-2" />
        )}
        {uploading ? 'Uploading cover...' : 'Schedule stage'}
      </Button>
    </div>
  );
}
