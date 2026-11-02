import { useTranslation as _useCopy } from 'react-i18next';
import BarChart3 from "@/components/ui/cut-icons/stats";
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, MessageCircleQuestion, FileText } from "lucide-react";
import Sparkles from "@/components/ui/cut-icons/assistant";
import Reply from "@/components/ui/cut-icons/reply";
import Paperclip from "@/components/ui/cut-icons/attach";

import Send from "@/components/ui/cut-icons/send";
import X from "@/components/ui/cut-icons/close";
import Gem from "@/components/ui/cut-icons/diamond";

import { EmojiGifPicker } from './EmojiGifPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { useDraft } from '@/hooks/use-draft';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Message } from './ChatMessage';
import { VoiceRecorder } from './VoiceRecorder';
import { voiceRecordingFile } from '@/lib/voice-recording';
import { SmartReplyRail } from './SmartReplyRail';
import { useSmartReplies, type SmartReplyTurn } from '@/hooks/use-smart-replies';
import { setSmartRepliesEnabled, useSmartRepliesEnabled } from '@/hooks/use-smart-replies-enabled';
import {
  ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  getAttachmentLabel,
  validateAttachment,
} from '@/lib/attachments';
import { dragHasFiles } from '@/lib/comment-attachments';
import { cleanVideoOptions, type DmVideoOptions } from '@/lib/dm-video-options';
import type { DmDestructChoice } from '@/lib/dm-destruct';
import { DmVideoCard, DmVideoStudio } from './DmVideoStudio';

/** Per-kind caps, matching the backend's DM limits. */
const DM_MEDIA_LIMITS = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024, audio: 20 * 1024 * 1024 } as const;

export interface ChatInputSendArgs {
  content: string;
  type: 'msg' | 'media' | 'gif' | 'voice';
  mediaFile?: File;
  gifUrl?: string;
  duration?: number;
  /** Trim, cover, mirror, rotation and hide choices for a video. */
  mediaOptions?: DmVideoOptions;
  /** Self-destruct: gone after one view or a set time. */
  destruct?: DmDestructChoice;
}

interface ChatInputProps {
  onSendMessage: (args: ChatInputSendArgs) => Promise<boolean>;
  onTipClick?: () => void;
  /** Opens the create-poll drawer. */
  onPollClick?: () => void;
  /** Externally disable the send button (e.g. insufficient fee balance) */
  sendDisabled?: boolean;
  /** Label shown on disabled send tooltip */
  sendDisabledReason?: string;
  /** If true, shows a processing spinner on the send button */
  isSendingFee?: boolean;
  /**
   * Per-message DHB cost, when the recipient gates messaging behind a tip.
   * Shown directly on the send button so the cost stays visible while
   * composing, instead of only in a banner that scrolls out of view.
   */
  feeAmount?: number;
  /**
   * Awaited before a paid send proceeds — lets the parent show a one-time
   * "this costs DHB" confirmation. Resolving false leaves the composer
   * untouched (message, attachments) so a cancelled send loses nothing.
   */
  confirmBeforeSend?: () => Promise<boolean> | boolean;
  /**
   * Checked before anything leaves the composer. Returning false (after the
   * parent has said why) keeps the message and attachments in place.
   */
  canSend?: (pending: Pick<ChatInputSendArgs, 'type' | 'mediaFile'>) => boolean;
  /** Message being replied to */
  replyTo?: Message | null;
  /** Cancel the current reply */
  onCancelReply?: () => void;
  /**
   * Pre-fill the composer (e.g. a shared post routed into a fee-gated chat —
   * the user reviews the fee and sends with one tap instead of retyping).
   */
  initialText?: string;
  /**
   * Recent turns, oldest first. Supplying this turns on the reply orb; leave it
   * off and the composer is exactly what it was (Public Chat passes nothing).
   */
  thread?: SmartReplyTurn[];
  /** Who the user is talking to — labels the other side for the drafter. */
  peerName?: string;
  /**
   * Scope this composer's text is saved under, so a half-typed message survives
   * closing the thread, a reload, or the tab being shut. MUST be stable for the
   * life of the conversation — pass the peer, never the conversation id, which
   * changes under you the first time you message someone (see
   * lib/conversation-identity). Omit it and the composer behaves as before.
   */
  draftKey?: string | null;
  /**
   * Show the document picker (PDF, Office files, archives…). Documents are a
   * DM-only feature on the backend, so a room that cannot post them should
   * pass false rather than offer a file that will be refused on send.
   */
  allowDocuments?: boolean;
  voiceMaxDuration?: number;
}

