import { useTranslation as _useCopy } from 'react-i18next';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStableNavigate } from '@/hooks/use-stable-navigate';
import { useQuery } from '@tanstack/react-query';
import Search from '@/components/ui/cut-icons/search';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgedName } from '@/components/app/BadgedName';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { searchUsers } from '@/lib/api/dehub/users';
import type { DeHubUser } from '@/lib/api/dehub/types';
import { buildAvatarUrl } from '@/lib/media-url';
import { ASSISTANT_AVATAR, isAssistantAddress } from '@/lib/assistant';
import { cn } from '@/lib/utils';

/** How many people the dropdown lists. */
export const PEOPLE_DROPDOWN_LIMIT = 6;

export interface PeopleMatch {
  address: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  badgeBalance?: number;
  badgeLock?: DeHubUser['badgeLock'];
}

/**
 * The public users_search endpoint already ranks best match first (exact
 * username, people you tagged, people you follow, then the most active), so
 * the dropdown keeps its order and only trims it.
 */
export function toPeopleMatches(users: DeHubUser[] | undefined): PeopleMatch[] {
  const out: PeopleMatch[] = [];
  const seen = new Set<string>();
  for (const u of users ?? []) {
    const username = (u.username || '').trim();
    const address = (u.address || u.wallet_address || '').toLowerCase();
    if (!username || seen.has(username.toLowerCase())) continue;
    seen.add(username.toLowerCase());
    out.push({
      address,
      username,
      displayName: (u.displayName || '').trim(),
      avatarUrl: isAssistantAddress(address)
        ? ASSISTANT_AVATAR
        : buildAvatarUrl(address, u.avatarImageUrl) || null,
      badgeBalance: u.badgeBalance,
      badgeLock: u.badgeLock,
    });
    if (out.length === PEOPLE_DROPDOWN_LIMIT) break;
  }
  return out;
}

/**
 * Desktop right-rail search: typing shows the closest people under the box.
 * Arrow keys pick a person, Enter opens their profile (or the full search
 * when nobody is picked), Escape closes the list.
 */
export function DesktopPeopleSearch({ compact }: { compact?: boolean }) {
  const { t: _copy } = _useCopy();
  const [searchValue, setSearchValue] = useSurfaceDraft('components/app/RightSidebar.tsx:searchValue', '');
  const navigate = useStableNavigate();
  const { addToHistory } = useSearchHistory();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const query = searchValue.trim().replace(/^@/, '');
  const debounced = useDebouncedValue(query, 200);

  const { data, isFetching } = useQuery({
    queryKey: ['desktop-people-search', debounced.toLowerCase()],
    queryFn: async () => toPeopleMatches((await searchUsers({ q: debounced, limit: 10 })).data),
    enabled: debounced.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const people = query ? data ?? [] : [];
  const open = focused && !dismissed && query.length > 0 && (people.length > 0 || (!isFetching && debounced === query));

  useEffect(() => {
    setActive(-1);
  }, [debounced]);

  // The list is portalled to <body>: inside the rail it sat under the panels
  // below it and picked up their theme glass. Pin it under the box instead.
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const reset = (value: string) => {
    setSearchValue.complete(value, '');
    setActive(-1);
    inputRef.current?.blur();
  };

  const openProfile = (p: PeopleMatch) => {
    navigate(`/${p.username}`);
    reset(searchValue);
  };

  const openFullSearch = () => {
    const q = searchValue.trim();
    if (!q) return;
    addToHistory(q);
    navigate(`/app/explore?q=${encodeURIComponent(q)}`);
    reset(searchValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && people.length) {
      e.preventDefault();
      setDismissed(false);
      setActive((i) => (i + 1) % people.length);
    } else if (e.key === 'ArrowUp' && people.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? people.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setDismissed(true);
        setActive(-1);
      }
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && people[active]) {
        e.preventDefault();
        openProfile(people[active]);
      } else {
        openFullSearch();
      }
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      <Input
        ref={inputRef}
        data-search-surface
        value={searchValue}
        onChange={(e) => {
          setSearchValue(e.target.value);
          setDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={_copy('copy.7f55382219f0', { defaultValue: 'Search...' })}
        className={cn(
          'w-full pl-10 bg-zinc-900 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
          compact ? 'h-[36px] text-sm' : 'h-[36px]',
        )}
      />
      {open && rect && createPortal(
        <div
          id={listId}
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width }}
          role="listbox"
          data-people-search-dropdown
          aria-label={_copy('copy.peoplesearch.label', { defaultValue: 'People' })}
          // Keep focus in the box while a row is pressed, so the list does
          // not close before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="z-[60] overflow-hidden rounded-2xl p-1 text-white shadow-2xl ring-1 ring-white/10 bg-zinc-950/95 backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1"
        >
          {people.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-400">
              {_copy('copy.peoplesearch.none', { defaultValue: 'No people found' })}
            </p>
          ) : (
            people.map((p, i) => (
              <button
                key={p.username}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => openProfile(p)}
                className={cn(
                  'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors duration-100',
                  i === active ? 'bg-white/[0.08]' : 'bg-transparent',
                )}
              >
                <Avatar className="w-9 h-9 flex-shrink-0">
                  {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" className="object-cover" />}
                  <AvatarFallback className="bg-zinc-700 text-white text-sm font-medium">
                    {(p.displayName || p.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                  <BadgedName
                    badgeBalance={p.badgeBalance}
                    badgeLock={p.badgeLock}
                    username={p.username}
                    className="text-sm font-semibold text-white"
                  >
                    {p.displayName || p.username}
                  </BadgedName>
                  <span className="text-[13px] text-zinc-400 truncate">@{p.username}</span>
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            onClick={openFullSearch}
            className="w-full flex items-center gap-2 px-2.5 py-2 mt-0.5 rounded-xl text-left text-[13px] text-zinc-400 hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {_copy('copy.peoplesearch.all', { defaultValue: 'Search for "{{q}}"', q: searchValue.trim() })}
            </span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
