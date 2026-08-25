/**
 * DirectMessageChat Component
 * ===========================
 * Full-screen 1:1 direct message chat view.
 */

import { useState, useRef, useEffect, useCallback, useMemo, useReducer, memo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Loader2, ArrowDown, Trash2, ShieldBan, ShieldCheck, Settings, AlertCircle, RefreshCw, Play, Pause, Gift, Search, X, Gem, Languages, RotateCcw, Pin, Phone, CornerUpRight, FileText, Download } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatInput } from './ChatInput';
import { DehubLinkEmbed } from '@/components/app/cards/DehubLinkEmbed';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { findDehubLinks, stripDehubLinkMatches } from '@/lib/dehub-links';
import { conversationIdentity } from '@/lib/conversation-identity';
import { useTranslation, renderChatTextWithLinks } from '../TranslatableText';
import { useMessages, useSendMessage, useDeleteConversation, useCreateAndStart, messagesKeys, registerOpenConversation, createTransientBlobUrl } from '@/hooks/use-messages';
import { useAuth } from '@/contexts/AuthContext';
import { useDmSettings } from '@/hooks/use-dm-settings';
import { getMediaUrl, blockConversation, unblockConversation, getDMPlanSettings, grantFreeDmAccess, revokeFreeDmAccess, getAccountInfo, pinDmMessage, unpinDmMessage, type DeHubConversation, type DmMessage, type DmFee } from '@/lib/api/dehub';
import { apiCall, getAuthToken, DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { formatAttachmentSize, getAttachmentLabel, isAllowedAttachment } from '@/lib/attachments';
import { GroupSettingsDrawer } from './GroupSettingsDrawer';
import { SharedVideosDrawer } from './SharedVideosDrawer';
import { FullscreenImageViewer } from '@/components/app/cards/FullscreenImageViewer';
import { DmTipDialog } from './DmTipDialog';
import { DmFeeInfoBanner } from './DmFeeInfoBanner';
import { formatDistanceToNow } from 'date-fns';
import {
  getERC20Balance,
  parseTxError,
  checkDHBPaused,
} from '@/lib/contracts/aa-utils';
import { getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import {
  emitReadReceipt,
  emitForwardMessage,
  onConversationDeleted,
  onDmSendMessage,
  onForwardMessage,
  onDmError,
} from '@/lib/api/dehub/dm-socket';
import { ForwardMessageDialog } from './ForwardMessageDialog';
import { DmVoiceCallButton } from '@/components/app/chat/calls/DmVoiceCallButton';
import { DmVideoCallButton } from '@/components/app/chat/calls/DmVideoCallButton';
import { useCall } from '@/contexts/CallContext';
import { dismissKeyboard } from '@/hooks/use-keyboard-open';

interface DirectMessageChatProps {
  conversation: DeHubConversation;
  onBack: () => void;
  /** Pre-fill the composer (shared-post text for fee-gated chats). */
  initialComposerText?: string;
}

function VoiceMessagePlayer({
  audioUrl,
  duration,
  isPending,
}: {
  audioUrl?: string;
  duration?: number | null;
  isPending: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 min-w-[120px] py-2 px-3 rounded-lg bg-zinc-700/50">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-400">Uploading voice...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-700/50 hover:bg-zinc-600/50 transition-colors text-sm"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <span>🎤 Voice</span>
        {duration != null && <span className="text-xs text-zinc-400">{duration}s</span>}
      </button>
    </div>
  );
}

// memo: every DirectMessageChat state change (scroll-position toggles, search
// keystrokes, incoming messages) used to re-render EVERY bubble — each parsing
// dates via formatDistanceToNow. Handler props are useCallback'd by the
// parent, so only bubbles whose message/highlight actually changed re-render.
const MessageBubble = memo(function MessageBubble({
  message,
  isOwnMessage,
  highlightText,
  txConfirmed = false,
  onPin,
  onForward,
  onOpenImage,
}: {
  message: DmMessage;
  isOwnMessage: boolean;
  highlightText?: string;
  /** Locally-confirmed payment tx for this message (prop, not ref — memo-safe). */
  txConfirmed?: boolean;
  onPin?: (messageId: string) => void;
  onForward?: (message: DmMessage) => void;
  onOpenImage?: (url: string) => void;
}) {
  // Payment-pending spinner: memo means no incidental re-renders, so the 90s
  // "give up waiting" fallback schedules its own re-render at the boundary
  // instead of relying on unrelated parent state changes to sweep it away.
  const [, forcePendingTick] = useReducer((v: number) => v + 1, 0);
  const pendingAgeMs = Date.now() - new Date(message.createdAt).getTime();
  const showPaymentPending =
    isOwnMessage &&
    message.paymentStatus === 'pending' &&
    !txConfirmed &&
    pendingAgeMs < 90_000;
  useEffect(() => {
    if (!showPaymentPending) return;
    const remaining = Math.max(250, 90_000 - pendingAgeMs);
    const timer = setTimeout(forcePendingTick, remaining);
    return () => clearTimeout(timer);
    // pendingAgeMs is time-derived; the timer only needs scheduling while visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentPending, message._id]);
  // Call message — detect by emoji prefix in content (📞/📹/📵)
  const isCallMessage = message.msgType === 'msg' && /^[📞📹📵]/.test(message.content || '');
  if (isCallMessage) {
    return (
      <div id={`dm-msg-${message._id}`} className="flex justify-center py-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 text-xs">
          <Phone className="w-3 h-3 text-zinc-400 flex-shrink-0" />
          <span>{message.content}</span>
          <span className="text-zinc-500 text-[10px] ml-0.5">
            · {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  }

  const avatarUrl = buildAvatarUrl(message.sender?.address || '', message.sender?.avatarImageUrl);
  const displayName = message.sender?.displayName || message.sender?.username ||
    (message.sender?.address
      ? `${message.sender.address.slice(0, 6)}...${message.sender.address.slice(-4)}`
      : 'User');
  const senderProfilePath = message.sender?.username
    ? `/${message.sender.username}`
    : message.sender?.address
      ? `/${message.sender.address}`
      : null;

  const primaryMedia = message.mediaUrls?.[0];
  const primaryMediaUrl = primaryMedia?.url;
  // Documents and images share msgType 'media', so the entry's own type is what
  // separates them. Optimistic sends carry it too, so the pending bubble reads
  // "Uploading file…" rather than promising an image that never arrives.
  const isFileMedia = primaryMedia?.type === 'file';

  // A shared entity: a text message whose content contains a link to something
  // inside DeHub. Rendered as a rich, tappable card instead of a raw link.
  //
  // This used to recognise posts only, which is why sending someone a shop item
  // or a community from the app produced a naked URL in their inbox while a post
  // produced a card.
  const sharedLink = useMemo(
    () => (message.msgType === 'msg' ? findDehubLinks(message.content)[0] ?? null : null),
    [message.msgType, message.content],
  );
  const isPostShare = !!sharedLink;

  // Entity shares translate their caption (link stripped) — feeding the raw URL to the
  // translator garbles it and previously the translate control was hidden entirely.
  const shareCaption = useMemo(
    () => (sharedLink ? stripDehubLinkMatches(message.content || '', [sharedLink]) : ''),
    [sharedLink, message.content],
  );
  const textContent = isPostShare ? shareCaption : (message.content || '');
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslating,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
    // Direct messages stay on-demand. Auto-translating would ship every private
    // message a user receives to a third-party translator without them asking,
    // and the free tier is a shared translation memory. The translate control is
    // still here for anyone who wants it.
  } = useTranslation(textContent, false);

  // A contract address or a $TICKER in a plain message cards up the same way it
  // does in a post. Entity shares are left alone — they already have a card, and
  // stacking a second one under a 280px bubble reads as a bug.
  const { refs: dmAssetRefs, displayText: dmDisplayText } = useAssetRefsInText(
    isPostShare ? '' : (isTranslated ? translatedText : message.content) || '',
    1,
  );

  return (
    <div
      id={`dm-msg-${message._id}`}
      className={`flex gap-3 py-2 ${isOwnMessage ? 'flex-row-reverse' : ''} group relative rounded-lg transition-colors`}
    >
      {!message.isDeleted && message.msgType !== 'tip' && (onPin || onForward) && (
        <div
          className={`absolute top-3 ${isOwnMessage ? 'left-1' : 'right-1'} flex items-center gap-1 transition-all opacity-0 group-hover:opacity-100 z-10`}
        >
          {onForward && (
            <button
              type="button"
              onClick={() => onForward(message)}
              className="p-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-400 hover:text-white"
              title="Forward message"
            >
              <CornerUpRight className="w-3 h-3" />
            </button>
          )}
          {onPin && (
            <button
              type="button"
              onClick={() => onPin(message._id)}
              className="p-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-400 hover:text-white"
              title="Pin message"
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {!isOwnMessage && (() => {
        const avatar = (
          <Avatar className="w-8 h-8 flex-shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
              {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        );
        return senderProfilePath ? (
          <Link
            to={senderProfilePath}
            className="flex-shrink-0 self-start"
            aria-label={`View ${displayName}'s profile`}
            onClick={(e) => e.stopPropagation()}
          >
            {avatar}
          </Link>
        ) : avatar;
      })()}

      <div className={`flex-1 min-w-0 max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div className={`mb-1 px-3 py-1.5 rounded-lg border-l-2 border-primary bg-zinc-800/60 text-xs text-zinc-400 max-w-full truncate ${isOwnMessage ? 'text-right border-r-2 border-l-0' : ''}`}>
            <span className="text-zinc-300 font-medium">{message.replyTo.sender?.displayName || 'User'}</span>
            <span className="ml-1">{message.replyTo.content || '📎 Media'}</span>
          </div>
        )}

        {/* Tip message — system-style bubble. Monochrome, as on mobile: the amber
            was the last colour left in a thread whose palette is black and white. */}
        {message.msgType === 'tip' && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.16] text-zinc-200 text-sm">
            <Gem className="w-4 h-4 text-white" />
            <span>
              Tip: {message.tipAmount} {message.tipSymbol || 'DHB'}
            </span>
          </div>
        )}

        {/* Regular message bubble */}
        {message.msgType !== 'tip' && !message.isDeleted && (
          <div
            /* Mine vs theirs is carried by fill-vs-outline rather than by a
               glass stack: a filled block with no border for own messages, a
               hairline block with no fill for theirs. Geometry matches the
               mobile app — 12px with the tail corner squared to 2px. */
            className={`inline-block rounded-xl ${
              message.msgType === 'media' || message.msgType === 'gif' || isPostShare
                ? 'text-white'
                : `px-4 py-2 ${
                    isOwnMessage
                      ? 'bg-white/[0.11] text-white rounded-br-sm'
                      : 'border border-white/[0.16] text-zinc-100 rounded-bl-sm'
                  }`
            }`}
          >
            {/* Text message — or a shared post rendered as a rich card */}
            {message.msgType === 'msg' && (
              isPostShare ? (
                <div className={`flex flex-col gap-1.5 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                  {shareCaption ? (
                    <p dir="auto" className={`text-sm break-words whitespace-pre-wrap text-left rounded-xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-white/[0.11] text-white'
                        : 'border border-white/[0.16] text-zinc-100'
                    }`}>
                      {renderChatTextWithLinks(isTranslated ? translatedText : shareCaption)}
                    </p>
                  ) : null}
                  {/* The bubble is inline-block, so it has no definite width for
                      a `w-full` card to resolve against — the entity cards would
                      collapse to their content. Give them the same 280px the
                      post card already pins itself to. */}
                  <div className="w-[280px] max-w-full text-left">
                    <DehubLinkEmbed link={sharedLink!} compact />
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col gap-1.5 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                  {/* An address-only message strips to nothing, and an empty
                      paragraph still takes a line inside the bubble. */}
                  {dmDisplayText?.trim() ? (
                    <p dir="auto" className="text-sm break-words whitespace-pre-wrap text-left">
                      {renderChatTextWithLinks(dmDisplayText)}
                    </p>
                  ) : null}
                  {/* Same 280px as the entity card above, and for the same
                      reason: the bubble is inline-block, so a w-full card has
                      nothing definite to resolve against. */}
                  {dmAssetRefs.length > 0 && (
                    <div className="w-[280px] max-w-full text-left">
                      <AssetRefCards refs={dmAssetRefs} className="mt-0" />
                    </div>
                  )}
                </div>
              )
            )}

            {/* Media (image or document) — loading state while mediaUrls is empty */}
            {message.msgType === 'media' && (
              <div>
                {primaryMediaUrl && isFileMedia ? (
                  <>
                    <a
                      href={getMediaUrl(primaryMediaUrl)!}
                      download={primaryMedia?.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors hover:bg-white/[0.08] max-w-[280px]"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <FileText className="h-4 w-4 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white" title={primaryMedia?.name}>
                          {primaryMedia?.name || 'Attachment'}
                        </span>
                        <span className="block text-xs text-white/50">
                          {getAttachmentLabel(primaryMedia?.name || '')}
                          {primaryMedia?.size ? ` · ${formatAttachmentSize(primaryMedia.size)}` : ''}
                        </span>
                      </span>
                      <Download className="h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-white/80" />
                    </a>
                    {message.content && (
                      <p dir="auto" className="text-sm mt-1 break-words whitespace-pre-wrap text-left">
                        {renderChatTextWithLinks(isTranslated ? translatedText : message.content)}
                      </p>
                    )}
                  </>
                ) : primaryMediaUrl ? (
                  <>
                    <img
                      src={getMediaUrl(primaryMediaUrl)!}
                      alt="Shared image"
                      className="max-w-full max-h-64 rounded-lg object-cover cursor-zoom-in"
                      onClick={() => onOpenImage?.(getMediaUrl(primaryMediaUrl)!)}
                    />
                    {/* Driven by the same opted-out hook as a text message, not
                        by <TranslatableText>. That component calls
                        useTranslation(text) with auto defaulting to true, so
                        rendering the caption through it sent private DM captions
                        to the translator on mount — around the deliberate
                        auto=false above. textContent is message.content here:
                        isPostShare can only be true for msgType 'msg'. */}
                    {message.content && (
                      <p dir="auto" className="text-sm mt-1 break-words whitespace-pre-wrap text-left">
                        {renderChatTextWithLinks(isTranslated ? translatedText : message.content)}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 min-w-[120px] py-4 px-3 rounded-lg bg-zinc-700/50">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-400">
                      {isFileMedia ? 'Uploading file...' : 'Uploading image...'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* GIF */}
            {message.msgType === 'gif' && primaryMediaUrl && (
              <img
                src={primaryMediaUrl}
                alt="GIF"
                className="max-w-full max-h-48 rounded-lg"
              />
            )}

            {/* Voice message — show player when mediaUrls available, else pending */}
            {message.msgType === 'voice' && (
              <VoiceMessagePlayer
                audioUrl={primaryMediaUrl ? (getMediaUrl(primaryMediaUrl) || primaryMediaUrl) : undefined}
                duration={message.voiceDuration}
                isPending={!primaryMediaUrl}
              />
            )}


            {/* Tip badge on regular messages */}
            {message.tipAmount != null && (message.msgType as string) !== 'tip' && (
              <div className="inline-flex items-center gap-1 mt-1 text-xs text-amber-300">
                <Gem className="w-3 h-3 text-amber-300" />
                {message.tipAmount} {message.tipSymbol || 'DHB'}
              </div>
            )}
          </div>
        )}

        {/* Deleted message */}
        {message.isDeleted && (
          <div className={`inline-block rounded-xl px-4 py-2 border border-white/[0.10] text-zinc-500 text-sm italic ${isOwnMessage ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            Message deleted
          </div>
        )}

        {/* Forwarded label */}
        {message.isForwarded && (
          <div className={`text-xs text-zinc-500 mb-0.5 ${isOwnMessage ? 'text-right' : ''}`}>
            ↪ Forwarded
          </div>
        )}

        <div className={`text-xs text-zinc-500 mt-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
          <span>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
          {/* Image captions get the control too. They had none: the gate was
              msgType === 'msg', so a caption was auto-translated on mount and
              could not be put back. */}
          {!isTooShort && !message.isDeleted &&
            (message.msgType === 'msg' || (message.msgType === 'media' && !!message.content)) && (
            <button
              type="button"
              onClick={isTranslated ? handleShowOriginal : handleTranslate}
              disabled={isTranslating}
              className="inline-flex items-center gap-0.5 p-1.5 -m-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              title={isTranslated ? 'Show original' : 'Translate'}
            >
              {isTranslating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isTranslated ? (
                <RotateCcw className="w-3.5 h-3.5" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {message.isEdited && <span className="text-zinc-600">· edited</span>}
          {showPaymentPending && (
            <Loader2 className="w-3 h-3 animate-spin text-amber-500/70" />
          )}
          {isOwnMessage && !showPaymentPending && (
            <span className={message.isRead ? "text-white" : "text-zinc-500"}>
              {message.isRead ? "✓✓" : "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function MessagesSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
          {i % 2 === 0 && (
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
          )}
          <div className={`flex-1 max-w-[75%] ${i % 2 !== 0 ? 'text-right' : ''}`}>
            <div
              className={`inline-block h-12 w-48 rounded-2xl bg-white/[0.06] animate-pulse ${
                i % 2 !== 0 ? 'rounded-br-md' : 'rounded-bl-md'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The per-message fee banner has to paint before the API answers or it flashes
 * in half a second after the composer. It is a *hint*, so it expires: the other
 * side can raise, drop or waive their fee at any time, and an entry with no
 * clock on it kept showing the old number for as long as the browser lived.
 */
const DM_FEE_CACHE_TTL = 6 * 60 * 60 * 1000;

function readCachedDmFee(key: string): DmFee | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; t?: number; fee?: DmFee };
    // Pre-TTL entries were the bare DmFee. Drop them rather than trust them.
    if (parsed?.v !== 1 || typeof parsed.t !== 'number' || !parsed.fee) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.t > DM_FEE_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.fee;
  } catch {
    return null;
  }
}

function writeCachedDmFee(key: string, fee: DmFee): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: 1, t: Date.now(), fee }));
  } catch { /* quota — the banner just waits for the API */ }
}

function useDmPin(conversationId: string, address: string | undefined, conversation: DeHubConversation) {
  const serverPinned = conversation.pinnedMessages?.length
    ? conversation.pinnedMessages[conversation.pinnedMessages.length - 1]
    : null;

  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(serverPinned);

  useEffect(() => {
    setPinnedMessageId(serverPinned);
  }, [serverPinned]);

  const pinMessage = useCallback(async (messageId: string) => {
    setPinnedMessageId(messageId);
    if (address) {
      try {
        await pinDmMessage(conversationId, messageId, address);
      } catch {
        setPinnedMessageId(serverPinned);
      }
    }
  }, [conversationId, address, serverPinned]);

  const unpinMessage = useCallback(async () => {
    const previous = pinnedMessageId;
    setPinnedMessageId(null);
    if (address && previous) {
      try {
        await unpinDmMessage(conversationId, previous, address);
      } catch {
        setPinnedMessageId(previous);
      }
    }
  }, [conversationId, address, pinnedMessageId]);

  return { pinnedMessageId, pinMessage, unpinMessage };
}

export function DirectMessageChat({ conversation, onBack, initialComposerText }: DirectMessageChatProps) {
  const { user, walletAddress, openLoginModal } = useAuth();
  const { setCallMessageHandler } = useCall();
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // The _id of the message that was last when this effect last ran, so an
  // append can be told apart from prepended history.
  const prevLastMessageIdRef = useRef<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked ?? false);
  const [isBlockProcessing, setIsBlockProcessing] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showSharedVideos, setShowSharedVideos] = useState(false);
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [forwardMessageTarget, setForwardMessageTarget] = useState<DmMessage | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dmGateChecked, setDmGateChecked] = useState(false);
  const [dmGated, setDmGated] = useState(false);
  /**
   * Stable for the life of the thread. Keyed on conversation.id this wrote to
   * "…-new_0x<addr>" for the first few seconds of a brand new chat and to the
   * ObjectId ever after, so the entry it saved could never be read back — one
   * orphaned key per person you ever messaged.
   */
  const draftScope = conversationIdentity(conversation);
  const dmFeeCacheKey = `dehub-dm-fee-${draftScope}`;
  const [dmFee, setDmFeeRaw] = useState<DmFee | null>(() => {
    // A fee the other side has since changed must not be believed forever —
    // the cache is here to paint the banner before the API answers, not to
    // replace it.
    const cached = readCachedDmFee(dmFeeCacheKey);
    if (cached) return cached;
    if (conversation.dmFee) return conversation.dmFee;
    // Detect fee immediately from otherUser search data so banner shows before any API call
    const otherRaw = (conversation.otherUser || conversation.participants?.[0]) as any;
    const dmS = otherRaw?.dmSettings || otherRaw?.dmSetting;
    const settings = Array.isArray(dmS) ? dmS[0] : dmS;
    const pmFee = settings?.perMessageFee;
    if (pmFee && pmFee > 0) return { required: true, fee: pmFee, hasFreeAccess: false };
    return null;
  });
  const setDmFee: React.Dispatch<React.SetStateAction<DmFee | null>> = (valOrFn) => {
    setDmFeeRaw(prev => {
      const next = typeof valOrFn === 'function' ? (valOrFn as (p: DmFee | null) => DmFee | null)(prev) : valOrFn;
      if (next) writeCachedDmFee(dmFeeCacheKey, next);
      return next;
    });
  };
  const [isFreeAccessGranted, setIsFreeAccessGranted] = useState(false);
  const [isFreeAccessProcessing, setIsFreeAccessProcessing] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState(conversation.id);
  const { pinnedMessageId, pinMessage: handlePinMessage, unpinMessage: handleUnpinMessage } = useDmPin(conversation.id, walletAddress ?? undefined, conversation);
  const [initError, setInitError] = useState(false);
  const { messageFee: myMessageFee } = useDmSettings();
  const isInitialMount = useRef(true);
  const hasInitialized = useRef(false);
  /** Tracks which identifier we tried for createAndStart — on retry, try the other */
  const lastTriedUserId = useRef<string | null>(null);

  // Fee-related state
  const [customTipAmount, setCustomTipAmount] = useState('');
  const [feeBalanceBase, setFeeBalanceBase] = useState<number | null>(null);
  const [feeBalanceBnb, setFeeBalanceBnb] = useState<number | null>(null);
  const [feeBalanceLoading, setFeeBalanceLoading] = useState(false);
  const [isSendingFee, setIsSendingFee] = useState(false);
  // Track tx hashes we've confirmed on-chain so we can override 'pending' paymentStatus from API
  const confirmedTxHashes = useRef<Set<string>>(new Set());
  // Version tick: incremented when a tx confirms so the (memoized) bubbles
  // re-render and pick up the new txConfirmed prop.
  const [, bumpTxConfirmations] = useReducer((v: number) => v + 1, 0);

  // Determine if fee is required
  const feeRequired = dmFee?.required && !dmFee.hasFreeAccess;
  const activeFee = feeRequired ? (customTipAmount ? parseFloat(customTipAmount) || dmFee!.fee : dmFee!.fee) : 0;
  // Best balance across both chains for send-disable check.
  // Only disable when balances have loaded AND both are insufficient.
  // While loading (both null), keep enabled so the payment attempt does its own live balance check.
  const bestFeeBalance = Math.max(feeBalanceBase ?? -1, feeBalanceBnb ?? -1);
  const balancesLoaded = feeBalanceBase !== null || feeBalanceBnb !== null;
  const feeSendDisabled = feeRequired && balancesLoaded && (bestFeeBalance < activeFee);

  // Check DHB balance on both Base and BNB when fee is required
  useEffect(() => {
    if (!feeRequired) return;
    const addr = walletAddress;
    if (!addr) return;
    setFeeBalanceLoading(true);
    const baseConfig = getChainConfig(BASE_CHAIN_ID);
    const bnbConfig = getChainConfig(BNB_CHAIN_ID);
    Promise.all([
      getERC20Balance(baseConfig.dhbToken, addr, BASE_CHAIN_ID).catch(() => null),
      getERC20Balance(bnbConfig.dhbToken, addr, BNB_CHAIN_ID).catch(() => null),
    ]).then(([baseBal, bnbBal]) => {
      setFeeBalanceBase(baseBal !== null ? Number(baseBal) / 1e18 : null);
      setFeeBalanceBnb(bnbBal !== null ? Number(bnbBal) / 1e18 : null);
      setFeeBalanceLoading(false);
    });
  }, [feeRequired, walletAddress]);

  // When parent upgrades conversation to one with real dmId (e.g. after getContacts returns DeHub data), use it
  useEffect(() => {
    const convId = conversation.id;
    const isRealId = !convId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(convId);
    if (isRealId && convId !== resolvedConversationId) {
      setResolvedConversationId(convId);
      setInitError(false);
    }
  }, [conversation.id, resolvedConversationId]);

  const isGroupChat = conversation.isGroup || !!conversation.groupInfo;

  // Get the other participant
  const otherUser = conversation.otherUser ||
    conversation.participants?.find(p =>
      (p.address || p._id) !== (user?.address || user?._id)
    ) ||
    conversation.participants?.[0];

  const avatarUrl = buildAvatarUrl(otherUser?.address || '', otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || otherUser?.username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');
  const profileLink = otherUser?.username ? `/${otherUser.username}` : otherUser?.address ? `/${otherUser.address}` : '#';

  // createAndStart — get/create conversation + dmFee
  const createAndStart = useCreateAndStart();

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Skip createAndStart when we already have a real conversation ID — backend returns error for existing convos
    const convId = conversation.id;
    const hasRealConvId = !convId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(convId);
    if (hasRealConvId) return;

    const address = otherUser?.address;
    const knownId = otherUser?._id;

    const run = async () => {
      // Backend createAndStart requires MongoDB ObjectId — fetch profile if we only have address
      let userId = knownId;
      if (!userId && address) {
        try {
          const profile = await getAccountInfo(address);
          userId = profile._id || address;
        } catch {
          userId = address;
        }
      }
      if (!userId) return;

      lastTriedUserId.current = userId;
      createAndStart.mutate(userId, {
      onSuccess: (data) => {
        console.log('[DM] createAndStart success:', data);
        setInitError(false);
        if (data._id) setResolvedConversationId(data._id);
        if (data.dmFee) {
          console.log('[DM] dmFee detected:', data.dmFee);
          setDmFee(data.dmFee);
        } else {
          // Fallback: use dmSettings from search result when server doesn't return dmFee
          const otherUserData = otherUser as any;
          const perMessageFee = otherUserData?.dmSettings?.perMessageFee;
          if (perMessageFee && perMessageFee > 0) {
            console.log('[DM] Using fallback dmFee from otherUser.dmSettings:', perMessageFee);
            setDmFee({ required: true, fee: perMessageFee, hasFreeAccess: false });
          }
        }
      },
      onError: (err) => {
        console.warn('[DM] createAndStart failed (non-critical):', err);
        // Don't show error banner for timeout — server creates the conversation
        // asynchronously and getContacts polling will pick it up within ~5s.
        // Only show error for non-timeout failures (e.g. auth error).
        const isTimeout = err?.message?.includes('timeout');
        if (!isTimeout) setInitError(true);
        // Fallback: use dmSettings from the search result / otherUser data
        const otherUserData = otherUser as any;
        const perMessageFee = otherUserData?.dmSettings?.perMessageFee;
        if (perMessageFee && perMessageFee > 0 && !dmFee) {
          console.log('[DM] Using fallback dmFee from search result:', perMessageFee);
          setDmFee({
            required: true,
            fee: perMessageFee,
            hasFreeAccess: false,
          });
        }
      },
      });
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check DM plan gating
  useEffect(() => {
    const otherUserData = otherUser as any;
    const planId = otherUserData?.dmPlanId;
    if (!planId) {
      setDmGateChecked(true);
      return;
    }
    getDMPlanSettings(planId)
      .then((settings) => {
        setDmGated(!settings.enabled);
        setDmGateChecked(true);
      })
      .catch(() => setDmGateChecked(true));
  }, [otherUser]);

  const {
    messages,
    isLoading,
    isError: messagesError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markAsRead,
  } = useMessages(resolvedConversationId);

  const pinnedMessage = pinnedMessageId ? messages.find(m => m._id === pinnedMessageId) ?? null : null;

  /**
   * Tail of the thread handed to the reply drafter, oldest first. Text only —
   * an image or voice note carries nothing the model can reply to, and paid or
   * gated bubbles have no business being summarised into a draft.
   */
  const smartReplyThread = useMemo(() => {
    const ownAddress = walletAddress?.toLowerCase();
    const ownId = user?._id;
    return messages
      .filter(m => (m.msgType ?? 'msg') === 'msg' && !!m.content?.trim())
      .slice(-12)
      .map(m => {
        const senderAddress = m.sender?.address?.toLowerCase();
        const senderId = m.sender?._id;
        const isOwn =
          m.author === 'me' ||
          (!!senderAddress && !!ownAddress && senderAddress === ownAddress) ||
          (!!senderId && !!ownId && senderId === ownId);
        return {
          from: isOwn ? ('me' as const) : ('them' as const),
          name: isOwn ? undefined : displayName,
          text: m.content!.trim(),
        };
      });
  }, [messages, walletAddress, user?._id, displayName]);

  const sendMessageMutation = useSendMessage(resolvedConversationId);
  const deleteConversationMutation = useDeleteConversation();

  // Register call message handler so call events appear as bubbles in this chat
  useEffect(() => {
    setCallMessageHandler((content) => {
      sendMessageMutation.mutate({ content, msgType: 'msg' });
    });
    return () => setCallMessageHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCallMessageHandler, resolvedConversationId]);

  // Register this conversation as "open" so its unread badge is forced to 0
  // in the conversations list while the chat is visible.
  useEffect(() => {
    return registerOpenConversation(resolvedConversationId);
  }, [resolvedConversationId]);

  // Emit markAsRead (socket) + scroll on initial load
  useEffect(() => {
    if (isInitialMount.current && messages.length > 0) {
      // Scroll ONLY this container — scrollIntoView scrolls every ancestor,
      // dragging the page itself down and parking dead space under composer.
      const container = scrollContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      isInitialMount.current = false;
      prevLastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
      markAsRead();
    }
  }, [messages.length, markAsRead]);

  // Re-emit markAsRead when conversation is focused/visible
  useEffect(() => {
    if (!resolvedConversationId || resolvedConversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(resolvedConversationId)) return;
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        emitReadReceipt(resolvedConversationId);
      }
    };
    
    // Emit on mount (covers navigation back to chat)
    const timer = setTimeout(() => emitReadReceipt(resolvedConversationId), 1000);
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resolvedConversationId]);

  // Auto-scroll on new messages + auto-mark as read while chat is open.
  //
  // Keyed on the identity of the last message, not on messages.length: paging
  // back prepends history, which grows the length too, so a length comparison
  // counted older messages as new. Scrolling up through a long thread
  // therefore popped a "N new messages" pill whose count climbed with every
  // page fetched, and re-fired markAsRead on each one.
  useEffect(() => {
    if (isInitialMount.current) return;
    const prevLastId = prevLastMessageIdRef.current;
    const prevIndex = prevLastId ? messages.findIndex((m) => m._id === prevLastId) : -1;
    // Anything after the message that used to be last is genuinely new. If the
    // old tail is gone — a full refetch, or an optimistic id swapped for the
    // real one — count nothing rather than guess, so the pill can't lie.
    const appended = prevIndex === -1 ? 0 : messages.length - 1 - prevIndex;

    if (appended > 0) {
      // Auto-read: user is actively viewing this chat
      markAsRead();
      const container = scrollContainerRef.current;
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 150) {
          // Container-scoped, like every other pin here — never the page.
          setTimeout(() => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }), 50);
        } else {
          setNewMessageCount(prev => prev + appended);
        }
      }
    }
    prevLastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
  }, [messages, markAsRead]);

  // Keep the newest messages pinned above the on-screen keyboard. With
  // `interactive-widget=resizes-content` the layout (and this flex column)
  // shrinks from the bottom when the keyboard opens, which would otherwise
  // leave the latest messages hidden until the user scrolls.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let lastHeight = vv.height;
    const onResize = () => {
      const delta = lastHeight - vv.height; // >0 → viewport shrank (keyboard opened)
      lastHeight = vv.height;
      if (delta < 50) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      // The container already lost ~delta px when this fires, so treat anyone
      // who was within delta+150px of the bottom as "at the bottom".
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom <= delta + 150) {
        // Scroll ONLY this container — scrollIntoView also scrolls the page,
        // which shoved the composer down behind the keyboard. Double rAF so
        // React has applied the keyboard-open height before we measure.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const c = scrollContainerRef.current;
          if (c) c.scrollTop = c.scrollHeight;
        }));
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // If createAndStart failed and conversation ID is still virtual, resolve it from incoming messages
  useEffect(() => {
    if (!resolvedConversationId.startsWith('new_')) return;
    const otherAddress = resolvedConversationId.replace('new_', '').toLowerCase();
    const unsub = onDmSendMessage((msg) => {
      if (msg.conversation && msg.sender?.address?.toLowerCase() === otherAddress) {
        setResolvedConversationId(msg.conversation);
        setInitError(false);
      }
    });
    return unsub;
  }, [resolvedConversationId]);

  // Handle conversationDeleted event
  useEffect(() => {
    const convId = resolvedConversationId;
    if (!convId || convId.startsWith('new_')) return;

    const unsub = onConversationDeleted(({ dmId }) => {
      if (dmId === convId) {
        toast.info('Conversation was deleted');
        onBack();
      }
    });
    return unsub;
  }, [resolvedConversationId, onBack]);

  // Handle DM_FEE_REQUIRED socket error — set fee state so the UI shows the payment banner
  useEffect(() => {
    const unsub = onDmError((err) => {
      if (err.code === 'DM_FEE_REQUIRED' && err.fee != null && err.fee > 0) {
        setDmFee(prev => prev ?? { required: true, fee: err.fee!, hasFreeAccess: false });
      }
    });
    return unsub;
  }, []);

  // Handle forwarded-message echo — server sends `forwardMessage` back to the sender
  // with the created message living in the TARGET conversation. Inject it into that
  // conversation's cache (if loaded) and refresh the conversations list.
  useEffect(() => {
    const unsub = onForwardMessage((msg) => {
      const rawConversation = (msg as any).conversation;
      const targetId: string =
        typeof rawConversation === 'string'
          ? rawConversation
          : rawConversation?._id || (msg as any).dmId || '';
      if (!targetId) return;
      const normalized: DmMessage = { ...msg, conversation: targetId, author: 'me' } as DmMessage;
      queryClient.setQueryData(messagesKeys.messages(targetId), (old: any) => {
        if (!old?.pages) return old;
        const firstItems = old.pages[0]?.items ?? [];
        if (firstItems.some((m: DmMessage) => m._id === normalized._id)) return old;
        const newPages = [...old.pages];
        newPages[0] = { ...newPages[0], items: [normalized, ...firstItems] };
        return { ...old, pages: newPages };
      });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    });
    return unsub;
  }, [queryClient]);

  const handleForward = useCallback((message: DmMessage) => {
    setForwardMessageTarget(message);
  }, []);

  const handleForwardSelect = useCallback(
    (targetConversationId: string) => {
      if (!forwardMessageTarget) return;
      emitForwardMessage({
        messageId: forwardMessageTarget._id,
        targetDmId: targetConversationId,
      });
      toast.success('Message forwarded');
      setForwardMessageTarget(null);
    },
    [forwardMessageTarget],
  );

  // Handle scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);
    if (distanceFromBottom < 50) setNewMessageCount(0);

    if (container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          // Restore the reading position. Prepended history grows the
          // scrollHeight from the top, so the content the user was looking at
          // moves down by exactly that growth. Dropping previousTop left them
          // pinned within 100px of the top, which immediately re-fired this
          // fetch and walked them backwards through the thread.
          container.scrollTop = container.scrollHeight - previousHeight + previousTop;
        });
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const scrollToBottom = () => {
    // Container-scoped — scrollIntoView would drag the page down with it.
    const container = scrollContainerRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setNewMessageCount(0);
  };

  const handleSendMessage = async ({
    content,
    type,
    mediaFile,
    gifUrl,
    duration,
  }: {
    content: string;
    type: 'msg' | 'media' | 'gif' | 'voice';
    mediaFile?: File;
    gifUrl?: string;
    duration?: number;
  }) => {
    let feeTxHash: string | undefined;

    // If fee is required, show optimistic message immediately, then process payment
    const paymentTempId = `temp-pay-${Date.now()}`;
    if (feeRequired) {
      // Inject optimistic "pending payment" message into the cache so user sees it immediately
      const optimisticPayMsg: DmMessage = {
        _id: paymentTempId,
        conversation: resolvedConversationId,
        sender: {
          _id: user?._id || '',
          username: user?.username || '',
          address: walletAddress || '',
          displayName: user?.displayName || user?.display_name || '',
          avatarImageUrl: user?.avatarImageUrl || '',
        },
        content,
        msgType: type || 'msg',
        mediaUrls: mediaFile
          ? [{
              url: createTransientBlobUrl(mediaFile, 5 * 60_000),
              // A document has no renderable preview, so it must not be typed
              // 'image' here — the bubble would try to <img> a blob URL for a PDF.
              type: type === 'voice' ? 'audio' : isAllowedAttachment(mediaFile.name) ? 'file' : 'image',
              mimeType: mediaFile.type,
              name: mediaFile.name,
              size: mediaFile.size,
            }]
          : gifUrl ? [{ url: gifUrl, type: 'image', mimeType: 'image/gif' }] : [],
        voiceDuration: duration ?? null,
        isRead: false,
        isEdited: false,
        editedAt: null,
        isForwarded: false,
        replyTo: null,
        paymentStatus: 'pending',
        paymentTxHash: null,
        tipAmount: activeFee,
        tipSymbol: 'DHB',
        isDeleted: false,
        author: 'me',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = { ...newPages[0], items: [optimisticPayMsg, ...newPages[0].items] };
        }
        return { ...old, pages: newPages };
      });
      setTimeout(scrollToBottom, 50);

      setIsSendingFee(true);
      try {
        // Auto-select chain: prefer Base, fall back to BNB
        const chainId = (feeBalanceBase !== null && feeBalanceBase >= activeFee)
          ? BASE_CHAIN_ID
          : BNB_CHAIN_ID;

        const recipientAddress = otherUser?.address || '';
        if (!recipientAddress) {
          toast.error('Cannot process payment: recipient address unknown');
          // Remove optimistic message
          queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
            if (!old?.pages) return old;
            const newPages = [...old.pages];
            if (newPages[0]) {
              newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
            }
            return { ...old, pages: newPages };
          });
          setIsSendingFee(false);
          return;
        }

        console.log('[DM Fee] Paying', activeFee, 'DHB to recipient:', recipientAddress, '| chain:', chainId);
        toast.loading('Processing payment...', { id: 'dm-fee-send' });

        const tipResult = await sendTip({
          tokenId: 0,
          amount: activeFee,
          to: recipientAddress,
          chainId,
          skipBalanceCheck: true,
        });
        feeTxHash = tipResult.hash;

        // Track this tx as locally confirmed so we don't show "confirming payment..." forever.
        // bump forces a render so the memoized bubble receives txConfirmed=true —
        // a bare ref mutation is invisible to React.memo's prop compare.
        if (feeTxHash) {
          confirmedTxHashes.current.add(feeTxHash.toLowerCase());
          bumpTxConfirmations();
        }

        toast.success(dhbText(`Paid ${activeFee.toLocaleString()} DHB`), { id: 'dm-fee-send', duration: 2000 });

        // Update balance after payment
        if (chainId === BASE_CHAIN_ID) {
          setFeeBalanceBase(prev => prev !== null ? prev - activeFee : null);
        } else {
          setFeeBalanceBnb(prev => prev !== null ? prev - activeFee : null);
        }
      } catch (error: unknown) {
        console.error('[DM] Fee payment failed:', error);
        const errStr = String((error as any)?.message || error).toLowerCase();
        const isSessionExpired = errStr.includes('session expired') || errStr.includes('torus keyring') || errStr.includes('unable to find matching address') || errStr.includes('log in again');
        const isPausedErr = errStr.includes('paused') || errStr.includes('erc20pausable');
        // STF (SafeTransferFrom) can be caused by DHB being paused — check on-chain
        const isSTF = errStr.includes('stf') || errStr.includes('535446') || errStr.includes('safetransfer') || errStr.includes('token transfer failed');

        if (isSessionExpired) {
          toast.error('Session expired', {
            id: 'dm-fee-send',
            description: 'Please sign in again to send this message',
            action: { label: 'Sign in', onClick: () => openLoginModal() },
            duration: 10000,
          });
        } else if (isPausedErr || (isSTF && await checkDHBPaused().catch(() => false))) {
          toast.error('DHB transactions paused', {
            id: 'dm-fee-send',
            description: 'DHB token transactions are temporarily paused on-chain. Please try again later.',
            duration: 8000,
          });
        } else {
          const message = parseTxError(error as Error);
          toast.error(message || 'Payment failed', { id: 'dm-fee-send' });
        }
        
        // Remove optimistic message on failure
        queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
          if (!old?.pages) return old;
          const newPages = [...old.pages];
          if (newPages[0]) {
            newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
          }
          return { ...old, pages: newPages };
        });
        setIsSendingFee(false);
        return;
      } finally {
        setIsSendingFee(false);
      }
    }

    // Remove the payment-optimistic temp message before mutate adds its own optimistic entry
    if (feeRequired) {
      queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
        }
        return { ...old, pages: newPages };
      });
    }

    // Now send the actual message (with txHash so server unlocks it)
    sendMessageMutation.mutate(
      {
        content,
        msgType: type,
        mediaFile,
        gifUrl,
        voiceDuration: duration,
        txHash: feeTxHash,
      },
      {
        onSuccess: (data) => {
          if (resolvedConversationId.startsWith('new_') && data.conversation) {
            setResolvedConversationId(data.conversation);
          }
          setTimeout(scrollToBottom, 100);
        },
        onError: () => {
          toast.error('Failed to send message');
        },
      }
    );
  };

  const handleDeleteConversation = () => {
    deleteConversationMutation.mutate(conversation.id, {
      onSuccess: () => {
        toast.success('Conversation deleted');
        onBack();
      },
      onError: () => {
        toast.error('Failed to delete conversation');
      },
    });
    setShowDeleteDialog(false);
  };

  const handleToggleBlock = async () => {
    setIsBlockProcessing(true);
    try {
      if (isBlocked) {
        await unblockConversation(conversation.id);
        setIsBlocked(false);
        toast.success('User unblocked');
      } else {
        await blockConversation(conversation.id);
        setIsBlocked(true);
        toast.success('User blocked');
      }
    } catch (err) {
      console.error('Block/unblock error:', err);
      toast.error(isBlocked ? 'Failed to unblock' : 'Failed to block');
    } finally {
      setIsBlockProcessing(false);
    }
  };
  const handleToggleFreeAccess = async () => {
    const targetAddress = otherUser?.address;
    if (!targetAddress) return;
    setIsFreeAccessProcessing(true);
    try {
      if (isFreeAccessGranted) {
        await revokeFreeDmAccess(targetAddress);
        setIsFreeAccessGranted(false);
        toast.success('Free DM access revoked');
      } else {
        await grantFreeDmAccess(targetAddress);
        setIsFreeAccessGranted(true);
        toast.success('Free DM access granted');
      }
    } catch (err) {
      console.error('Free access toggle error:', err);
      toast.error('Failed to update free access');
    } finally {
      setIsFreeAccessProcessing(false);
    }
  };

  const handleRetryInit = () => {
    const tried = lastTriedUserId.current;
    const useId = otherUser?._id;
    const useAddr = otherUser?.address;
    // On retry: try the other identifier (address if we tried _id, or vice versa)
    const userId = tried === useId && useAddr ? useAddr : (useId || useAddr);
    if (!userId) return;
    setInitError(false);
    lastTriedUserId.current = userId;
    createAndStart.mutate(userId, {
      onSuccess: (data) => {
        setInitError(false);
        if (data._id) setResolvedConversationId(data._id);
        if (data.dmFee) setDmFee(data.dmFee);
      },
      onError: () => setInitError(true),
    });
  };

  const isVirtualConv = resolvedConversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(resolvedConversationId);

  return (
    <div data-page-bento data-bento-flat className="h-full flex flex-col overflow-hidden relative">
      {/* Header. The shell carries no fill now, so the bar is separated by a
          hairline instead of sitting on its own slightly-lighter slab. */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <Link to={profileLink} className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div>
              <h2 className="font-semibold text-white flex items-center gap-1.5">
                <BadgedName
                  badgeBalance={(otherUser as any)?.badgeBalance}
                  username={otherUser?.username}
                >
                  {displayName}
                </BadgedName>
                <NewMemberChip address={otherUser?.address} />
              </h2>
              {otherUser?.username && (
                <p className="text-xs text-zinc-500">@{otherUser.username}</p>
              )}
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            onClick={() => {
              setShowSearchBar(prev => !prev);
              if (!showSearchBar) {
                setTimeout(() => searchInputRef.current?.focus(), 100);
              } else {
                setSearchQuery('');
              }
            }}
          >
            <Search className="w-5 h-5" />
          </Button>

          {!isGroupChat && otherUser?.address && (
            <>
              <DmVoiceCallButton
                recipientAddress={otherUser.address}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              />
              <DmVideoCallButton
                recipientAddress={otherUser.address}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              />
            </>
          )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
            {isGroupChat && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={() => setShowGroupSettings(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Group Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
              onClick={handleToggleBlock}
              disabled={isBlockProcessing}
            >
              {isBlocked ? (
                <><ShieldCheck className="w-4 h-4 mr-2" />Unblock User</>
              ) : (
                <><ShieldBan className="w-4 h-4 mr-2" />Block User</>
              )}
            </DropdownMenuItem>
            {myMessageFee > 0 && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={handleToggleFreeAccess}
                disabled={isFreeAccessProcessing}
              >
                <Gift className="w-4 h-4 mr-2" />
                {isFreeAccessGranted ? 'Revoke Free Access' : 'Grant Free Access'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-red-400 focus:text-red-400 focus:bg-zinc-700 cursor-pointer"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Search Bar */}
      {showSearchBar && (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 border-b border-zinc-700/50">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-base md:text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <button
          onClick={() => {
            const el = document.getElementById(`dm-msg-${pinnedMessage._id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-2', 'ring-blue-500/60', 'bg-blue-500/10');
              setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500/60', 'bg-blue-500/10'), 2000);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-sm w-full text-left hover:bg-blue-500/15 transition-colors cursor-pointer"
        >
          <Pin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 fill-current" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-blue-400 text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5">Pinned Message</span>
            <span className="text-blue-100/80 text-xs truncate">{pinnedMessage.content || '📎 Media'}</span>
          </div>
          <X
            onClick={(e) => { e.stopPropagation(); handleUnpinMessage(); }}
            className="ml-2 w-4 h-4 text-blue-400/50 hover:text-blue-300 flex-shrink-0 transition-colors cursor-pointer"
          />
        </button>
      )}

      {/* DM Fee banner - simple for free access */}
      {dmFee?.required && dmFee.hasFreeAccess && (
        <div className="px-4 py-2 text-xs flex items-center gap-2 bg-green-500/10 text-green-400 border-b border-green-500/20">
          <Gem className="w-3 h-3 flex-shrink-0 text-current" />
          You have free access to message this user
        </div>
      )}

      {/* Messages */}
      {isLoading ? (
        <MessagesSkeleton />
      ) : messagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <AlertCircle className="w-12 h-12 text-red-500/60 mb-3" />
          <p className="text-red-400 mb-2">Failed to load messages</p>
          <Button variant="glass" size="sm" onClick={() => refetchMessages()}>
            <RefreshCw className="w-3 h-3 mr-2" />
            Try Again
          </Button>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onPointerDown={dismissKeyboard}
          className="flex-1 min-h-0 overflow-y-auto px-4"
        >
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Fee info banner shown where messages would be */}
          {feeRequired && (
            <DmFeeInfoBanner
              fee={dmFee!.fee}
              recipientName={displayName}
              customTipAmount={customTipAmount}
              onCustomTipChange={setCustomTipAmount}
              balanceBase={feeBalanceBase}
              balanceBnb={feeBalanceBnb}
              balanceLoading={feeBalanceLoading}
            />
          )}

          {messages.length === 0 && !feeRequired && (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Say hello to start the conversation!</p>
            </div>
          )}

          {(() => {
            const searchLower = searchQuery.toLowerCase().trim();
            const filtered = searchLower
              ? messages.filter(m => (m.content || '').toLowerCase().includes(searchLower))
              : messages;

            if (filtered.length === 0 && searchLower) {
              return (
                <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
                  <Search className="w-8 h-8 mb-2 text-zinc-600" />
                  <p className="text-sm">No messages match "{searchQuery}"</p>
                </div>
              );
            }

            return filtered.map((message) => {
              const senderAddress = message.sender?.address?.toLowerCase();
              const senderId = message.sender?._id;
              const ownAddress = walletAddress?.toLowerCase();
              const ownId = user?._id;
              const isOwnMessage =
                message.author === 'me' ||
                (!!senderAddress && !!ownAddress && senderAddress === ownAddress) ||
                (!!senderId && !!ownId && senderId === ownId);

              return (
              <MessageBubble
                key={message._id}
                message={message}
                isOwnMessage={isOwnMessage}
                highlightText={searchLower}
                txConfirmed={
                  !!(message.paymentTxHash &&
                    confirmedTxHashes.current.has(message.paymentTxHash.toLowerCase()))
                }
                onPin={handlePinMessage}
                onForward={handleForward}
                onOpenImage={setFullscreenImage}
              />
            )});
          })()}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Jump to latest */}
      {(showJumpToLatest || newMessageCount > 0) && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <Button
            onClick={scrollToBottom}
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full shadow-lg relative"
            size="sm"
          >
            <ArrowDown className="w-4 h-4 mr-1" />
            {newMessageCount > 0
              ? `${newMessageCount} new message${newMessageCount > 1 ? 's' : ''}`
              : 'Jump to latest'}
          </Button>
        </div>
      )}

      {/* Init error banner — shown when createAndStart timed out for a new conversation */}
      {initError && isVirtualConv && (
        <div className="px-4 py-2.5 bg-red-950/50 border-t border-red-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-red-400 text-xs min-w-0">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Could not connect — server didn't respond</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetryInit}
            disabled={createAndStart.isPending}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0 h-7 px-2 text-xs"
          >
            {createAndStart.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Retry
          </Button>
        </div>
      )}

      {/* Chat Input — always shown, disabled send when insufficient balance */}
      <ChatInput
        initialText={initialComposerText}
        draftKey={draftScope}
        thread={smartReplyThread}
        peerName={displayName}
        onSendMessage={handleSendMessage}
        onTipClick={feeRequired ? undefined : () => setShowTipDialog(true)}
        sendDisabled={!!feeSendDisabled || (initError && isVirtualConv)}
        sendDisabledReason={
          initError && isVirtualConv
            ? 'Connection failed — tap Retry above'
            : feeSendDisabled
            ? `Insufficient DHB (need ${activeFee.toLocaleString()})`
            : undefined
        }
        isSendingFee={isSendingFee}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConversation} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Settings Drawer */}
      {isGroupChat && (
        <GroupSettingsDrawer
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          groupId={conversation.id}
          onLeft={onBack}
          onUpdated={() => {}}
        />
      )}


      {/* DM Tip Dialog */}
      <DmTipDialog
        open={showTipDialog}
        onOpenChange={setShowTipDialog}
        recipientAddress={otherUser?.address || ''}
        recipientName={displayName}
        conversationId={resolvedConversationId}
      />

      {/* DM Gated Banner */}
      {dmGateChecked && dmGated && (
        <div className="absolute inset-0 bg-zinc-900/95 backdrop-blur-sm flex items-center justify-center z-20 rounded-lg">
          <div className="text-center px-6">
            <ShieldBan className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
            <h3 className="text-white font-semibold text-lg mb-1">DMs Restricted</h3>
            <p className="text-zinc-400 text-sm">
              This user requires a subscription to receive messages.
            </p>
          </div>
        </div>
      )}
      <FullscreenImageViewer
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        isOpen={!!fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />

      {/* Forward message picker */}
      <ForwardMessageDialog
        open={!!forwardMessageTarget}
        onOpenChange={(open) => { if (!open) setForwardMessageTarget(null); }}
        onSelect={handleForwardSelect}
        excludeConversationId={resolvedConversationId}
      />
    </div>
  );
}
