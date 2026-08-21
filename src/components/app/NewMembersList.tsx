/**
 * New Members List
 * ================
 * The shared body of every new-members surface: everyone who joined in the last
 * NEW_MEMBER_WINDOW_DAYS, newest first, each with a one-tap way to say hello.
 *
 * One component rather than one per surface because the two that exist today —
 * the desktop right rail and the Explore bento that carries the feature to
 * every other viewport — differ only in the chrome around them. A second copy
 * of the wave would be a second place for it to drift.
 *
 * The wave opens the DM with a greeting typed and waiting (`draftBody`), never
 * pre-sent: an identical canned message fired off unseen is the bot behaviour
 * this feature exists to avoid. Mobile's `sharedText` does the same.
 *
 * Waves are remembered per device in localStorage — a server round trip to
 * render a button label would be a poor trade, and the worst case of losing it
 * is a button that says "Wave" again on a new browser.
 *
 * @module components/app/NewMembersList
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { joinedAgoLabel, useNewMembers, type NewMember } from '@/hooks/use-new-members';

const WAVED_KEY = 'dehub_waved_at';

/** The greeting a wave drafts. Short on purpose — it is meant to be edited, not sent as-is. */
const WELCOME_MESSAGE = 'Welcome to DeHub! 👋 Give me a shout if you need anything.';

function readWaved(): Set<string> {
  try {
    const raw = localStorage.getItem(WAVED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function rememberWave(address: string, current: Set<string>): Set<string> {
  const next = new Set(current);
  next.add(address.toLowerCase());
  try {
    localStorage.setItem(WAVED_KEY, JSON.stringify([...next]));
  } catch {
    // Private-mode storage failure only costs the label, not the wave.
  }
  return next;
}

interface NewMembersListProps {
  limit?: number;
  /** Extra classes on the scrolling container — the only per-surface difference. */
  listClassName?: string;
}

export function NewMembersList({ limit = 30, listClassName }: NewMembersListProps) {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { data: members = [], isLoading, error } = useNewMembers(limit, walletAddress);
  const [waved, setWaved] = useState<Set<string>>(readWaved);

  const openProfile = useCallback((member: NewMember) => {
    navigate(`/${member.username || member.address}`);
  }, [navigate]);

  const handleWave = useCallback((e: React.MouseEvent, member: NewMember) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setWaved((prev) => rememberWave(member.address, prev));
    navigate('/app/messages', {
      state: {
        openDmWith: member.address,
        username: member.username || undefined,
        draftBody: WELCOME_MESSAGE,
      },
    });
  }, [isAuthenticated, navigate, openLoginModal]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <Sparkles className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">
          {error ? 'Failed to load new members' : 'Nobody new this month — yet'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', listClassName)}>
      {members.map((member) => {
        const hasWaved = waved.has(member.address.toLowerCase());
        return (
          <div
            key={member.address}
            onClick={() => openProfile(member)}
            className="flex items-center gap-3 py-2 px-4 rounded-xl hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <div className="flex-shrink-0">
              <Avatar className="w-10 h-10">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                <AvatarFallback className="bg-zinc-700 text-white font-medium">
                  {member.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* pr-3 only when a badge actually draws — see BadgedName's gutter note. */}
              <span className={`relative inline-flex items-baseline shrink min-w-0 max-w-full${getBadgeUrl(member.badgeBalance, member.username) ? ' pr-3' : ''}`}>
                <span className="font-semibold text-white text-sm truncate">{member.displayName}</span>
                <BadgeIcon
                  badgeBalance={member.badgeBalance}
                  username={member.username}
                  className="w-[9px] h-[9px] absolute -top-0.5 right-0"
                />
              </span>
              <p className="text-zinc-500 text-xs truncate">joined {joinedAgoLabel(member.joinedAt)}</p>
            </div>
            <button
              onClick={(e) => handleWave(e, member)}
              className={`h-6 min-w-0 w-auto px-2.5 text-[11px] font-semibold rounded-lg flex items-center justify-center transition-all duration-150 flex-shrink-0 ${
                hasWaved
                  ? 'bg-white/10 text-white/40'
                  : 'bg-gradient-to-br from-white/15 via-white/8 to-white/4 backdrop-blur-xl border border-white/20 text-white/70 hover:from-white/25 hover:via-white/15 hover:to-white/10 hover:border-white/40 hover:text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]'
              }`}
            >
              {hasWaved ? 'Waved' : 'Wave 👋'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
