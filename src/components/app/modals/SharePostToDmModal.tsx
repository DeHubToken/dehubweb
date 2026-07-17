/**
 * Share Post To DM Modal
 * ======================
 * Lets a user send a post into a direct message. Opened from a post's Share
 * drawer ("Send in a message"). Lists existing conversations + user search,
 * and sends the post via the DeHub DM socket endpoint (emitSendMessage) as a
 * message containing the post link — which renders as a rich card on the
 * recipient's side (see SharedPostEmbed).
 *
 * Recipients who charge a per-message DM fee are routed into the conversation
 * (openDmWith + autoSendBody) so the existing fee-payment flow handles it.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Send, Check, Loader2, X, Gem } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { SharedPostEmbed } from '@/components/app/chat/SharedPostEmbed';
import { useConversations, useUserSearchForDM } from '@/hooks/use-messages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { emitCreateAndStart, emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { getAccountInfo, type DeHubUser, type DeHubConversation } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { buildPostShareUrl } from '@/lib/post-link';

interface SharePostToDmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Numeric post tokenId being shared. */
  tokenId: number;
}

/**
 * Extract a per-message DM fee (DHB) from a user's dmSettings, if any.
 * `perMessageFee` / `dmSetting` are present at runtime but not on the DeHubUser
 * type, so we narrow through `unknown` rather than widening to `any`.
 */
function perMessageFeeOf(user: DeHubUser | undefined): number {
  const holder = user as { dmSettings?: unknown; dmSetting?: unknown } | undefined;
  const raw = holder?.dmSettings ?? holder?.dmSetting;
  const settings = (Array.isArray(raw) ? raw[0] : raw) as { perMessageFee?: number } | undefined;
  return Number(settings?.perMessageFee) || 0;
}

type RowStatus = 'idle' | 'sending' | 'sent';

