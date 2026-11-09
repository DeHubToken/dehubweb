/**
 * NewMessageDrawer
 * ================
 * Phone-width "New message": the + in Messages opens this drawer straight
 * away (no "Start something" chooser first) with the To field focused and
 * the keyboard up in the same motion. Recent chats show as faces before you
 * type, people you follow fill it for a new account, and New group / New
 * channel sit as two pills under the field.
 *
 * Picking someone hands the person back to the page, which opens the chat in
 * place with its composer focused, so the keyboard never drops. Paid DMs are
 * handled by the chat's own composer (tip line + "Pay & send").
 *
 * Desktop keeps NewMessageSelector + NewConversationModal.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import X from '@/components/ui/cut-icons/close';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import Search from '@/components/ui/cut-icons/search';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useUserSearchForDM } from '@/hooks/use-messages';
import { getFollowList, type DeHubConversation, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { cn } from '@/lib/utils';

export interface NewMessageDrawerHandle {
  /** Call inside the tap that opens the drawer: raises the keyboard right away (iOS only allows that during a tap). */
  primeKeyboard: () => void;
}

interface NewMessageDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: DeHubConversation[];
  myAddress?: string | null;
  /** Called inside the tap, so the page can open the chat and move focus while the keyboard is still up. */
  onPick: (user: DeHubUser) => void;
  onGroup?: () => void;
  onChannel?: () => void;
}

type Person = DeHubUser & { _followsYou?: boolean };

const addrOf = (u: Partial<DeHubUser> | undefined | null) => (u?.address || '').toLowerCase();
const nameOf = (u: Partial<DeHubUser>) => u.displayName || u.display_name || u.username || `${(u.address || '').slice(0, 6)}…`;

type Loose = Record<string, unknown>;
type BadgeLockProp = React.ComponentProps<typeof BadgeIcon>['badgeLock'];
type DmSettingsShape = { disables?: string[] } | undefined;

function dmDisabled(u: Partial<DeHubUser>) {
  const raw = (u as Loose).dmSettings || (u as Loose).dmSetting;
  const s = (Array.isArray(raw) ? raw[0] : raw) as DmSettingsShape;
  return !!(s?.disables?.includes('NEW_DM') || s?.disables?.includes('all'));
}

