import { useContext, useState, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildAvatarUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import Search from '@/components/ui/cut-icons/search';
import ExitFullscreen from '@/components/ui/cut-icons/exit-fullscreen';
import HomeIcon from '@/components/ui/cut-icons/home';
import ProfileIcon from '@/components/ui/cut-icons/profile';
import SettingsIcon from '@/components/ui/cut-icons/settings-cog';

/*
 * The two corners of riftn.com/chat on computers. Phones keep the page pill.
 *
 * Top left: one glass pill that is the search, with refresh, new chat, text
 * size and leave full screen inside it. No title box above the list.
 * Bottom left: a floating glass capsule with a way home and who is signed in;
 * tapping your name opens Profile, Settings and Leave full screen.
 */

/** A quiet round icon button for the chat pill. */
export function ChatIconButton({ label, onClick, children, className, ...rest }: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      data-fsc-icon-button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white [&>svg]:h-[17px] [&>svg]:w-[17px]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ChatListTop({
  title,
  search,
  searchActions,
  actions,
}: {
  title: string;
  /** The search <input>. */
  search: ReactNode;
  /** Refresh and new chat. */
  searchActions: ReactNode;
  /** Text size and leave full screen, after a divider. */
  actions: ReactNode;
}) {
  return (
    <div data-fsc-top className="shrink-0 px-3 pb-2 pt-3">
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

/** `onOpenSettings` shows settings inside the chat page instead of leaving it. */
export function ChatMeDock({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  // useContext, not useAuth: the state gallery renders this without a provider.
  const user = useContext(AuthContext)?.user;
  const [menuOpen, setMenuOpen] = useState(false);
  const name = user?.displayName || user?.username || '';
  const avatarSrc = user?.address && user?.avatarImageUrl ? buildAvatarUrl(user.address, user.avatarImageUrl) : undefined;
  const homeLabel = _copy('fullscreenChat.home', { defaultValue: 'Riftn home' });
  const profileLabel = _copy('fullscreenChat.profile', { defaultValue: 'Your profile' });
  const settingsLabel = _copy('fullscreenChat.settings', { defaultValue: 'Settings' });
  const exitLabel = _copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' });
  const menu = [
    { key: 'profile', label: profileLabel, icon: <ProfileIcon className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => navigate('/app/profile') },
    { key: 'settings', label: settingsLabel, icon: <SettingsIcon className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => (onOpenSettings ? onOpenSettings() : navigate('/app/settings?tab=messages')) },
    { key: 'exit', label: exitLabel, icon: <ExitFullscreen className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => navigate('/app/messages') },
  ];

  return (
    <div data-fsc-dock className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6">
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
          <HomeIcon className="h-[19px] w-[19px] text-zinc-200" />
        </button>
        {user ? (
          <>
            <span aria-hidden="true" className="relative z-10 mx-1 h-6 w-px bg-white/10" />
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-fsc-me
                  aria-label={profileLabel}
                  className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/[0.07]"
                >
                  <Avatar className="h-9 w-9 shrink-0 rounded-full">
                    {avatarSrc && <AvatarImage src={avatarSrc} alt="" className="rounded-full object-cover" />}
                    <AvatarFallback className="rounded-full bg-zinc-700 text-sm font-medium text-white">
                      {name.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="flex min-w-0 text-[14px] font-semibold leading-tight text-white">
                      <BadgedName badgeBalance={user.badgeBalance} username={user.username} lookupId={user.username || user.address}>
                        {name}
                      </BadgedName>
                    </span>
                    {user.username && <span className="truncate text-[12px] leading-tight text-zinc-400">@{user.username}</span>}
                  </span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </PopoverTrigger>
              <PopoverContent data-fsc-me-menu side="top" align="start" sideOffset={10} className="w-60 rounded-2xl border-zinc-700 bg-zinc-900 p-1.5">
                {menu.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => { setMenuOpen(false); row.onSelect(); }}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] text-white transition-colors hover:bg-white/10"
                  >
                    <span className="flex h-5 w-5 items-center justify-center">{row.icon}</span>
                    {row.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </>
        ) : null}
      </div>
    </div>
  );
}
