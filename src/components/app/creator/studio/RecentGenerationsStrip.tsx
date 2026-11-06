import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Box, FileText } from 'lucide-react';
import Music2 from '@/components/ui/cut-icons/music';
import { Skeleton } from '@/components/ui/skeleton';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';

/**
 * One sideways-scrolling row of the creator's latest generations, directly
 * under the composer, so a run in progress and the last few results are in
 * view without scrolling past the showcases to the full library.
 *
 * Reads the same store as the library, so it updates live: a new job lands at
 * the front as a skeleton and fills in when it finishes. Tapping a tile opens
 * the library's viewer (it lives in ResultsFeed, further down the page).
 */

/** Enough to fill a wide screen twice over; the full library is below. */
const MAX_TILES = 30;

/** "w:h" to a CSS aspect-ratio, kept between portrait and wide so the row stays tidy. */
function tileAspect(aspect: string): string {
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return '1 / 1';
  const ratio = Math.min(Math.max(w / h, 9 / 16), 16 / 9);
  return `${ratio}`;
}

export const RecentGenerationsStrip = memo(function RecentGenerationsStrip() {
  const { t } = useTranslation();
  const jobs = useGenerationStore((s) => s.jobs);
  const focus = useGenerationStore((s) => s.focus);
  const visible = jobs.filter((job) => !job.hidden).slice(0, MAX_TILES);

  if (visible.length === 0) return null;

  return (
    <section aria-label={t('creator.yourGenerations')} className="mt-3">
      <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-4 sm:px-4 [&::-webkit-scrollbar]:hidden">
        {visible.map((job) => (
          <li key={job.id} className="shrink-0">
            <StripTile job={job} onOpen={focus} />
          </li>
        ))}
      </ul>
    </section>
  );
});

const StripTile = memo(function StripTile({ job, onOpen }: { job: GenerationJob; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const style = { aspectRatio: tileAspect(job.aspect) };
  const tile = 'relative block h-24 overflow-hidden rounded-xl border border-white/10 sm:h-28';

  if (job.status === 'running') {
    return (
      <div style={style} className={tile} aria-busy="true" title={job.prompt}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="absolute inset-x-0 bottom-0 truncate px-2 pb-1.5 text-[10px] font-medium text-white/70">
          {job.stage || t('creator.working')}
        </span>
      </div>
    );
  }

  const failed = job.status === 'failed' || job.status === 'cancelled';

  return (
    <button
      type="button"
      onClick={() => onOpen(job.id)}
      style={style}
      title={job.prompt}
      className={`${tile} bg-white/5 transition hover:border-white/30`}
    >
      {failed ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
          <AlertCircle className="h-4 w-4 text-white/45" />
          <span className="text-[10px] font-medium text-white/60">
            {t(job.status === 'cancelled' ? 'creator.cancelled' : 'creator.failed')}
          </span>
        </span>
      ) : job.kind === 'image' && job.url ? (
        <img src={job.url} alt={job.prompt || t('creator.generatedImageAlt')} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : job.kind === 'video' && job.url ? (
        <video
          src={job.url}
          poster={job.posterUrl}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
          className="h-full w-full object-cover"
        />
      ) : job.kind === 'model3d' && job.posterUrl ? (
        <img src={job.posterUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {job.kind === 'audio' ? (
            job.transcript ? <FileText className="h-5 w-5 text-white/40" /> : <Music2 className="h-5 w-5 text-white/40" />
          ) : (
            <Box className="h-5 w-5 text-white/40" />
          )}
        </span>
      )}
    </button>
  );
});
