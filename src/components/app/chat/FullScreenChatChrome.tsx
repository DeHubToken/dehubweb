import { useContext, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildAvatarUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import Search from '@/components/ui/cut-icons/search';
import Settings from '@/components/ui/cut-icons/settings-cog';
import ExitFullscreen from '@/components/ui/cut-icons/exit-fullscreen';

export type ChatChromeLook = 'a' | 'b';

/** A quiet round icon button for the chat page's top row. */
export function ChatIconButton({ label, onClick, children, className, ...rest }: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white [&>svg]:h-[17px] [&>svg]:w-[17px]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The top of the chat list at riftn.com/chat.
 *
 * A: "Chat" as a plain heading with quiet round buttons, and a slim search
 *    line under it. No box at all.
 * B: one glass pill that IS the search, with the buttons inside it.
 */
export function ChatListTop({
  look,
  title,
  search,
  searchActions,
  actions,
}: {
  look: ChatChromeLook;
  title: string;
  /** The search <input>. */
  search: ReactNode;
  /** Buttons that live inside the search field (refresh, new). */
  searchActions: ReactNode;
  /** Buttons on the top row (text size, leave full screen). */
  actions: ReactNode;
}) {
  if (look === 'b') {
    return (
      <div data-fsc-top="b" className="shrink-0 px-3 pb-2 pt-3">
        <h1 className="sr-only">{title}</h1>
        <div
          data-page-bento
          data-fsc-search-pill
          className="relative flex h-12 items-center gap-1 rounded-full bg-zinc-900 pl-4 pr-1.5"
        >
          <span data-nav-glass-backdrop aria-hidden="true" />
          <Search className="relative z-10 h-[17px] w-[17px] shrink-0 text-zinc-400" />
          <div className="relative z-10 min-w-0 flex-1">{search}</div>
          <div className="relative z-10 flex shrink-0 items-center">
            {searchActions}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/10" />
            {actions}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-fsc-top="a" className="shrink-0 px-4 pb-2 pt-4">
      <div className="flex min-h-9 items-center gap-1">
        <h1 data-fsc-title className="min-w-0 flex-1 truncate text-[24px] font-bold leading-none tracking-tight text-white">{title}</h1>
        {actions}
      </div>
      <div data-fsc-search-line data-search-surface className="relative mt-3 flex h-10 items-center rounded-full bg-white/[0.06] pl-3.5 pr-1">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">{search}</div>
        <div className="flex shrink-0 items-center">{searchActions}</div>
      </div>
    </div>
  );
}

/**
 * Bottom left of riftn.com/chat: a way home, and who is signed in.
 *
 * A: a flush bar along the bottom of the list (home square, you, settings).
 * B: a floating glass capsule (round home, you; tapping you opens a menu).
 */
export function ChatMeDock({ look }: { look: ChatChromeLook }) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  // useContext, not useAuth: the state gallery renders this without a provider.
  const user = useContext(AuthContext)?.user;
  const name = user?.displayName || user?.username || '';
  const avatarSrc = user?.address && user?.avatarImageUrl ? buildAvatarUrl(user.address, user.avatarImageUrl) : undefined;
  const homeLabel = _copy('fullscreenChat.home', { defaultValue: 'Riftn home' });
  const profileLabel = _copy('fullscreenChat.profile', { defaultValue: 'Your profile' });
  const settingsLabel = _copy('fullscreenChat.settings', { defaultValue: 'Settings' });
  const exitLabel = _copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' });

  const avatar = (size: string, round: string) => (
    <Avatar className={cn(size, round, 'shrink-0')}>
      {avatarSrc && <AvatarImage src={avatarSrc} alt="" className={cn('object-cover', round)} />}
      <AvatarFallback className={cn(round, 'bg-zinc-700 text-sm font-medium text-white')}>
        {name.charAt(0).toUpperCase() || 'U'}
      </AvatarFallback>
    </Avatar>
  );
  const nameLines = (
    <span className="flex min-w-0 flex-col text-left">
      <span className="flex min-w-0 text-[14px] font-semibold leading-tight text-white">
        <BadgedName badgeBalance={user?.badgeBalance} username={user?.username} lookupId={user?.username || user?.address}>
          {name}
        </BadgedName>
      </span>
      {user?.username && <span className="truncate text-[12px] leading-tight text-zinc-400">@{user.username}</span>}
    </span>
  );

  if (look === 'b') {
    return (
      <div data-fsc-dock="b" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6">
        <div
          data-page-bento
          data-fsc-dock-pill
          className="pointer-events-auto relative flex h-14 items-center gap-1 rounded-full bg-zinc-900 p-1.5"
        >
          <span data-nav-glass-backdrop aria-hidden="true" />
          <button
            type="button"
            data-fsc-home
            onClick={() => navigate('/app')}
            aria-label={homeLabel}
            title={homeLabel}
            className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.07] transition-colors hover:bg-white/15"
          >
            <ThemedIcon icon="home" alt="" className="h-6 w-6 object-contain" />
          </button>
          <span aria-hidden="true" className="relative z-10 mx-1 h-6 w-px bg-white/10" />
          {user ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-fsc-me
                  aria-label={profileLabel}
                  className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/[0.07]"
                >
                  {avatar('h-9 w-9', 'rounded-full')}
                  {nameLines}
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={10} className="w-60 rounded-2xl border-zinc-700 bg-zinc-900 p-1.5">
                {[
                  { label: profileLabel, icon: <ThemedIcon icon="profile" alt="" className="h-5 w-5 object-contain" />, to: '/app/profile' },
                  { label: settingsLabel, icon: <ThemedIcon icon="settings" alt="" className="h-5 w-5 object-contain" />, to: '/app/settings' },
                  { label: exitLabel, icon: <ExitFullscreen className="h-[18px] w-[18px] text-zinc-300" />, to: '/app/messages' },
                ].map((row) => (
                  <button
                    key={row.to}
                    type="button"
                    onClick={() => navigate(row.to)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] text-white transition-colors hover:bg-white/10"
                  >
                    <span className="flex h-5 w-5 items-center justify-center">{row.icon}</span>
                    {row.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div data-fsc-dock="a" className="shrink-0 border-t border-white/[0.07] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-fsc-home
          onClick={() => navigate('/app')}
          aria-label={homeLabel}
          title={homeLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] transition-colors hover:bg-white/[0.12]"
        >
          <ThemedIcon icon="home" alt="" className="h-6 w-6 object-contain" />
        </button>
        {user ? (
          <button
            type="button"
            data-fsc-me
            onClick={() => navigate('/app/profile')}
            aria-label={profileLabel}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/[0.06]"
          >
            {avatar('h-9 w-9', 'rounded-xl')}
            {nameLines}
          </button>
        ) : <span className="flex-1" />}
        <ChatIconButton label={settingsLabel} onClick={() => navigate('/app/settings')} data-fsc-settings="">
          <Settings />
        </ChatIconButton>
      </div>
    </div>
  );
}
