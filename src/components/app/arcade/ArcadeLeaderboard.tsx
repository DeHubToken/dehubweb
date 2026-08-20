/**
 * One board, either kind.
 * =======================
 * The arcade has two leaderboards that are nothing alike underneath — an Elo
 * ladder derived from refereed chess matches, and a run board of best attempts
 * at a brawler — and exactly alike on screen: rank, player, figure, what the
 * figure was made of. `lib/api/arcade-leaderboard` normalises both to
 * {@link ArcadeBoardRow}, so this component knows about neither game.
 *
 * Which board a game has, and what its figure is called, comes from the
 * registry (`config/arcade-games`). A game with no `leaderboard` entry renders
 * nothing at all rather than an empty board — three of the five are worlds to
 * walk around in, and ranking a walk would be inventing a competition.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { profileAvatar, profileName, useWalletProfiles } from '@/hooks/use-wallet-profiles';
import type { DeHubUser } from '@/lib/api/dehub/types';
import { fetchChessLadder, fetchRunBoard, type ArcadeBoardRow } from '@/lib/api/arcade-leaderboard';
import { getArcadeGame } from '@/config/arcade-games';
import { cn } from '@/lib/utils';

/** Gold, silver, bronze, then nothing — the rank chip's colour. */
const PODIUM = ['text-amber-300', 'text-zinc-300', 'text-amber-600'];

function BoardRow({
  row,
  rank,
  mine,
  profile,
}: {
  row: ArcadeBoardRow;
  rank: number;
  mine: boolean;
  profile?: DeHubUser;
}) {
  const name = profileName(profile, row.wallet);
  const avatarUrl = profileAvatar(profile, row.wallet);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2',
        mine ? 'bg-white/[0.07] ring-1 ring-white/20' : 'bg-zinc-900',
      )}
    >
      <span
        className={cn(
          'w-6 shrink-0 text-center text-xs font-bold tabular-nums',
          PODIUM[rank - 1] ?? 'text-zinc-600',
        )}
      >
        {rank}
      </span>

      <Avatar className="h-8 w-8 shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-zinc-800 text-xs font-medium text-white">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white">
          {/* pr-3 reserves the badge's corner — the placement WhoToFollow uses. */}
          <span className="relative min-w-0 truncate pr-3">
            {name}
            <BadgeIcon
              badgeBalance={profile?.badgeBalance}
              username={profile?.username}
              className="absolute right-0 top-0 h-[9px] w-[9px]"
            />
          </span>
          {mine ? <span className="shrink-0 text-[10px] font-normal text-zinc-500">(you)</span> : null}
        </p>
        <p className="truncate text-[11px] text-zinc-500">{row.detail}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-white">{row.value}</p>
        {row.provisional ? (
          // Said out loud rather than hidden: a 1400 off three games and a 1400
          // off sixty are not the same claim, and the board should not let the
          // first borrow the second's authority.
          <p className="text-[10px] text-zinc-600">provisional</p>
        ) : null}
      </div>
    </div>
  );
}

export function ArcadeLeaderboard({
  slug,
  wallet,
  limit = 10,
  className,
}: {
  slug: string;
  /** The signed-in player, lowercased, so their own row can be marked. */
  wallet?: string | null;
  limit?: number;
  className?: string;
}) {
  const game = getArcadeGame(slug);
  const board = game?.leaderboard;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['arcade-board', slug, limit],
    queryFn: () => (board?.kind === 'ladder' ? fetchChessLadder(limit) : fetchRunBoard(slug, limit)),
    enabled: Boolean(board),
    // The chess ladder replays every finished match on each call, and neither
    // board changes between one player's runs. A minute of staleness costs
    // nothing and saves the replay.
    staleTime: 60_000,
  });

  // One enrichment pass for the whole board rather than one per row: the rows
  // are a list of addresses and the profiles are a list of people, and the
  // hook keys on the address alone so a player already fetched by the lobby
  // costs nothing here.
  const wallets = useMemo(() => rows.map((row) => row.wallet), [rows]);
  const profiles = useWalletProfiles(wallets);

  if (!game || !board) return null;

  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 shrink-0 text-zinc-500" />
        <h3 className="text-sm font-semibold text-white">{board.valueLabel}</h3>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{board.blurb}</p>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-900" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-zinc-900 px-4 py-6 text-center text-xs text-zinc-500">
          {board.emptyLine}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <BoardRow
              key={row.wallet}
              row={row}
              rank={index + 1}
              mine={Boolean(wallet) && row.wallet === wallet}
              profile={profiles[row.wallet]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
