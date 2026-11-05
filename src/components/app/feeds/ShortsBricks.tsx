/**
 * Shorts tiles + brick rows
 * =========================
 * The Shorts tab mixes tall shorts and wide videos. On phones (web, under
 * 768px) they pack into gap-free brick rows (see lib/shorts-bricks): two tall
 * videos side by side, one tall video beside three stacked wide clips, or one
 * wide video across the full width. Desktop keeps the plain 9:16 grid, and
 * its last row always fills the width.
 *
 * @module components/app/feeds/ShortsBricks
 */

import { useTranslation as _useCopy } from 'react-i18next';
import Eye from "@/components/ui/cut-icons/visibility";
import ThumbsUp from "@/components/ui/cut-icons/like";
import { AutoplayVideo } from '@/components/app/AutoplayVideo';
import { LiveShortTile } from '@/components/app/feeds/LiveShortTile';
import { cn } from '@/lib/utils';
import type { BrickRow } from '@/lib/shorts-bricks';
import type { LiveStream, ShortVideo } from '@/types/feed.types';

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Chips drawn over a video stay dark in every theme (light themes repaint
// bg-black utility classes white), so their colours are set inline.
const OVER_MEDIA_BADGE = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' } as const;
const OVER_MEDIA_CHIP = { background: 'rgba(0,0,0,0.6)', color: '#fff' } as const;

interface TileProps {
  short: ShortVideo;
  viewerOpen: boolean;
  onOpen: () => void;
  /** Size classes; defaults to a 9:16 tile. */
  className?: string;
  /** Poster only, never a playing preview (small stacked tiles). */
  still?: boolean;
}

/** A tall short: the 9:16 tile the Shorts grid has always shown. */
export function ShortTile({ short, viewerOpen, onOpen, className, still }: TileProps) {
  const { t: _copy } = _useCopy();
  return (
    <div
        data-media-tile
      data-media-scrim
      onClick={onOpen}
      className={cn("relative bg-zinc-900 rounded-xl overflow-hidden cursor-pointer group", className ?? "aspect-[9/16]")}
    >
      {/* Autoplay when 70% visible, stops when <70% visible */}
      {short.videoUrl ? (
        <AutoplayVideo
          src={short.videoUrl}
          hlsSrc={short.hlsUrl}
          poster={short.thumbnail}
          className="w-full h-full object-cover"
          disabled={viewerOpen || still}
          playbackGroup="shorts-grid"
          threshold={0.7}
          rootMargin="200px"
        />
      ) : (
        <img
          src={short.thumbnail}
          alt=""
          className="w-full h-full object-cover"
        />
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Bottom Info */}
      <div className="absolute bottom-[6px] left-2 right-2">
        <div className="flex min-w-0 items-end gap-1">
          {/* Creator Avatar */}
          <div className="w-6 h-6 rounded-[5px] bg-zinc-700 flex-shrink-0 overflow-hidden">
            {short.avatar ? (
              <img 
                src={short.avatar} 
                alt="" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <span className={`w-full h-full flex items-center justify-center text-white text-[10px] font-medium ${short.avatar ? 'hidden' : ''}`}>
              {short.username?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex min-h-6 min-w-0 flex-1 flex-col justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 break-words font-medium text-white text-[10px] leading-[11px] tracking-[-0.1px]">@{(short as ShortVideo & { handle?: string }).handle || short.creatorUsername || short.username}</span>
              {short.verified && (
                <svg className="w-[9px] h-[9px] shrink-0 text-white self-end" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-white/90 text-[9px] leading-[10px]">
              <span className="inline-flex items-center gap-0.5" aria-label={_copy("copy.e90f7c8c03b8", { defaultValue: "{{value1}} views", value1: short.views || '0' })}>
                <Eye className="w-[9px] h-[9px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
                <span>{short.views || '0'}</span>
              </span>
              <span className="inline-flex items-center gap-0.5" aria-label={_copy("copy.d4d4c7619589", { defaultValue: "{{value1}} likes", value1: short.likes })}>
                <ThumbsUp className="w-[9px] h-[9px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
                <span>{short.likes}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Play indicator on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** A wide video: 16:9 poster or preview, duration chip, views, and a title when there is room. */
export function WideShortTile({ short, viewerOpen, onOpen, className, still, hero }: TileProps & { hero?: boolean }) {
  const { t: _copy } = _useCopy();
  const seconds = (short as ShortVideo & { durationSeconds?: number }).durationSeconds ?? 0;
  const handle = (short as ShortVideo & { handle?: string }).handle || short.creatorUsername || short.username;
  return (
    <div
      data-media-tile
      data-media-scrim
      data-short-shape="wide"
      onClick={onOpen}
      className={cn("relative bg-zinc-900 rounded-xl overflow-hidden cursor-pointer", className)}
    >
      {/* Media sits absolutely so the tile takes its size from the row, never from the poster. */}
      <div className="absolute inset-0">
        {short.videoUrl && !still ? (
          <AutoplayVideo
            src={short.videoUrl}
            hlsSrc={short.hlsUrl}
            poster={short.thumbnail}
            className="w-full h-full object-cover"
            disabled={viewerOpen}
            playbackGroup="shorts-grid"
            threshold={0.7}
            rootMargin="200px"
          />
        ) : (
          <img src={short.thumbnail} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
      {/* Wide badge: tells a wide clip from a short at a glance */}
      <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md backdrop-blur-md" style={OVER_MEDIA_BADGE}>
        <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth={2.4}><rect x="2" y="6" width="20" height="12" rx="2" /></svg>
      </span>
      <div className="absolute bottom-[6px] left-2 right-12 min-w-0 text-white">
        {hero && short.title ? (
          <p className="truncate text-[12px] font-semibold leading-[15px]">{short.title}</p>
        ) : null}
        <p className="truncate text-[9px] leading-[11px] text-white/90" aria-label={_copy("copy.e90f7c8c03b8", { defaultValue: "{{value1}} views", value1: short.views || '0' })}>
          {hero ? `@${handle} · ` : ''}
          <Eye className="mr-0.5 inline h-[9px] w-[9px] align-[-1px]" strokeWidth={1.6} aria-hidden="true" />
          {short.views || '0'}
        </p>
      </div>
      {seconds > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold tabular-nums" style={OVER_MEDIA_CHIP}>
          {formatDuration(seconds)}
        </span>
      )}
    </div>
  );
}

/**
 * Close a part-filled last row in a 9:16 grid by letting its last tile spread
 * across the empty columns. Selectors count what is really rendered, so a live
 * tile that renders nothing still leaves no hole.
 */
export const FILL_LAST_ROW_2 = "[&>*:last-child:nth-child(odd)]:col-span-2 [&>*:last-child:nth-child(odd)]:aspect-video";
export const FILL_LAST_ROW_3 = "[&>*:last-child:nth-child(3n+1)]:col-span-3 [&>*:last-child:nth-child(3n+1)]:aspect-video [&>*:last-child:nth-child(3n+2)]:col-span-2 [&>*:last-child:nth-child(3n+2)]:aspect-auto";

interface BricksProps {
  shorts: ShortVideo[];
  rows: BrickRow<ShortVideo>[];
  live: LiveStream[];
  viewerOpen: boolean;
  onOpen: (short: ShortVideo) => void;
  onOpenLive: (streamId: string) => void;
}

export function ShortsBricks({ rows, live, viewerOpen, onOpen, onOpenLive }: BricksProps) {
  return (
    <div data-shorts-bricks className="flex flex-col gap-2">
      {live.length > 0 && (
        <div className={cn("grid grid-cols-2 gap-2", FILL_LAST_ROW_2)}>
          {live.map((stream) => (
            <LiveShortTile key={`live-${stream.id}`} stream={stream} disabled={viewerOpen} onOpen={() => onOpenLive(String(stream.id))} />
          ))}
        </div>
      )}
      {rows.map((row) => {
        if (row.kind === 'hero') {
          return <WideShortTile key={row.key} short={row.item} hero viewerOpen={viewerOpen} onOpen={() => onOpen(row.item)} className="aspect-video w-full" />;
        }
        if (row.kind === 'pair') {
          return (
            <div key={row.key} className="grid grid-cols-2 gap-2">
              {row.items.map((short) => (
                <ShortTile key={short.id} short={short} viewerOpen={viewerOpen} onOpen={() => onOpen(short)} />
              ))}
            </div>
          );
        }
        if (row.kind === 'trio') {
          return (
            <div key={row.key} className="grid grid-cols-3 gap-2">
              {row.items.map((short) => (
                <ShortTile key={short.id} short={short} viewerOpen={viewerOpen} onOpen={() => onOpen(short)} />
              ))}
            </div>
          );
        }
        if (row.kind === 'single') {
          // Only ever the one short in the list: full width, never half a row.
          return <ShortTile key={row.key} short={row.item} viewerOpen={viewerOpen} onOpen={() => onOpen(row.item)} className="aspect-video w-full" />;
        }
        const tall = <ShortTile key={row.tall.id} short={row.tall} viewerOpen={viewerOpen} onOpen={() => onOpen(row.tall)} />;
        const stack = (
          <div key="stack" className="flex h-0 min-h-full flex-col gap-2">
            {row.wides.map((short) => (
              <WideShortTile key={short.id} short={short} still viewerOpen={viewerOpen} onOpen={() => onOpen(short)} className="min-h-0 flex-1 basis-0" />
            ))}
          </div>
        );
        return (
          <div key={row.key} className="grid grid-cols-2 gap-2">
            {row.tallSide === 'left' ? <>{tall}{stack}</> : <>{stack}{tall}</>}
          </div>
        );
      })}
    </div>
  );
}
