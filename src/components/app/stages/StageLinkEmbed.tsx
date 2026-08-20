/**
 * Stage Link Embed
 * ================
 * The card a /stage/:id link turns into wherever user-written text is rendered
 * — the feed, comments, DMs, community chat.
 *
 * A scheduled stage is an announcement, so the card leads with when: the day
 * and time, and how far off that is. A stage that is already live drops the
 * date entirely and becomes a join button, because by then "when" is "now" and
 * the only useful thing the card can say is that the room is open.
 *
 * The host's cover graphic, if they set one, sits above the card content at
 * its full aspect — the same aspect-video/object-contain treatment
 * StageCoverArt gives it on the stage page itself. It used to back the whole
 * card as an absolutely-positioned object-cover layer, which cropped it to
 * whatever height the text happened to make (~150px of a 16:9 graphic); art
 * designed to announce an event was mostly invisible. With the image out from
 * under the text there is no scrim either, and the card falls back to the
 * flat surface every other embed uses when there is no graphic at all.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict, isPast } from 'date-fns';
import { Calendar, Radio, Users, Clock, Headphones } from 'lucide-react';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import { BadgedName } from '@/components/app/BadgedName';
import { StageRecordingPlayer } from '@/components/app/stages/StageRecordingPlayer';
import type { AudioSpace } from '@/types/audio-spaces.types';

interface StageLinkEmbedProps {
  /** The uuid form (/stage/:id). One of the two ids must be present. */
  stageId?: string;
  /** The short numeric form (/stages/7). */
  stageShortId?: string;
  fallback?: ReactNode;
}

export function StageLinkEmbed({ stageId, stageShortId, fallback = null }: StageLinkEmbedProps) {
  const navigate = useNavigate();

  const { data: stage, isLoading } = useQuery({
    queryKey: ['stage-by-id', stageId ?? `short:${stageShortId}`],
    enabled: !!stageId || !!stageShortId,
    // A scheduled stage's only volatile field is whether it has started, and
    // the card is cheap to be a minute stale about.
    staleTime: 60_000,
    queryFn: async () => {
      const query = supabase.from('audio_spaces').select('*');
      const { data, error } = await (stageId
        ? query.eq('id', stageId)
        : query.eq('short_id', Number(stageShortId))
      ).single();
      if (error) throw error;
      return data as AudioSpace;
    },
  });

  if (isLoading) {
    return <div className="mt-2 h-36 rounded-xl bg-white/[0.04] animate-pulse" />;
  }

  // Deleted, cancelled, or simply not ours to read — the fallback chip keeps
  // the link in the message rather than swallowing it.
  if (!stage) return <>{fallback}</>;

  const isLive = stage.status === 'live';
  const isEnded = stage.status === 'ended';
  const startsAt = stage.scheduled_at ? new Date(stage.scheduled_at) : null;
  const isOverdue = !!startsAt && isPast(startsAt);

  const avatar =
    buildAvatarUrl(stage.host_wallet_address || '', stage.host_avatar) ||
    buildAvatarCdnFallbackUrl(stage.host_wallet_address || '');

  const hasCover = !!stage.cover_image_url;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(stage.short_id != null ? `/stages/${stage.short_id}` : `/stage/${stage.id}`);
      }}
      data-no-navigate
      className={cn(
        'relative w-full mt-2 rounded-xl border border-white/[0.08] overflow-hidden text-left',
        'transition-colors group bg-white/[0.03] hover:bg-white/[0.06]',
        hasCover && 'hover:border-white/20',
      )}
    >
      {/* Cover graphic, whole and uncropped — the same aspect-video +
          object-contain treatment StageCoverArt uses on the stage page.
          aria-hidden because the heading below already names the stage. */}
      {hasCover && (
        <div aria-hidden className="w-full aspect-video bg-black">
          <img
            src={stage.cover_image_url!}
            alt=""
            loading="lazy"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="relative p-3.5 space-y-2">
        {/* Status line */}
        <div className="flex items-center justify-between gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-red-400 text-[11px] font-medium">LIVE NOW</span>
            </span>
          ) : isEnded ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span className="text-zinc-400 text-[11px] font-medium">ENDED</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10">
              <Calendar className="w-3 h-3 text-zinc-300" />
              <span className="text-zinc-300 text-[11px] font-medium">
                {isOverdue ? 'STARTING SOON' : 'UPCOMING STAGE'}
              </span>
            </span>
          )}

          {isLive && (
            <span className="flex items-center gap-1 text-zinc-400 text-xs">
              <Users className="w-3.5 h-3.5" />
              {Math.max(1, (stage.speaker_count || 1) + (stage.listener_count || 0))}
            </span>
          )}

          {/* An ended stage's headcount is zero — the room emptied. What it
              has instead is a listen count, which keeps climbing. */}
          {isEnded && !!stage.total_listens && (
            <span className="flex items-center gap-1 text-zinc-400 text-xs">
              <Headphones className="w-3.5 h-3.5" />
              {stage.total_listens}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-white text-sm line-clamp-2">{stage.title}</h3>

        {/* When. A live stage has already answered this, and an ended one has
            nothing to answer. */}
        {!isLive && !isEnded && startsAt && (
          <p className="text-xs text-zinc-300 flex items-center gap-1.5">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{format(startsAt, 'EEE, MMM d · h:mm a')}</span>
            {!isOverdue && (
              <span className="text-zinc-500">
                · in {formatDistanceToNowStrict(startsAt)}
              </span>
            )}
          </p>
        )}

        {stage.description && (
          <p className="text-xs text-zinc-400 line-clamp-2">{stage.description}</p>
        )}

        {/* Host + CTA */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 bg-zinc-700">
              {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <BadgedName
              lookupId={stage.host_username || stage.host_wallet_address}
              className="text-xs text-zinc-400"
            >
              @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
            </BadgedName>
          </div>

          {/* A recorded stage gets the player below instead: a chip in this
              slot has nowhere to put a scrub bar, and the whole point of a
              post about a stage that already happened is to hear it. */}
          {!(isEnded && stage.recording_url) && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium shrink-0',
                'transition-colors',
                isLive
                  ? 'bg-white text-black group-hover:bg-white/90'
                  : 'bg-white/10 text-white group-hover:bg-white/20',
              )}
            >
              <Radio className="w-3 h-3" />
              {isLive ? 'Join' : isEnded ? 'Listen back' : 'View stage'}
            </span>
          )}
        </div>

        {/* The card still opens the stage's own page; this plays the recording
            in place, seekable, with the pop-out control that carries it into
            the corner if you want to keep listening while you scroll. */}
        {isEnded && stage.recording_url && (
          <StageRecordingPlayer
            spaceId={stage.id}
            recordingUrl={stage.recording_url}
            title={stage.title}
            startedAt={stage.started_at}
            endedAt={stage.ended_at}
          />
        )}
      </div>
    </button>
  );
}
