/**
 * Past Stage Card
 * ===============
 * The compact tile the "No live stages right now" fallback shows in place of
 * the live grid — the same ended-stage card a /stages/:n link turns into
 * elsewhere (see StageLinkEmbed: status badge, title, host, inline recording
 * player), just trimmed down to sit several-per-row instead of full width in
 * a feed post.
 *
 * Takes the space directly rather than fetching by id — the caller already
 * has the list (same ['past-stages'] query PastStagesList uses), so a grid of
 * these does not re-query per card the way StageLinkEmbed has to.
 */

import { useNavigate } from 'react-router-dom';
import { Clock, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BadgedName } from '@/components/app/BadgedName';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { StageHostLink } from '@/components/app/stages/StageHostLink';
import { StageRecordingPlayer } from '@/components/app/stages/StageRecordingPlayer';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace } from '@/types/audio-spaces.types';

export function PastStageCard({ space }: { space: AudioSpace }) {
  const navigate = useNavigate();
  const avatar =
    buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
    buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
  const hasCover = !!space.cover_image_url;

  return (
    <button
      onClick={() =>
        navigate(space.short_id != null ? `/stages/${space.short_id}` : `/stage/${space.id}`)
      }
      data-no-navigate
      className={cn(
        'relative w-full rounded-xl border border-white/[0.08] overflow-hidden text-left',
        'transition-colors group bg-white/[0.03] hover:bg-white/[0.06]',
        hasCover && 'hover:border-white/20',
      )}
    >
      {hasCover && <StageCoverArt src={space.cover_image_url!} title={space.title} />}

      <div className="relative p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg bg-white/10">
            <Clock className="w-3 h-3 text-zinc-400" />
            <span className="text-zinc-400 text-[10px] font-medium">ENDED</span>
          </span>
          {!!space.total_listens && (
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
              <Headphones className="w-3 h-3" />
              {space.total_listens}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-white text-sm line-clamp-2">{space.title}</h3>

        <StageHostLink
          space={space}
          avatarUrl={avatar || undefined}
          nested
          className="flex items-center gap-2 min-w-0"
        >
          <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 bg-zinc-700">
            {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
          </div>
          <BadgedName
            lookupId={space.host_username || space.host_wallet_address}
            className="text-xs text-zinc-400"
          >
            @{space.host_username || space.host_wallet_address?.slice(0, 6)}
          </BadgedName>
        </StageHostLink>

        {space.recording_url && (
          <StageRecordingPlayer
            spaceId={space.id}
            recordingUrl={space.recording_url}
            title={space.title}
            startedAt={space.started_at}
            endedAt={space.ended_at}
          />
        )}
      </div>
    </button>
  );
}

export default PastStageCard;
