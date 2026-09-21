/**
 * The Podcast tab of the importer page.
 * =====================================
 * Same page as the link converter, different intake: a podcaster pastes an
 * RSS/Atom feed URL instead of a platform link, picks which episodes to
 * bring over, and each one lands as a `feed-audio` post through the same
 * quota/link-scan/mint pipeline every other import uses.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Rss } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import {
  previewPodcastFeed,
  importFromPodcast,
  type PodcastPreview,
  type PodcastEpisode,
} from '@/lib/api/dehub/podcast-import';

const CHECKBOX_CLASS =
  'h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

const MAX_PER_CALL = 20;

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PodcastImportSection() {
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();

  const [feedUrl, setFeedUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<PodcastPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ guid: string; title: string; state: 'queued' | 'skipped' }[]>([]);

  const fetchFeed = useCallback(async () => {
    if (!feedUrl.trim()) return;
    setFetching(true);
    setPreview(null);
    setSelected(new Set());
    setResults([]);
    try {
      const result = await previewPodcastFeed(feedUrl.trim());
      setPreview(result);
      const initial = new Set(
        result.episodes.filter(ep => !ep.alreadyImported).map(ep => ep.guid),
      );
      setSelected(initial);
      if (!result.episodes.length) toast.message(t('converter.podcast.emptyFeed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('converter.podcast.badFeed'));
    } finally {
      setFetching(false);
    }
  }, [feedUrl, t]);

  const toggleEpisode = (guid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!preview) return;
    const selectable = preview.episodes.filter(ep => !ep.alreadyImported);
    const allSelected = selectable.every(ep => selected.has(ep.guid));
    setSelected(allSelected ? new Set() : new Set(selectable.map(ep => ep.guid)));
  };

  const handleImport = () => {
    if (!preview) return;
    const guids = [...selected];
    if (!guids.length) return;
    if (guids.length > MAX_PER_CALL) {
      toast.error(t('converter.podcast.tooMany'));
      return;
    }
    if (!ownershipConfirmed) {
      toast.error(t('converter.errorNeedRights'));
      return;
    }
    requireAuth(async () => {
      setImporting(true);
      try {
        const res = await importFromPodcast({
          feedUrl: feedUrl.trim(),
          guids,
          ownershipConfirmed: true,
        });
        const byGuid = new Map(preview.episodes.map(ep => [ep.guid, ep] as const));
        setResults(
          res.jobs.map(job => ({
            guid: job.guid,
            title: byGuid.get(job.guid)?.title || job.guid,
            state: job.jobId ? 'queued' : 'skipped',
          })),
        );
        toast.message(t('converter.toastQueued'));
        setSelected(new Set());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('converter.errorQueueFailed'));
      } finally {
        setImporting(false);
      }
    });
  };

  const selectableCount = preview?.episodes.filter(ep => !ep.alreadyImported).length ?? 0;
  const allSelected = selectableCount > 0 && selectableCount === selected.size;

  return (
    <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
      <div className="relative">
        <Rss className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder={t('converter.podcast.feedUrlPlaceholder')}
          aria-label={t('converter.podcast.feedUrlLabel')}
          value={feedUrl}
          onChange={e => setFeedUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void fetchFeed();
          }}
          disabled={fetching}
          className="pl-10 h-[36px] bg-zinc-900 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <Button variant="glass" onClick={() => void fetchFeed()} disabled={fetching || !feedUrl.trim()}>
        {fetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {fetching ? t('converter.podcast.fetching') : t('converter.podcast.fetchFeed')}
      </Button>

      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {preview.show.image && (
              <img src={preview.show.image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{preview.show.title}</p>
              {preview.show.author && (
                <p className="text-xs text-zinc-400 truncate">
                  {t('converter.podcast.showBy', { author: preview.show.author })}
                </p>
              )}
              <p className="text-xs text-zinc-500">
                {t('converter.podcast.episodes', { count: preview.episodes.length })}
              </p>
            </div>
          </div>

          {preview.episodes.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="self-start text-xs text-white underline"
              >
                {t('converter.podcast.selectAll')}
              </button>

              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {preview.episodes.map(ep => (
                  <EpisodeRow
                    key={ep.guid}
                    episode={ep}
                    checked={selected.has(ep.guid)}
                    onToggle={() => toggleEpisode(ep.guid)}
                  />
                ))}
              </div>

              <div
                role="checkbox"
                aria-checked={ownershipConfirmed}
                tabIndex={0}
                onClick={() => setOwnershipConfirmed(v => !v)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOwnershipConfirmed(v => !v);
                  }
                }}
                className="flex items-start gap-2 text-sm text-zinc-400 cursor-pointer select-none"
              >
                <Checkbox checked={ownershipConfirmed} className={cn(CHECKBOX_CLASS, 'pointer-events-none')} />
                <span>{t('converter.ownership')}</span>
              </div>

              <Button
                variant="glass"
                onClick={handleImport}
                disabled={importing || selected.size === 0 || !ownershipConfirmed}
                className="w-full"
              >
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {importing
                  ? t('converter.podcast.importing')
                  : t('converter.podcast.importSelected', { count: selected.size })}
              </Button>
            </>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-black/20 p-3">
          {results.map(r => (
            <div key={r.guid} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-zinc-300">{r.title}</span>
              <span className={r.state === 'queued' ? 'text-emerald-400' : 'text-zinc-500'}>
                {r.state === 'queued' ? t('converter.podcast.done') : t('converter.podcast.alreadyImported')}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EpisodeRow({
  episode,
  checked,
  onToggle,
}: {
  episode: PodcastEpisode;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-disabled={episode.alreadyImported}
      tabIndex={episode.alreadyImported ? -1 : 0}
      onClick={() => !episode.alreadyImported && onToggle()}
      onKeyDown={e => {
        if (!episode.alreadyImported && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'flex items-start gap-2.5 rounded-xl bg-zinc-900 p-2.5 text-left',
        episode.alreadyImported ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <Checkbox
        checked={checked || episode.alreadyImported}
        disabled={episode.alreadyImported}
        className={cn(CHECKBOX_CLASS, 'pointer-events-none mt-0.5')}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white">{episode.title}</p>
        <p className="truncate text-xs text-zinc-500">
          {[episode.publishedAt ? new Date(episode.publishedAt).toLocaleDateString() : null, formatDuration(episode.durationSec)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {episode.alreadyImported && (
        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {t('converter.podcast.alreadyImported')}
        </span>
      )}
    </div>
  );
}
