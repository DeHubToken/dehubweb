import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Send, Sparkles, Loader2, X, Gem, Reply, Wand2, MessageCircleQuestion, Paperclip, FileText } from 'lucide-react';
import { EmojiGifPicker } from './EmojiGifPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Message } from './ChatMessage';
import { VoiceRecorder } from './VoiceRecorder';
import { SmartReplyTray } from './SmartReplyTray';
import { ReplyOrb } from './ReplyOrb';
import { useSmartReplies, type SmartReplyTurn } from '@/hooks/use-smart-replies';
import {
  ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  getAttachmentLabel,
  validateAttachment,
} from '@/lib/attachments';

interface ChatInputSendArgs {
  content: string;
  type: 'msg' | 'media' | 'gif' | 'voice';
  mediaFile?: File;
  gifUrl?: string;
  duration?: number;
}

interface ChatInputProps {
  onSendMessage: (args: ChatInputSendArgs) => void;
  onTipClick?: () => void;
  /** Externally disable the send button (e.g. insufficient fee balance) */
  sendDisabled?: boolean;
  /** Label shown on disabled send tooltip */
  sendDisabledReason?: string;
  /** If true, shows a processing spinner on the send button */
  isSendingFee?: boolean;
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
}

export function ChatInput({ onSendMessage, onTipClick, sendDisabled, sendDisabledReason, isSendingFee, replyTo, onCancelReply, initialText, thread, peerName }: ChatInputProps) {
  const [message, setMessage] = useState(initialText ?? '');
  // initialText can arrive a tick after mount (MessagesPage sets the prefill
  // in an effect once the conversation resolves) — adopt it only while the
  // composer is still empty so we never clobber text the user typed.
  useEffect(() => {
    if (initialText) setMessage(prev => (prev ? prev : initialText));
  }, [initialText]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ file: File; blob: Blob; duration: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setMessage(newText),
  });

  const [showReplyTray, setShowReplyTray] = useState(false);
  const smartReplies = useSmartReplies(thread ?? [], peerName);
  const hasThread = !!thread && thread.length > 0;
  // There is only something to reply TO when the other side spoke last — if the
  // user sent the last message the drafter would be answering the user.
  //
  // This decides whether we SPEND A MODEL CALL. It must never also decide
  // whether the tray mounts: it was the outer render condition once, and
  // because the user's own message is the newest after every single send, the
  // feature silently ceased to exist for the rest of the conversation — no
  // panel, no orb, no empty state, nothing to press to find out why.
  const canDraft = hasThread && thread![thread!.length - 1].from === 'them';

  const [composerFocused, setComposerFocused] = useState(false);

  // Below tablet width the resting strip under the composer replaces the
  // focus-raised tray: the orb and two drafts sit in the space the mobile
  // bottom nav vacates, and stand down the moment the keyboard comes up.
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

  // Tail the tray has already opened itself for. One auto-open per incoming
  // message: dismissing must not be undone by the next click into the box, and
  // re-focusing must not re-spend a model call. A new message changes the key,
  // which re-arms it on its own.
  const autoOpenedFor = useRef<string | null>(null);

  // Read through refs so the effect below can depend on the two things that
  // should actually retrigger it — focus and the newest message — instead of
  // re-running on every keystroke and every render of the hook.
  const latest = useRef({ smartReplies, message, canDraft, hasThread });
  latest.current = { smartReplies, message, canDraft, hasThread };

  /**
   * Being in the composer to reply IS the request for suggestions — there is
   * no button to press first. Held back only when the user has already started
   * typing (they know what to say) or when this message has had its turn.
   *
   * Note this opens whenever there is a conversation at all, not only when
   * there is something to draft. A tray that says "nothing to reply to yet" is
   * a feature the user can see; one that declines to mount is indistinguishable
   * from one that is broken.
   */
  const openTrayIfDue = () => {
    const { smartReplies: sr, message: msg, canDraft: draftable, hasThread: any } = latest.current;
    if (!any || msg.trim()) return;
    if (autoOpenedFor.current === sr.tailKey) return;
    autoOpenedFor.current = sr.tailKey;
    setShowReplyTray(true);
    if (draftable && sr.status === 'idle') sr.generate();
  };

  // Fires on the click into the box, and again if a new message lands while
  // the user is already sitting there — otherwise the tray would wait for them
  // to click away and back before offering anything. Narrow layouts never
  // raise a tray on focus; their drafts are spent by the tail effect below.
  useEffect(() => {
    if (!narrowViewport && composerFocused) openTrayIfDue();
  }, [narrowViewport, composerFocused, smartReplies.tailKey]);

  // The resting strip is already on screen, so waiting for a focus pass to
  // draft would be pointless — spend the call when the thread tail changes
  // instead, under the same once-per-message discipline as openTrayIfDue.
  useEffect(() => {
    if (!narrowViewport) return;
    const { smartReplies: sr, canDraft: draftable, message: msg } = latest.current;
    if (!draftable || msg.trim()) return;
    if (sr.status === 'idle') sr.generate();
  }, [narrowViewport, smartReplies.tailKey]);

  const handleDismissTray = () => {
    // Stays dismissed for this message — autoOpenedFor is already set, so the
    // next focus won't drag it back up.
    setShowReplyTray(false);
  };

  /**
   * Drop a suggestion into the composer rather than sending it. The user still
   * owns the send — a drafted line that fires on one tap is how the wrong
   * thing gets sent to the wrong person.
   */
  const handlePickSuggestion = (text: string) => {
    setMessage(prev => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
    setShowReplyTray(false);
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

  const handleSend = () => {
    if (sendDisabled || isSendingFee) return;
    // Whatever is in the tray was drafted against a thread that no longer ends
    // where it did, so it goes away with the send.
    setShowReplyTray(false);
    if (audioPreview) {
      onSendMessage({
        content: '',
        type: 'voice',
        mediaFile: audioPreview.file,
        duration: audioPreview.duration,
      });
      setAudioPreview(null);
      setMessage('');
      resetComposerHeight();
      return;
    }

    if (imageFile) {
      onSendMessage({
        content: message.trim(),
        type: 'media',
        mediaFile: imageFile,
      });
      clearImage();
      setMessage('');
      resetComposerHeight();
      return;
    }

    if (docFile) {
      onSendMessage({
        content: message.trim(),
        type: 'media',
        mediaFile: docFile,
      });
      clearDoc();
      setMessage('');
      resetComposerHeight();
      return;
    }

    if (!message.trim()) return;
    onSendMessage({ content: message.trim(), type: 'msg' });
    setMessage('');
    resetComposerHeight();
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
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const newVal = message + emoji;
    setMessage(newVal);
    mention.handleInput(newVal, newVal.length);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    onSendMessage({ content: '', type: 'gif', gifUrl });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setAudioPreview(null);
    clearDoc();
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice in a row still fires.
    e.target.value = '';
    if (!file) return;

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

  const handleVoiceRecordingComplete = (blob: Blob, duration: number) => {
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
    setAudioPreview({ file, blob, duration });
    clearImage();
    toast.success(`Recording saved (${duration}s)`);
  };

  const handleEnhanceText = async () => {
    if (!message.trim()) {
      toast.error('Enter some text to enhance');
      return;
    }

    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', {
        body: { text: message.trim() }
      });

      if (error) {
        toast.error(error.message || 'Failed to enhance text');
        return;
      }

      if (data?.enhancedText) {
        setMessage(data.enhancedText);
        toast.success('Text enhanced!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to enhance text');
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // No object URL to revoke — a document has no preview to render.
  const clearDoc = () => {
    setDocFile(null);
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const removeAudioPreview = () => setAudioPreview(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 'idle' is unresolved, not empty: draftable means the call is on its way,
  // so it reads as loading; the user spoke last and nothing will ever come.
  const barStatus =
    smartReplies.status === 'idle'
      ? canDraft ? 'loading' as const : 'empty' as const
      : smartReplies.status;
  // The strip fills the band in EVERY open thread — a thread with nothing to
  // reply to still gets its quiet one-liner, because an empty band and a
  // broken feature are indistinguishable at a glance.
  const showReplyBar =
    narrowViewport && hasThread && !composerFocused && !message.trim();

  return (
    <>
    {/* Mounts on showReplyTray alone — wide screens only. Whether there is
        anything to draft is a question the tray ANSWERS — as its own empty
        line, with the orb still there to press — not one that decides whether
        it exists. Narrow viewports show the resting strip below instead. */}
    {!narrowViewport && showReplyTray && (
      <SmartReplyTray
        status={canDraft ? smartReplies.status : 'empty'}
        suggestions={canDraft ? smartReplies.suggestions : []}
        error={smartReplies.error}
        onGenerate={() => { if (latest.current.canDraft) smartReplies.generate(); }}
        onPick={handlePickSuggestion}
        onDismiss={handleDismissTray}
      />
    )}
    {/* No fill: both consumers (DM + Public Chat) are surface-less now, so a
       zinc-900 bar would be the only slab left on the page. Carrying no colour
       utility also puts it permanently out of reach of the Osaka/Jungle
       `#app-root` class nets, which outrank any re-declaration here. */}
    <div className="p-3 lg:pl-4 border-t border-white/[0.07]">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-zinc-800/70 rounded-lg border-l-2 border-white/30">
          <Reply className="w-3.5 h-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-white">{replyTo.userName}</span>
            <p className="text-xs text-zinc-400 truncate">{replyTo.content || (replyTo.type === 'gif' ? 'GIF' : 'Image')}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Image Preview */}
      {imagePreviewUrl && (
        <div className="mb-2 relative inline-block">
          <img
            src={imagePreviewUrl}
            alt="Preview"
            className="h-20 rounded-lg object-cover"
          />
          <button
            onClick={clearImage}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
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
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            aria-label="Remove attachment"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Audio Preview */}
      {audioPreview && (
        <div className="mb-2 relative inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-white">
            🎤 Voice message ({formatDuration(audioPreview.duration)})
          </span>
          <button
            onClick={removeAudioPreview}
            className="ml-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div>
        <Textarea
          ref={textareaRef}
          placeholder="Type a message..."
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
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          className="min-h-[40px] max-h-32 resize-none bg-transparent border-none text-base md:text-sm text-white placeholder:text-zinc-500 p-0 pt-1 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0"
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

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-0.5 pt-1">
          {/* No orb here. The tray raises itself when the composer takes focus,
              and the only orb is the one at the bottom of that tray. */}
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
              <TooltipContent>Send a tip</TooltipContent>
            </Tooltip>
          )}

          <EmojiGifPicker
            onEmojiSelect={handleEmojiSelect}
            onGifSelect={handleGifSelect}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            onClick={() => fileInputRef.current?.click()}
          >
            <Image className="w-5 h-5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                onClick={() => docInputRef.current?.click()}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach a file</TooltipContent>
          </Tooltip>
          <input
            ref={docInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={handleDocUpload}
            className="hidden"
          />

          <VoiceRecorder
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
              <TooltipContent>AI</TooltipContent>
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
                  <span>Enhance</span>
                  <span className="text-[10px] text-zinc-500">Fix spelling & grammar</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAskAssistant()}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm hover:bg-white/10 transition-colors text-left"
              >
                <MessageCircleQuestion className="w-4 h-4 text-zinc-300" />
                <div className="flex flex-col">
                  <span>Ask</span>
                  <span className="text-[10px] text-zinc-500">Tag @assistant for help</span>
                </div>
              </button>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${sendDisabled ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
            // Don't steal focus from the textarea — keeps the on-screen
            // keyboard open across sends instead of collapsing every tap.
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={sendDisabled || isSendingFee || (!message.trim() && !imageFile && !docFile && !audioPreview)}
            title={sendDisabled ? sendDisabledReason : undefined}
          >
            {isSendingFee ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Narrow-viewport resting strip: chip — orb — chip, filling the band
          the mobile bottom nav vacates while a conversation is open. It exists
          to be dismissed by use: focusing the composer raises the keyboard,
          the keyboard claims this exact space, so the strip stands down on
          focus and stays down once there is typed text. A thread with nothing
          to draft keeps a quiet one-liner so the band never just looks dead. */}
      {showReplyBar && (
        <div className="lg:hidden px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {barStatus === 'error' || barStatus === 'empty' ? (
            <p className="text-center text-[11px] text-zinc-500 py-2.5 truncate">
              {barStatus === 'empty'
                ? "Nothing to reply to yet — you sent the last message."
                : smartReplies.error || 'Could not draft replies'}
            </p>
          ) : (
            <div className="flex items-stretch gap-2">
              {(barStatus === 'loading'
                ? [null, null]
                : [...smartReplies.suggestions.slice(0, 2)])
                .map((s, i) => (
                  <button
                    key={s ? `${s.label}-${i}` : `strip-${i}`}
                    type="button"
                    disabled={!s}
                    onClick={() => s && handlePickSuggestion(s.text)}
                    aria-label={s ? `${s.label}: ${s.text}` : 'Drafting a reply'}
                    className={`min-w-0 flex-1 min-h-[60px] rounded-2xl border p-2 text-left flex flex-col justify-between transition-colors ${
                      s
                        ? 'bg-white/[0.045] border-white/10 active:bg-white/[0.09]'
                        : barStatus === 'loading'
                        ? 'bg-white/[0.03] border-white/[0.07] cursor-default'
                        : 'invisible'
                    }`}
                  >
                    {s ? (
                      <>
                        <span className="self-start rounded-full bg-white/10 border border-white/15 px-1.5 text-[9px] leading-4 text-zinc-300">
                          {s.label}
                        </span>
                        <span className="mt-1 text-[12px] leading-snug text-white line-clamp-2">
                          {s.text}
                        </span>
                      </>
                    ) : (
                      <span className="block w-full space-y-1.5">
                        <span className="block h-2.5 w-full rounded bg-white/[0.07] animate-pulse" />
                        <span className="block h-2.5 w-2/3 rounded bg-white/[0.07] animate-pulse" />
                      </span>
                    )}
                  </button>
                ))}
              <div className="flex items-center justify-center shrink-0 px-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (canDraft) smartReplies.generate(); }}
                  disabled={barStatus === 'loading' || !canDraft}
                  aria-label={barStatus === 'loading' ? 'Drafting replies' : 'Draft new replies'}
                  className="rounded-full p-1 transition-transform active:scale-95 disabled:opacity-60"
                >
                  <ReplyOrb state={barStatus === 'loading' ? 'thinking' : 'idle'} size={44} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