function Face({ user, size }: { user: Partial<DeHubUser>; size: string }) {
  const url = user.address ? buildAvatarUrl(user.address, extractAvatarPath(user as DeHubUser)) : undefined;
  return (
    <Avatar className={size}>
      {url && <AvatarImage src={url} />}
      <AvatarFallback className="bg-white/10 text-white font-semibold">{nameOf(user).charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** Keep the To field focused while a row is pressed, so the keyboard stays up through the pick. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export const NewMessageDrawer = forwardRef<NewMessageDrawerHandle, NewMessageDrawerProps>(function NewMessageDrawer(
  { open, onOpenChange, conversations, myAddress, onPick, onGroup, onChannel },
  ref,
) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const proxyRef = useRef<HTMLInputElement>(null);
  const me = (myAddress || '').toLowerCase();

  useImperativeHandle(ref, () => ({
    primeKeyboard: () => {
      // The drawer's own field does not exist yet during the tap. Focusing an
      // off-screen field now brings the keyboard up; the To field takes the
      // focus over as soon as it mounts, and iOS keeps the keyboard open.
      try { proxyRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
    },
  }), []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
  }, [open]);

  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: Person[] = [];
    for (const c of conversations) {
      const u = c.otherUser;
      const a = addrOf(u);
      if (!u || !a || a === me || seen.has(a)) continue;
      seen.add(a);
      out.push(u);
      if (out.length >= 12) break;
    }
    return out;
  }, [conversations, me]);

  const { data: following = [] } = useQuery({
    queryKey: ['new-message-drawer', 'following', me],
    enabled: open && !!me,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await getFollowList(me, 'following', { limit: 24 });
      return (res.items || []).map((f) => ({
        address: f.address,
        username: f.username,
        displayName: f.displayName,
        avatarImageUrl: f.avatarImageUrl || f.avatarUrl,
        badgeBalance: f.badgeBalance,
        _followsYou: !!f.followsYou,
      } as unknown as Person));
    },
  });

  const recentSet = useMemo(() => new Set(recents.map(addrOf)), [recents]);
  const suggested = useMemo(
    () => following.filter((u) => addrOf(u) && addrOf(u) !== me && !recentSet.has(addrOf(u))).slice(0, 8),
    [following, recentSet, me],
  );

  const q = query.trim().replace(/^@/, '').toLowerCase();
  const { data: searchResults, isLoading: searching } = useUserSearchForDM(query);
  const matches = useMemo(() => {
    if (!q) return [];
    const seen = new Set<string>();
    const out: Person[] = [];
    const add = (u: Person) => {
      const a = addrOf(u);
      if (!a || a === me || seen.has(a)) return;
      seen.add(a);
      out.push(u);
    };
    // People you already talk to or follow first, from the very first letter.
    for (const u of [...recents, ...following]) {
      const hay = `${u.username || ''} ${u.displayName || ''} ${u.display_name || ''}`.toLowerCase();
      if (hay.includes(q)) add(u);
    }
    for (const u of searchResults?.items || []) add(u as Person);
    return out.slice(0, 20);
  }, [q, recents, following, searchResults, me]);

  const pick = useCallback((u: Person) => {
    if (dmDisabled(u)) return;
    onPick(u);
  }, [onPick]);

  const subline = (u: Person) => {
    const a = addrOf(u);
    const parts: string[] = [];
    if (u.username) parts.push(`@${u.username}`);
    if (recentSet.has(a)) parts.push(t('messages.newDrawer.chattedBefore', { defaultValue: 'You talk' }));
    else if (u._followsYou) parts.push(t('messages.newDrawer.mutual', { defaultValue: 'Mutual' }));
    if (dmDisabled(u)) parts.push(t('messages.newDrawer.dmsOff', { defaultValue: 'DMs off' }));
    return parts.join(' · ');
  };

  const Row = ({ u }: { u: Person }) => (
    <button
      type="button"
      data-new-message-person={u.username || addrOf(u)}
      onMouseDown={keepFocus}
      onClick={() => pick(u)}
      disabled={dmDisabled(u)}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left active:bg-white/[0.06] disabled:opacity-50"
    >
      <Face user={u} size="w-10 h-10" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 min-w-0">
          <span className="truncate text-sm font-semibold text-white">{nameOf(u)}</span>
          <BadgeIcon badgeBalance={(u as Loose).badgeBalance as number | undefined} badgeLock={(u as Loose).badgeLock as BadgeLockProp} username={u.username || nameOf(u)} className="w-[1em] h-[1em] shrink-0" />
        </span>
        <span className="block truncate text-xs text-zinc-500">{subline(u)}</span>
      </span>
    </button>
  );

  return (
    <>
      {/* Off-screen stand-in that holds the keyboard between the tap and the drawer mounting. 16px so iOS does not zoom. */}
      <input
        ref={proxyRef}
        aria-hidden
        tabIndex={-1}
        data-new-message-keyboard-proxy
        className="fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none text-[16px]"
        style={{ transform: 'translateY(-200px)' }}
      />
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          column
          glass
          hideHandle={false}
          data-new-message-drawer
          className="h-[calc(88dvh_-_env(safe-area-inset-top))]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="w-7" />
            <DrawerTitle className="text-[15px] font-bold text-white">
              {t('communities.newChat.message', { defaultValue: 'New message' })}
            </DrawerTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4">
            <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-white/[0.07] border border-white/15 focus-within:border-white/30">
              <span className="text-sm font-semibold text-zinc-400">{t('messages.newDrawer.to', { defaultValue: 'To' })}</span>
              <input
                ref={inputRef}
                data-new-message-to
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
                placeholder={t('messages.newDrawer.placeholder', { defaultValue: 'Name or @username' })}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-zinc-500 outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => setQuery('')}
                  aria-label={t('sidebar.clearSearch', { defaultValue: 'Clear search' })}
                  className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </label>
          </div>

          {(onGroup || onChannel) && !q && (
            <div className="flex gap-2 px-4 pt-3">
              {onGroup && (
                <button type="button" data-new-message-pill="group" onClick={onGroup} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white">
                  <Users className="w-3.5 h-3.5" />
                  {t('communities.newChat.newGroup', { defaultValue: 'New group' })}
                </button>
              )}
              {onChannel && (
                <button type="button" data-new-message-pill="channel" onClick={onChannel} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white">
                  <Megaphone className="w-3.5 h-3.5" />
                  {t('communities.newChat.newChannel', { defaultValue: 'New channel' })}
                </button>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] px-2 pb-4 pt-1" data-new-message-list>
            {q ? (
              matches.length > 0 ? (
                <div className="pt-2">{matches.map((u) => <Row key={addrOf(u)} u={u} />)}</div>
              ) : searching || q.length < 2 ? (
                <div className="flex justify-center py-8 text-zinc-500">
                  {q.length < 2 ? <span className="text-xs">{t('messages.newDrawer.keepTyping', { defaultValue: 'Keep typing to search everyone' })}</span> : <Loader2 className="w-5 h-5 animate-spin" />}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Search className="w-8 h-8 text-zinc-600" />
                  <p className="text-sm text-zinc-300">{t('messages.newDrawer.noOne', { defaultValue: 'No one found' })}</p>
                  <p className="text-xs text-zinc-500">{t('messages.newDrawer.tryUsername', { defaultValue: 'Try their exact @username' })}</p>
                </div>
              )
            ) : (
              <>
                {recents.length > 0 && (
                  <>
                    <p className="px-2 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{t('messages.newDrawer.recent', { defaultValue: 'Recent' })}</p>
                    <div className="flex gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-new-message-recents>
                      {recents.map((u) => (
                        <button
                          key={addrOf(u)}
                          type="button"
                          onMouseDown={keepFocus}
                          onClick={() => pick(u)}
                          className="flex w-14 shrink-0 flex-col items-center gap-1"
                        >
                          <Face user={u} size="w-14 h-14" />
                          <span className="w-full truncate text-center text-[11px] text-zinc-300">{nameOf(u)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {suggested.length > 0 && (
                  <>
                    <p className="px-2 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      {recents.length > 0
                        ? t('messages.newDrawer.suggested', { defaultValue: 'Suggested' })
                        : t('messages.newDrawer.youFollow', { defaultValue: 'People you follow' })}
                    </p>
                    {suggested.map((u) => <Row key={addrOf(u)} u={u} />)}
                  </>
                )}
                {recents.length === 0 && suggested.length === 0 && (
                  <div className={cn('flex flex-col items-center gap-2 py-10 text-center')}>
                    <p className="text-sm font-semibold text-white">{t('messages.newDrawer.sayHi', { defaultValue: 'Say hi to someone' })}</p>
                    <p className="text-xs text-zinc-500">{t('messages.newDrawer.typeAny', { defaultValue: 'Type any name or @username' })}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
});
