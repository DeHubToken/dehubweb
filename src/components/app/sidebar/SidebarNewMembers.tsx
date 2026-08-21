/**
 * Sidebar — New Members
 * =====================
 * The fourth right-rail tab: everyone who joined in the last 30 days, newest
 * first, each with a one-tap way to say hello.
 *
 * The wave is the point of the whole feature, so it is one click and it
 * actually sends: `openDmWith` + `autoSendBody` is the same path ShareToDmModal
 * uses, so the fee flow and the "who is this person" lookup on MessagesPage are
 * already handled. Waves are remembered per device in localStorage — a server
 * round trip to render a button label would be a poor trade, and the worst case
 * of losing it is a button that says "Wave" again on a new browser.
 *
 * @module components/app/sidebar/SidebarNewMembers
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useAuth } from '@/contexts/AuthContext';
import { joinedAgoLabel, useNewMembers, type NewMember } from '@/hooks/use-new-members';

const WAVED_KEY = 'dehub_waved_at';

/** The message a wave sends. Short on purpose — it should read as a person, not a bot. */
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
    // Private-mode storage failure just costs the label, not the wave.
  }
  return next;
}

export function SidebarNewMembers() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { data: members = [], isLoading, error } = useNewMembers(30, walletAddress);
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
        autoSendBody: WELCOME_MESSAGE,
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
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-white font-semibold text-sm">New members</h3>
        <p className="text-zinc-500 text-xs">Just joined — say hello</p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {members.map((member) => {
          const hasWaved = waved.has(member.address.toLowerCase());
          return (
            <div
              key={member.address}
              onClick={() => openProfile(member)}
              className="flex items-center gap-3 py-2 px-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
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
    </div>
  );
}
