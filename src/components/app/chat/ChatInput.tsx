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
import { SmartReplyRail } from './SmartReplyRail';
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

  const [railDismissed, setRailDismissed] = useState(false);
  const smartReplies = useSmartReplies(thread ?? [], peerName);
  const hasThread = !!thread && thread.length > 0;

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
   * The drafter handles both directions: an incoming tail gets replies, the
   * user's own last word gets follow-ups.
   */
  useEffect(() => {
    if (!hasThread) return;
    const { smartReplies: sr, message: msg } = latest.current;
    if (msg.trim()) return;
    if (draftedFor.current === sr.tailKey) return;
    draftedFor.current = sr.tailKey;
    // 'error' as well as 'idle': the hook only rewinds itself to idle when a
    // SUCCESSFUL draft goes stale, so a single failure would otherwise leave
    // the rail showing that failure for every message after it.
    if (sr.status === 'idle' || sr.status === 'error') sr.generate();
  }, [hasThread, smartReplies.tailKey]);

  // A new message re-arms a dismissed rail. Dismissing is "not for this
  // message", not "never again" — the alternative is a feature the user can
  // switch off by accident and never find again, since there is no orb
  // anywhere else to press.
  useEffect(() => {
    setRailDismissed(false);
  }, [smartReplies.tailKey]);

  const handleDismissRail = () => setRailDismissed(true);

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

  const handleSend = () => {
    if (sendDisabled || isSendingFee) return;
    // Whatever is on the rail was drafted against a thread that no longer ends
    // where it did, so it goes down with the send and comes back up on the
    // next tail — as follow-ups, since the user now holds the last word.
    setRailDismissed(true);
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

  // The rail is up in EVERY open thread — a thread with nothing to reply to
  // still gets its quiet one-liner, because an empty band and a broken feature
  // are indistinguishable at a glance. It stands down while there is typed
  // text, and on phones while the composer holds focus: the keyboard claims
  // exactly the band it sits in.
  const showRail =
    hasThread && !railDismissed && !message.trim() && (!narrowViewport || !composerFocused);

  const railProps = {
    status: smartReplies.status,
    suggestions: smartReplies.suggestions,
    error: smartReplies.error,
    onGenerate: () => smartReplies.generate(),
    onPick: handlePickSuggestion,
    onDismiss: handleDismissRail,
  };

  return (
    <>
    {/* Wide layouts: the rail is a band of its own above the composer, where
        nothing is competing for the space. Phones get the same rail under the
        composer instead — see the strip at the foot of this file. */}
    {showRail && !narrowViewport && (
      <SmartReplyRail
        {...railProps}
        className="hidden lg:block pl-4 pr-3 pt-2.5 pb-3 border-t border-white/[0.07]"
      />
    )}
    {/* No fill: both consumers (DM + Public Chat) are surface-less now, so a
       zinc-900 bar would be the only slab left on the page. Carrying no colour
       utility also puts it permanently out of reach of the Osaka/Jungle
       `#app-root` class nets, which outrank any re-declaration here. */}
    <div className="shrink-0 p-3 lg:pl-4 border-t border-white/[0.07]">
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

      {/* Phones and tablets: the same rail, under the composer, filling the
          band the bottom nav vacates while a conversation is open. It exists
          to be dismissed by use — focusing the composer raises the keyboard,
          the keyboard claims this exact space, so the rail stands down on
          focus and stays down once there is typed text. */}
      {showRail && narrowViewport && (
        <SmartReplyRail
          {...railProps}
          className="lg:hidden pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        />
      )}
    </div>
    </>
  );
}