export function ChatInput({ onSendMessage, onTipClick, onPollClick, sendDisabled, sendDisabledReason, isSendingFee, feeAmount, confirmBeforeSend, canSend, replyTo, onCancelReply, initialText, thread, peerName, draftKey, allowDocuments = true, voiceMaxDuration = 59 }: ChatInputProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [message, setMessage] = useDraft(draftKey, initialText ?? '');
  // initialText can arrive a tick after mount (MessagesPage sets the prefill
  // in an effect once the conversation resolves) — adopt it only while the
  // composer is still empty so we never clobber text the user typed, or a
  // draft they left here days ago.
  useEffect(() => {
    if (initialText) setMessage(prev => (prev ? prev : initialText));
  }, [initialText, setMessage]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  // imageFile holds whatever photo, clip or audio file the paperclip picked.
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'audio'>('image');
  // The picked video's sheet choices, its length, and whether the sheet is up.
  const [videoOptions, setVideoOptions] = useState<DmVideoOptions>({});
  const [videoDestruct, setVideoDestruct] = useState<DmDestructChoice | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | undefined>(undefined);
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ file: File; blob: Blob; duration: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Choosing Reply means about to type — put the caret there.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo?.id]);

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setMessage(newText),
  });

  // Down for THIS message only — the send handler drops the rail whose drafts
  // the send just invalidated. Switching the feature off is a separate thing
  // and lives in `smartRepliesEnabled`.
  const [railDismissed, setRailDismissed] = useState(false);
  const smartRepliesEnabled = useSmartRepliesEnabled();
  const smartReplies = useSmartReplies(thread ?? [], peerName);

  const hasThread = !!thread && thread.length > 0;

  // A suggested reply answers an INCOMING message. When the user holds the last
  // word there is nothing to reply to, so the rail stands down rather than
  // drafting follow-ups to oneself — and no model call is spent on it either.
  const awaitingReply = hasThread && thread![thread!.length - 1]?.from === 'them';

  const [composerFocused, setComposerFocused] = useState(false);

  // Where the rail hangs is the ONLY thing the viewport decides now: below the
  // composer on phones, where it fills the band the bottom nav vacates, and as
  // its own band above the composer on wide screens, where nothing else wants
  // the space. Same rail, same drafting, both sides of the breakpoint.
  // Gated on VIEWPORT, not pointer type — a desktop window narrowed to phone
  // width has the same layout and the same dead band, so it gets the strip.
  const [narrowViewport, setNarrowViewport] = useState(
    () => window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setNarrowViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Thread tail a draft has already been spent on. One model call per message,
  // whichever side sent it: re-rendering, re-focusing and re-showing the rail
  // must never re-spend it. A new message changes the key, which re-arms it.
  const draftedFor = useRef<string | null>(null);

  // Read through refs so the effect below can depend on the one thing that
  // should actually retrigger it — the newest message — instead of re-running
  // on every keystroke and every render of the hook.
  const latest = useRef({ smartReplies, message, hasThread });
  latest.current = { smartReplies, message, hasThread };

  /**
   * The rail is on screen with a socket and two empty slots, so waiting for a
   * focus pass before drafting would leave it showing nothing in the one
   * moment it is being looked at. Spend the call when the thread tail changes
   * instead — held back only when the user has already started typing, because
   * then they know what to say.
   *
   * Only an incoming tail is drafted against: once the user has replied, the
   * rail is gone until the other side speaks again.
   */
  // The composer being empty is a dependency, not just a condition.
  //
  // Held back while there is text, then run when it clears. Reading it out of
  // the ref alone meant the effect returned early and never came back: neither
  // hasThread nor tailKey changes when someone deletes what they typed, so the
  // draft for that tail was skipped for good. The rail then sat on 'idle',
  // which it renders as busy with the orb disabled — a pulsing skeleton over a
  // call that was never made, until the next message arrived.
  const composerEmpty = !message.trim();

  useEffect(() => {
    // Switched off is switched off: no rail, and no model call behind it.
    if (!hasThread || !awaitingReply || !composerEmpty || !smartRepliesEnabled) return;
    const { smartReplies: sr } = latest.current;
    if (draftedFor.current === sr.tailKey) return;
    draftedFor.current = sr.tailKey;
    // 'error' as well as 'idle': the hook only rewinds itself to idle when a
    // SUCCESSFUL draft goes stale, so a single failure would otherwise leave
    // the rail showing that failure for every message after it.
    if (sr.status === 'idle' || sr.status === 'error') sr.generate();
  }, [hasThread, awaitingReply, composerEmpty, smartRepliesEnabled, smartReplies.tailKey]);

  // A new message re-arms the per-message stand-down. It does NOT reopen a
  // rail the user switched off — that is what `smartRepliesEnabled` is for.
  useEffect(() => {
    setRailDismissed(false);
  }, [smartReplies.tailKey]);

  // The × switches the feature off, for every thread, until it is switched
  // back on. There is no orb anywhere else to press once it is down, so the
  // toast has to say where the switch lives — otherwise this is a control that
  // makes a feature disappear with no way back.
  const handleDismissRail = () => {
    setSmartRepliesEnabled(false);
    toast(t('messages.smartRepliesOff', 'Suggested replies turned off'), {
      description: t('messages.smartRepliesOffWhere', 'Turn them back on in Settings → Messages.'),
      action: {
        label: t('messages.smartRepliesUndo', 'Undo'),
        onClick: () => setSmartRepliesEnabled(true),
      },
    });
  };

  /**
   * Drop a suggestion into the composer rather than sending it. The user still
   * owns the send — a drafted line that fires on one tap is how the wrong
   * thing gets sent to the wrong person.
   */
  const handlePickSuggestion = (text: string) => {
    setMessage(prev => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      const end = t.value.length;
      t.setSelectionRange(end, end);
      t.style.height = 'auto';
      t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
    });
  };

  // The auto-grown textarea height is set imperatively on input, so clearing
  // the value alone leaves a tall empty composer covering the last messages.
  const resetComposerHeight = () => {
    const ta = textareaRef.current;
    if (ta) ta.style.height = 'auto';
  };

  const sendInFlight = useRef(false);
  const handleSend = async () => {
    if (sendDisabled || isSendingFee || sendInFlight.current) return;
    const pendingFile = imageFile || docFile || undefined;
    const pendingType: ChatInputSendArgs['type'] = audioPreview ? 'voice' : pendingFile ? 'media' : 'msg';
    if (pendingType === 'msg' && !message.trim()) return;
    if (canSend && !canSend({ type: pendingType, mediaFile: audioPreview ? audioPreview.file : pendingFile })) return;
    if (confirmBeforeSend && !(await confirmBeforeSend())) return;
    // Whatever is on the rail was drafted against a thread that no longer ends
    // where it did, so it goes down with the send and comes back up on the
    // next tail — as follow-ups, since the user now holds the last word.
    setRailDismissed(true);
    sendInFlight.current = true;
    try {
    if (audioPreview) {
      const sent = await onSendMessage({
        content: '',
        type: 'voice',
        mediaFile: audioPreview.file,
        duration: audioPreview.duration,
      });
      if (!sent) return;
      setAudioPreview(null);
      setMessage.complete(message, '');
      resetComposerHeight();
      return;
    }

    if (imageFile) {
      const sent = await onSendMessage({
        content: message.trim(),
        type: 'media',
        mediaFile: imageFile,
        ...(mediaKind === 'video' ? { mediaOptions: cleanVideoOptions(videoOptions, videoDuration) } : {}),
        ...(mediaKind === 'video' && videoDestruct ? { destruct: videoDestruct } : {}),
      });
      if (!sent) return;
      clearImage();
      setMessage.complete(message, '');
      resetComposerHeight();
      return;
    }

    if (docFile) {
      const sent = await onSendMessage({
        content: message.trim(),
        type: 'media',
        mediaFile: docFile,
      });
      if (!sent) return;
      clearDoc();
      setMessage.complete(message, '');
      resetComposerHeight();
      return;
    }

    if (!message.trim()) return;
    // Clear at once, like every chat app; a failed send puts the words back
    // unless something new has been typed since.
    const sent = message;
    setMessage('');
    resetComposerHeight();
    let delivered = false;
    try { delivered = await onSendMessage({ content: sent.trim(), type: 'msg' }); } catch { delivered = false; }
    if (!delivered) {
      setMessage(current => (current.trim() ? current : sent));
    }
    } finally { sendInFlight.current = false; }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.isOpen) {
      const handled = mention.handleKeyDown(e);
      if (handled) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const liveResults = (window as any).__mentionResults || [];
          if (liveResults[mention.selectedIndex]) {
            mention.handleSelect(liveResults[mention.selectedIndex]);
          }
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const newVal = message + emoji;
    setMessage(newVal);
    mention.handleInput(newVal, newVal.length);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    if (canSend && !canSend({ type: 'gif' })) return;
    onSendMessage({ content: '', type: 'gif', gifUrl });
  };

  /**
   * One paperclip for everything: a photo, a video, an audio file or (in a
   * DM) a document. Each goes to the slot it is sent from.
   */
  const attachFile = (file: File) => {
    const top = (file.type || '').split('/')[0];
    const kind = top === 'image' || top === 'video' || top === 'audio' ? top : null;
    if (kind && (kind === 'image' || allowDocuments)) {
      if (file.size > DM_MEDIA_LIMITS[kind]) {
        toast.error(kind === 'image'
          ? _copy("copy.61247515dbaa", { defaultValue: "Image must be less than 10MB" })
          : _copy("dm.attachTooLarge", { defaultValue: "\"{{name}}\" is over the {{size}} MB limit.", name: file.name, size: DM_MEDIA_LIMITS[kind] / 1024 / 1024 }));
        return;
      }
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setMediaKind(kind);
      setVideoOptions({});
    setVideoDestruct(null);
      setVideoDestruct(null);
      setVideoDuration(undefined);
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      setAudioPreview(null);
      clearDoc();
      return;
    }
    if (!allowDocuments) {
      toast.error(_copy("toasts.please_select_an_image_file", { defaultValue: "Please select an image file" }));
      return;
    }
    const check = validateAttachment(file);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    // One attachment per message — the upload route takes a single file.
    setDocFile(file);
    setAudioPreview(null);
    clearImage();
  };

  const handleAttachPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice in a row still fires.
    e.target.value = '';
    if (file) attachFile(file);
  };

  // Pasting a screenshot (or a copied file) into the composer attaches it, the
  // way dropping or picking one does. Text wins when the clipboard carries
  // both — a rich copy brings its inline images along and the words are what
  // was meant.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.getData('text/plain')) return;
    const file = e.clipboardData.files[0];
    if (!file) return;
    e.preventDefault();
    attachFile(file);
  };

  // Dropping a file on the composer attaches it here rather than opening a
  // new post (the page-wide drop skips [data-drop-attach]).
  const dropProps = {
    'data-drop-attach': true,
    onDragOver: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!dropHover) setDropHover(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropHover(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      setDropHover(false);
      const file = e.dataTransfer.files[0];
      if (file) attachFile(file);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  } as const;

  const handleVoiceRecordingComplete = (blob: Blob, duration: number) => {
    const file = voiceRecordingFile(blob);
    setAudioPreview({ file, blob, duration });
    clearImage();
    toast.success(_copy("copy.4951131f6346", { defaultValue: "Recording saved ({{value1}}s)", value1: duration }));
  };

  const handleEnhanceText = async () => {
    if (!message.trim()) {
      toast.error(_copy("copy.7530edd4f509", { defaultValue: "Enter some text to enhance" }));
      return;
    }

    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', {
        body: { text: message.trim() }
      });

      if (error) {
        toast.error(error.message || _copy("copy.95724793b6b1", { defaultValue: "Failed to enhance text" }));
        return;
      }

      if (data?.enhancedText) {
        setMessage(data.enhancedText);
        toast.success(_copy("copy.361c5b420ff8", { defaultValue: "Text enhanced!" }));
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(_copy("copy.95724793b6b1", { defaultValue: "Failed to enhance text" }));
    } finally {
      setIsEnhancing(false);
      textareaRef.current?.focus();
    }
  };

  const handleAskAssistant = () => {
    const ta = textareaRef.current;
    const tag = '@assistant ';
    let newVal: string;
    let newCursor: number;
    if (ta) {
      const start = ta.selectionStart ?? message.length;
      const end = ta.selectionEnd ?? message.length;
      const before = message.slice(0, start);
      const after = message.slice(end);
      // Avoid duplicate tag if already present at start
      if (message.toLowerCase().includes('@assistant')) {
        newVal = message;
        newCursor = end;
      } else {
        const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
        const insertion = (needsSpaceBefore ? ' ' : '') + tag;
        newVal = before + insertion + after;
        newCursor = before.length + insertion.length;
      }
    } else {
      newVal = message ? `${message} ${tag}` : tag;
      newCursor = newVal.length;
    }
    setMessage(newVal);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (t) {
        t.focus();
        t.setSelectionRange(newCursor, newCursor);
        t.style.height = 'auto';
        t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
      }
    });
  };
  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setVideoOptions({});
    setVideoDuration(undefined);
    setVideoStudioOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // No object URL to revoke — a document has no preview to render.
  const clearDoc = () => {
    setDocFile(null);
  };

  const removeAudioPreview = () => setAudioPreview(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // The rail is up in every thread whose last word belongs to the other side —
  // the only moment a suggested reply means anything. Whether the drafter found
  // something to say is still a question the rail ANSWERS, with the orb there to
  // press; that check must never gate the mount. It stands down while there is
  // typed text, and on phones while the composer holds focus: the keyboard
  // claims exactly the band it sits in.
  const showRail =
    hasThread && awaitingReply && smartRepliesEnabled && !railDismissed && !message.trim() && (!narrowViewport || !composerFocused);

  const railProps = {
    status: smartReplies.status,
    suggestions: smartReplies.suggestions,
    error: smartReplies.error,
    onGenerate: () => smartReplies.generate(),
    onPick: handlePickSuggestion,
    onDismiss: handleDismissRail,
    dismissLabel: t('messages.turnOffSmartReplies', 'Turn off suggested replies'),
  };

  return (
    <>
    {/* Wide layouts: the rail is a band of its own above the composer, where
        nothing is competing for the space. Phones get the same rail under the
        composer instead — see the strip at the foot of this file. */}
    {showRail && !narrowViewport && (
      <SmartReplyRail
        {...railProps}
        className="hidden lg:block pl-4 pr-3 pt-2.5 pb-3"
      />
    )}
    {/* No fill: both consumers (DM + Public Chat) are surface-less now, so a
       zinc-900 bar would be the only slab left on the page. Carrying no colour
       utility also puts it permanently out of reach of the Osaka/Jungle
       `#app-root` class nets, which outrank any re-declaration here. */}
    <div {...dropProps} data-drop-hover={dropHover || undefined} className={cn("shrink-0 p-3 lg:pl-4 border-t border-white/25 transition-shadow", dropHover && "ring-2 ring-inset ring-white/40 rounded-xl")}>
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-zinc-800/70 rounded-lg">
          <Reply className="w-3.5 h-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-white">{replyTo.userName}</span>
            <p className="text-xs text-zinc-400 truncate">{replyTo.content || (replyTo.type === 'gif' ? 'GIF' : _copy("copy.1aa4cb0bcca7", { defaultValue: "Image" }))}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Photo / video / audio preview */}
      {imagePreviewUrl && imageFile && mediaKind === 'video' && (
        <>
          <DmVideoCard
            url={imagePreviewUrl}
            file={imageFile}
            options={videoOptions}
            destruct={videoDestruct}
            duration={videoDuration}
            onMeta={(m) => { if (Number.isFinite(m.dur)) setVideoDuration(m.dur); }}
            onOpen={() => setVideoStudioOpen(true)}
            onRemove={clearImage}
          />
          <DmVideoStudio
            open={videoStudioOpen}
            onOpenChange={setVideoStudioOpen}
            url={imagePreviewUrl}
            file={imageFile}
            duration={videoDuration}
            options={videoOptions}
            onOptionsChange={setVideoOptions}
            destruct={videoDestruct}
            onDestructChange={setVideoDestruct}
            onRemove={clearImage}
            caption={message}
            onCaptionChange={setMessage}
            onSend={() => { void handleSend(); }}
            sendDisabled={sendDisabled || isSendingFee}
          />
        </>
      )}
      {imagePreviewUrl && mediaKind !== 'video' && (
        <div data-attach-preview={mediaKind} className={cn("mb-2 relative", mediaKind === 'audio' ? "flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg max-w-[320px]" : "inline-block")}>
          {mediaKind === 'audio' ? (
            <>
              <audio src={imagePreviewUrl} controls preload="metadata" className="h-8 max-w-[200px]" />
              <span className="min-w-0 text-xs text-zinc-400 truncate" title={imageFile?.name}>{imageFile?.name}</span>
            </>
          ) : (
          <img
            src={imagePreviewUrl}
            alt={_copy("copy.324b134f57c7", { defaultValue: "Preview" })}
            className="h-20 rounded-lg object-cover"
          />
          )}
          <button
            onClick={clearImage}
            className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-800 border border-white/20 rounded-md flex items-center justify-center hover:bg-zinc-700 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Document Preview */}
      {docFile && (
        <div className="mb-2 relative inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg max-w-[260px]">
          <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm text-white truncate" title={docFile.name}>
              {docFile.name}
            </span>
            <span className="block text-xs text-zinc-400">
              {getAttachmentLabel(docFile.name)} · {formatAttachmentSize(docFile.size)}
            </span>
          </span>
          <button
            onClick={clearDoc}
            className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-800 border border-white/20 rounded-md flex items-center justify-center hover:bg-zinc-700 transition-colors"
            aria-label={_copy("copy.595b066a8838", { defaultValue: "Remove attachment" })}
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Audio Preview */}
      {audioPreview && (
        <div className="mb-2 relative inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-white" />
          <span className="text-sm text-white">{_copy("copy.f5763184d69c", { defaultValue: "🎤 Voice message ({{value1}})", value1: formatDuration(audioPreview.duration) })}
          </span>
          <button
            onClick={removeAudioPreview}
            className="ml-2 w-5 h-5 bg-zinc-800 border border-white/20 rounded-md flex items-center justify-center hover:bg-zinc-700 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div>
        <Textarea
          ref={textareaRef}
          placeholder={_copy("copy.69518e684f06", { defaultValue: "Type a message..." })}
          value={message}
          onChange={(e) => {
            const val = e.target.value;
            setMessage(val);
            mention.handleInput(val, e.target.selectionStart);
            // Auto-resize — deferred to avoid forced synchronous reflow
            const ta = e.target;
            requestAnimationFrame(() => {
              ta.style.height = 'auto';
              ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
            });
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          className="min-h-[52px] max-h-32 resize-none bg-transparent border-none text-base md:text-sm text-white placeholder:text-zinc-500 p-0 pt-1 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
        />

        <UserMentionDropdown
          query={mention.query}
          isOpen={mention.isOpen}
          position={mention.position}
          selectedIndex={mention.selectedIndex}
          onSelectedIndexChange={mention.setSelectedIndex}
          onSelect={mention.handleSelect}
          onClose={mention.handleClose}
        />

        {/* Action buttons. Spread across the full width on touch layouts —
            bunched into the right corner they were a cramped huddle of 32px
            targets directly over the reply rail, and the thumb that reaches
            the send button cannot reach the first of them. Wide layouts keep
            the conventional right-hand cluster, where a row of icons stretched
            across 700px would read as unrelated controls. */}
        <div className="flex items-center justify-between gap-0.5 pt-1 lg:justify-end">
          {/* No orb here. The rail carries the only orb: one control, in one
              place, on every surface. */}
          {onTipClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-zinc-700"
                  onClick={onTipClick}
                >
                  <Gem className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{_copy("copy.3dd188029374", { defaultValue: "Send a tip" })}</TooltipContent>
            </Tooltip>
          )}

          {onPollClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={_copy("copy.b2b9c2e81c4c", { defaultValue: "Create Poll" })}
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={onPollClick}
                >
                  <BarChart3 className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{_copy("copy.b2b9c2e81c4c", { defaultValue: "Create Poll" })}</TooltipContent>
            </Tooltip>
          )}

          <EmojiGifPicker
            onEmojiSelect={handleEmojiSelect}
            onGifSelect={handleGifSelect}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-chat-tool="attach"
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                onClick={() => fileInputRef.current?.click()}
                aria-label={allowDocuments
                  ? _copy("dm.attachAnything", { defaultValue: "Attach a photo, video, audio or file" })
                  : _copy("copy.1aa4cb0bcca7", { defaultValue: "Image" })}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allowDocuments
              ? _copy("dm.attachAnything", { defaultValue: "Attach a photo, video, audio or file" })
              : _copy("copy.21298c62c8e5", { defaultValue: "Attach a file" })}</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept={allowDocuments ? `image/*,video/*,audio/*,${ATTACHMENT_ACCEPT}` : 'image/*'}
            onChange={handleAttachPick}
            className="hidden"
          />

          <VoiceRecorder
            maxDuration={voiceMaxDuration}
            onRecordingComplete={handleVoiceRecordingComplete}
            disabled={sendDisabled}
          />


          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                    disabled={isEnhancing}
                  >
                    {isEnhancing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{_copy("copy.11fb682be0a0", { defaultValue: "AI" })}</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-48 p-1 bg-black/80 backdrop-blur-[24px] border border-white/10 text-white"
            >
              <button
                type="button"
                onClick={(e) => {
                  handleEnhanceText();
                  // Close popover by blurring
                  (e.currentTarget.closest('[data-radix-popper-content-wrapper]') as HTMLElement | null)?.blur();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm hover:bg-white/10 transition-colors text-left"
              >
                <Wand2 className="w-4 h-4 text-zinc-300" />
                <div className="flex flex-col">
                  <span>{_copy("copy.a91c19f54936", { defaultValue: "Enhance" })}</span>
                  <span className="text-[10px] text-zinc-500">{_copy("copy.0563e717bbdb", { defaultValue: "Fix spelling & grammar" })}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAskAssistant()}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm hover:bg-white/10 transition-colors text-left"
              >
                <MessageCircleQuestion className="w-4 h-4 text-zinc-300" />
                <div className="flex flex-col">
                  <span>{_copy("copy.b8c209cdead6", { defaultValue: "Ask" })}</span>
                  <span className="text-[10px] text-zinc-500">{_copy("copy.63e722c79bfc", { defaultValue: "Tag @assistant for help" })}</span>
                </div>
              </button>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 ${feeAmount ? 'w-auto px-2 gap-1' : 'w-8'} ${sendDisabled ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
            // Don't steal focus from the textarea — keeps the on-screen
            // keyboard open across sends instead of collapsing every tap.
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={sendDisabled || isSendingFee || (!message.trim() && !imageFile && !docFile && !audioPreview)}
            title={sendDisabled ? sendDisabledReason : feeAmount ? t('messages.feePerMessage', { amount: feeAmount.toLocaleString() }) : undefined}
          >
            {isSendingFee ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {!!feeAmount && (
                  <span className={`text-[11px] font-semibold leading-none ${sendDisabled ? 'text-zinc-600' : 'text-white'}`}>
                    {feeAmount.toLocaleString()}
                  </span>
                )}
                <Send className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Phones and tablets: the same rail, under the composer, filling the
          band the bottom nav vacates while a conversation is open. It exists
          to be dismissed by use — focusing the composer raises the keyboard,
          the keyboard claims this exact space, so the rail stands down on
          focus and stays down once there is typed text. */}
      {showRail && narrowViewport && (
        <SmartReplyRail
          {...railProps}
          className="lg:hidden pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        />
      )}
    </div>
    </>
  );
}