export function SharePostToDmModal({ open, onOpenChange, tokenId }: SharePostToDmModalProps) {
  const navigate = useNavigate();
  const [caption, setCaption] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

  const { conversations, isLoading: convosLoading } = useConversations('');
  const { data: userSearchResults, isLoading: isSearchingUsers } = useUserSearchForDM(search);

  // Reset transient state whenever the modal opens.
  useEffect(() => {
    if (open) {
      setCaption('');
      setSearchInput('');
      setRowStatus({});
    }
  }, [open]);

  const shareUrl = buildPostShareUrl(tokenId);
  const buildContent = () => {
    const c = caption.trim();
    return c ? `${c}\n${shareUrl}` : shareUrl;
  };

  // Filter existing conversations by the search term (client-side).
  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const oneToOne = conversations.filter(c => !c.isGroup && !c.groupInfo && c.otherUser?.address);
    if (!q) return oneToOne;
    return oneToOne.filter(c => {
      const u = c.otherUser;
      return (
        u?.displayName?.toLowerCase().includes(q) ||
        u?.username?.toLowerCase().includes(q) ||
        u?.address?.toLowerCase().includes(q)
      );
    });
  }, [conversations, search]);

  // Users from search who don't already have a conversation.
  const existingAddresses = useMemo(
    () => new Set(conversations.map(c => c.otherUser?.address?.toLowerCase()).filter(Boolean)),
    [conversations]
  );
  const newUserResults: DeHubUser[] = useMemo(() => {
    if (search.trim().length < 2) return [];
    return (userSearchResults?.items || []).filter(
      (u: DeHubUser) => u.address && !existingAddresses.has(u.address.toLowerCase())
    );
  }, [userSearchResults, existingAddresses, search]);

  /** Route fee-gated recipients into the chat where the payment flow lives. */
  const routeToChat = (address: string, username: string | undefined) => {
    navigate('/app/messages', {
      state: { openDmWith: address, username: username?.replace('@', ''), autoSendBody: buildContent() },
    });
    onOpenChange(false);
  };

  const sendToConversation = async (conv: DeHubConversation) => {
    const key = `conv:${conv.id}`;
    const fee = perMessageFeeOf(conv.otherUser) || (conv.dmFee?.required && !conv.dmFee.hasFreeAccess ? conv.dmFee.fee : 0);
    if (fee > 0) {
      if (conv.otherUser?.address) routeToChat(conv.otherUser.address, conv.otherUser.username);
      return;
    }
    const isVirtual = conv.id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(conv.id);
    if (isVirtual) {
      // One-tap for virtual rows too: create the real conversation over the
      // socket and send immediately. Routing to the chat instead used to queue
      // the message behind a dmId that never materialised — the user landed on
      // an empty composer and the share was silently lost.
      if (conv.otherUser) { await sendToUser(conv.otherUser, key); return; }
      toast.error('Failed to send post');
      return;
    }
    setRowStatus(s => ({ ...s, [key]: 'sending' }));
    try {
      emitSendMessage({ dmId: conv.id, content: buildContent(), type: 'msg' });
      setRowStatus(s => ({ ...s, [key]: 'sent' }));
      toast.success(`Post sent to ${conv.otherUser?.displayName || conv.otherUser?.username || 'chat'}`);
    } catch (err) {
      console.error('[SharePostToDm] send to conversation failed:', err);
      setRowStatus(s => ({ ...s, [key]: 'idle' }));
      toast.error('Failed to send post');
    }
  };

  const sendToUser = async (user: DeHubUser, statusKey?: string) => {
    const key = statusKey ?? `user:${user.address || user._id}`;
    const fee = perMessageFeeOf(user);
    if (fee > 0) {
      if (user.address) routeToChat(user.address, user.username);
      return;
    }
    setRowStatus(s => ({ ...s, [key]: 'sending' }));
    try {
      let userId = user._id || user.id;
      if (!userId && user.address) {
        try {
          const info = await getAccountInfo(user.address);
          userId = info._id || user.address;
        } catch {
          userId = user.address;
        }
      }
      if (!userId) throw new Error('Missing recipient id');
      const conv = await emitCreateAndStart(userId);
      if (!conv?._id) throw new Error('Could not open conversation');
      emitSendMessage({ dmId: conv._id, content: buildContent(), type: 'msg' });
      setRowStatus(s => ({ ...s, [key]: 'sent' }));
      toast.success(`Post sent to ${user.displayName || user.username || 'user'}`);
    } catch (err) {
      console.error('[SharePostToDm] send to user failed:', err);
      setRowStatus(s => ({ ...s, [key]: 'idle' }));
      toast.error('Failed to send post');
    }
  };

  const hasResults = filteredConversations.length > 0 || newUserResults.length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        glass
        className="max-h-[85vh]"
        data-no-navigate
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <DrawerHeader className="relative">
          <DrawerTitle className="text-white/90 font-semibold">Send in a message</DrawerTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-3 w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-3 overflow-y-auto overscroll-contain flex-1">
          {/* What's being shared */}
          <SharedPostEmbed tokenId={String(tokenId)} />

          {/* Optional caption */}
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 500))}
            placeholder="Add a message (optional)"
            className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-xl"
          />

          {/* Recipient search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search people…"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-xl"
            />
          </div>

          {/* Recipient list */}
          <div className="space-y-1">
            {convosLoading && filteredConversations.length === 0 && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              </div>
            )}

            {filteredConversations.map((conv) => {
              const u = conv.otherUser;
              const key = `conv:${conv.id}`;
              const status = rowStatus[key] || 'idle';
              const avatarUrl = buildAvatarUrl(u?.address || '', u?.avatarImageUrl || u?.avatarUrl);
              const name = u?.displayName || u?.username ||
                (u?.address ? `${u.address.slice(0, 6)}...${u.address.slice(-4)}` : 'User');
              const fee = perMessageFeeOf(u) || (conv.dmFee?.required && !conv.dmFee.hasFreeAccess ? conv.dmFee.fee : 0);
              return (
                <RecipientRow
                  key={key}
                  avatarUrl={avatarUrl}
                  name={name}
                  username={u?.username ?? undefined}
                  verified={u?.isVerified || u?.is_verified}
                  fee={fee}
                  status={status}
                  onSend={() => sendToConversation(conv)}
                />
              );
            })}

            {/* New users from search */}
            {newUserResults.length > 0 && (
              <p className="text-zinc-500 text-[11px] uppercase tracking-wider font-medium px-1 pt-3 pb-1">
                Other people
              </p>
            )}
            {newUserResults.map((user) => {
              const key = `user:${user.address || user._id}`;
              const status = rowStatus[key] || 'idle';
              const avatarPath = extractAvatarPath(user);
              const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
              const name = user.displayName || user.display_name || user.username || 'User';
              return (
                <RecipientRow
                  key={key}
                  avatarUrl={avatarUrl}
                  name={name}
                  username={user.username ?? undefined}
                  verified={user.isVerified || user.is_verified}
                  fee={perMessageFeeOf(user)}
                  status={status}
                  onSend={() => sendToUser(user)}
                />
              );
            })}

            {search.trim().length >= 2 && isSearchingUsers && (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            )}

            {!convosLoading && !isSearchingUsers && !hasResults && (
              <p className="text-zinc-500 text-sm text-center py-6">
                {search.trim() ? 'No people found' : 'No conversations yet — search for someone above'}
              </p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function RecipientRow({
  avatarUrl,
  name,
  username,
  verified,
  fee,
  status,
  onSend,
}: {
  avatarUrl?: string;
  name: string;
  username?: string;
  verified?: boolean;
  fee: number;
  status: RowStatus;
  onSend: () => void;
}) {
  return (
    <div className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
      <Avatar className="w-10 h-10">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="bg-zinc-700 text-white font-medium">
          {(name.startsWith('0x') ? name.charAt(2) : name.charAt(0)).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white truncate">{name}</span>
          {verified && <VerifiedBadge className="w-3.5 h-3.5" />}
        </div>
        {username && <p className="text-xs text-zinc-500 truncate">@{username}</p>}
        {fee > 0 && (
          <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
            <Gem className="w-3 h-3" />
            {fee.toLocaleString()} DHB to message
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={status !== 'idle'}
        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
          status === 'sent'
            ? 'bg-white/10 text-white/70'
            : 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white hover:from-white/25 disabled:opacity-60'
        }`}
      >
        {status === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === 'sent' ? (
          <><Check className="w-3.5 h-3.5" /> Sent</>
        ) : fee > 0 ? (
          'Open chat'
        ) : (
          <><Send className="w-3.5 h-3.5" /> Send</>
        )}
      </button>
    </div>
  );
}
