/**
 * Generations panel.
 * ==================
 * Everything generated in this session, wherever it was started: the /creator
 * studio composer or the editor's own Generate tab. Both surfaces share one
 * queue, so a clip generated in the studio shows up here already, one click
 * from the timeline.
 */
import { useCallback, useState } from 'react';
import { AlertCircle, Film, ImageIcon, Loader2, Music2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { sendJobToEditor } from '@/lib/creator/sendToEditor';
import { useEditorUiStore } from '@/store/editorUiStore';
import { PanelHeading } from './DesignPanel';

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music2 } as const;

export function LibraryPanel() {
  const jobs = useGenerationStore((s) => s.jobs);
  const cancel = useGenerationStore((s) => s.cancel);
  const retry = useGenerationStore((s) => s.retry);
  const quota = useEditorQuota();
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const send = useCallback(
    async (job: GenerationJob) => {
      setSendingId(job.id);
      try {
        const id = await sendJobToEditor(job, { wallet: quota.walletAddress });
        if (id) {
          await quota.refetchUsage();
          toast.success('Added to the timeline.');
        }
      } finally {
        setSendingId(null);
      }
    },
    [quota],
  );

  const running = jobs.filter((j) => j.status === 'running');

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <PanelHeading>
        Generations{running.length > 0 ? ` (${running.length} running)` : ''}
      </PanelHeading>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/12 p-4 text-center">
          <ImageIcon className="mx-auto h-5 w-5 text-white/25" />
          <p className="mt-2 text-[13px] font-medium text-white/70">Nothing generated yet</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/40">
            Anything you make here or in the Creator studio collects in this tab.
          </p>
          <button
            type="button"
            onClick={() => setPanel('generate')}
            className="mt-3 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Generate something
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <JobTile
                job={job}
                sending={sendingId === job.id}
                onSend={() => void send(job)}
                onCancel={() => cancel(job.id)}
                onRetry={() => retry(job.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {jobs.length > 0 && (
        <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-white/40">
          Adding a generation imports it into Media and drops it on the timeline at the playhead.
        </p>
      )}
    </div>
  );
}

interface JobTileProps {
  job: GenerationJob;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
  onRetry?: () => void;
}

function JobTile({ job, sending, onSend, onCancel, onRetry }: JobTileProps) {
  const Icon = KIND_ICON[job.kind];

  if (job.status === 'running') {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-center">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
        <p className="text-[10px] font-medium text-white/70">{job.stage || 'Working'}</p>
        {/* Same guard as the studio feed: stopping the poll cannot cancel or
            refund a render that has already been paid for. */}
        <button
          type="button"
          onClick={() => {
            const ok =
              job.kind !== 'video' ||
              window.confirm(
                'Stop waiting for this render? It has already been paid for and will keep rendering, but the result will not come back to you.',
              );
            if (ok) onCancel();
          }}
          className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Stop waiting
        </button>
      </div>
    );
  }

  if (job.status !== 'done' || !job.url) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-2 text-center">
        <AlertCircle className="h-4 w-4 text-white/40" />
        <p className="text-[10px] font-medium text-white/60">
          {job.status === 'cancelled' ? 'Cancelled' : 'Failed'}
        </p>
        <p className="line-clamp-2 text-[9px] leading-snug text-white/55">{job.error}</p>
        {/* Only the polling gave up; the paid render is probably ready. */}
        {job.ticket && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-0.5 rounded-full border border-white/20 px-2 py-0.5 text-[9px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            Reconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {job.kind === 'image' ? (
        <img
          src={job.url}
          alt={job.prompt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : job.kind === 'video' ? (
        <video src={job.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Music2 className="h-5 w-5 text-white/40" />
        </span>
      )}

      <span
        data-keep-dark
        className="pointer-events-none absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 backdrop-blur"
      >
        <Icon className="h-2.5 w-2.5 text-white" />
      </span>

      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        title={`Add "${job.prompt}" to the timeline`}
        className={cn(
          'absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/90 via-black/25 to-transparent p-2 text-[10px] font-semibold text-white transition',
          'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
        )}
      >
        <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 backdrop-blur">
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {sending ? 'Adding' : 'Add to timeline'}
        </span>
      </button>
    </div>
  );
}
