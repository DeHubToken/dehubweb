import { useTranslation as _useCopy } from 'react-i18next';
import type { StudioEdits } from '../lib/studioPaint';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BASE_POST_TEXT_CHARS } from '@/lib/post-text-limit';
import { abbreviateUrl } from '@/lib/link-display';
import { createLinkScanRegex, splitLeadingUrlBoundary } from '@/components/app/TranslatableText';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PostMediaPreview } from './PostMediaPreview';
import { LinkPreviews } from './LinkPreviews';
import { PollEditor } from './PollEditor';
import type { MediaFile, AudioFile, LiveMode, PollData } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import type { DraftVideoSnapshot } from '../lib/draft-video';
import { useEffect, useCallback, useRef, useState } from 'react';
import { Save, Clock, Square, Hash, AlertTriangle } from "lucide-react";
import { CONTENT_WARNING_MAX } from '@/components/app/cards/ContentWarningGate';
import Upload from "@/components/ui/cut-icons/upload";
import Calendar from "@/components/ui/cut-icons/events";

import Mic from "@/components/ui/cut-icons/mic";
import Plus from "@/components/ui/cut-icons/add";
import X from "@/components/ui/cut-icons/close";

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScheduleSheet } from './ScheduleSheet';
import { DraftsSheet, type Draft } from './DraftsSheet';
import { format } from 'date-fns';
import { UserMentionDropdown, type MentionUser } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { AssetPickerDropdown } from '@/components/app/assets/AssetPickerDropdown';
import { useAssetPicker } from '@/hooks/use-asset-picker';
import { useAssetSearch } from '@/hooks/use-asset-ref';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import { getEditorCaret, setEditorCaret, serializeEditor, editorTextNodes } from '@/lib/editor-text';
import { paintCashtags, clearCashtags } from '@/lib/cashtag-highlight';

interface PostContentAreaProps {
  text: string;
  /** Longest text this author may post — scales with their badge tier. */
  maxChars?: number;
  setText: (text: string) => void;
  editorRef: React.RefObject<HTMLDivElement>;
  media: MediaFile[];
  onRemoveMedia: (index: number) => void;
  onMoveMedia: (from: number, to: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
  onToggleMusicVideo: (index: number) => void;
  onAddThumbnail: (index: number, thumbnailUrl: string) => void;
  onRemoveThumbnail: (index: number) => void;
  onApplyFilter: (index: number, settings: FilterSettings, presetId?: string) => void;
  onClearFilter: (index: number) => void;
  onApplyCrop: (index: number, settings: CropSettings) => void;
  onClearCrop: (index: number) => void;
  onApplyTrim: (index: number, trimStart: number, trimEnd: number) => void;
  onReplaceImage: (index: number, file: File, studio?: { original: File; edits: StudioEdits }) => void;
  onSetMediaDescription?: (index: number, description: string) => void;
  /** The content warning being written, or null when the post has none. */
  contentWarning?: string | null;
  onContentWarningChange?: (text: string) => void;
  /** The poster closed the market card; the post goes out without one. */
  hideAssetCards?: boolean;
  onHideAssetCardsChange?: (hidden: boolean) => void;
  liveMode: LiveMode;
  canPost: boolean;
  destinations: string[];
  hasVideo: boolean;
  hasImage: boolean;
  hasAudio: boolean;
  onFileDrop: (files: FileList) => void;
  // Schedule/Drafts props
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
  drafts: Draft[];
  onSaveDraft: () => void;
  onLoadDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
  canSaveDraft: boolean;
  /** Quotes publish now and are not saved as drafts — hide both controls. */
  hideScheduleAndDrafts?: boolean;
  // Recording props
  isRecording?: boolean;
  recordingTime?: number;
  onStopRecording?: () => void;
  // Title props
  showTitle: boolean;
  titleText: string;
  setTitleText: (text: string) => void;
  // Category
  onOpenCategories?: () => void;
  // Poll
  poll: PollData | null;
  onPollChange: (poll: PollData | null) => void;
  onMediaFullscreenChange?: (open: boolean) => void;
  /** The attached video's early upload. */
  draftVideo?: DraftVideoSnapshot | null;
}

// Links the editor turns into chips: the same matcher the feed renders with
// (so a bare `riftn.com` chips too), plus the `<url>` text form.
type LinkMatch = { index: number; length: number; url: string; mode: 'icon' | 'text' };
function findLinks(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  const re = createLinkScanRegex();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const { leadingBoundary, url } = splitLeadingUrlBoundary(m[0]);
    const start = m.index + leadingBoundary.length;
    const wrapped = leadingBoundary.endsWith('<') && text[re.lastIndex] === '>';
    if (wrapped) {
      out.push({ index: start - 1, length: url.length + 2, url, mode: 'text' });
      re.lastIndex += 1;
    } else {
      out.push({ index: start, length: url.length, url, mode: 'icon' });
    }
  }
  return out;
}
const hasLinks = (text: string) => findLinks(text).length > 0;

// Create a link chip element. 'icon' shows 🔗; 'text' shows the address,
// shortened in the middle, and is saved as `<url>` (see lib/link-display).
// Backspace on an icon chip turns it into a text chip; again removes it.
function createLinkChip(url: string, mode: 'icon' | 'text' = 'icon'): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute('data-link-chip', 'true');
  chip.setAttribute('data-url', url);
  chip.setAttribute('data-link-mode', mode);
  chip.contentEditable = 'false';
  chip.className = mode === 'icon'
    ? 'inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-white/10 text-white rounded-lg text-sm cursor-pointer hover:bg-white/20 transition-colors'
    : 'inline mx-0.5 text-white underline underline-offset-2 decoration-white/40 cursor-pointer';
  chip.textContent = mode === 'icon' ? '🔗' : abbreviateUrl(url);
  chip.title = mode === 'icon' ? _translateCopy("copy.42484309dc66", { defaultValue: "{{value1}} — Backspace to show the link", value1: url }) : url;
  chip.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };
  return chip;
}

export function PostContentArea({
  maxChars = BASE_POST_TEXT_CHARS,
  text,
  setText,
  editorRef,
  media,
  onRemoveMedia,
  onMoveMedia,
  onAddAudio,
  onRemoveAudio,
  onToggleMusicVideo,
  onAddThumbnail,
  onRemoveThumbnail,
  onApplyFilter,
  onClearFilter,
  onApplyCrop,
  onClearCrop,
  onApplyTrim,
  onReplaceImage,
  onSetMediaDescription,
  contentWarning,
  onContentWarningChange,
  hideAssetCards,
  onHideAssetCardsChange,
  liveMode,
  canPost,
  destinations,
  hasVideo,
  hasImage,
  hasAudio,
  onFileDrop,
  scheduledDate,
  onSchedule,
  drafts,
  onSaveDraft,
  onLoadDraft,
  onDeleteDraft,
  canSaveDraft,
  hideScheduleAndDrafts = false,
  isRecording,
  recordingTime,
  onStopRecording,
  showTitle,
  titleText,
  setTitleText,
  onOpenCategories,
  poll,
  onPollChange,
  onMediaFullscreenChange,
  draftVideo,
}: PostContentAreaProps) {
  const { t: _copy } = _useCopy();
  const isLive = liveMode !== null;
  const isProcessingLinks = useRef(false);
  const linkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  
  // Get user info for avatar - exactly like DesktopSidebar
  const { user } = useAuth();
  const displayName = user?.displayName || user?.username || 'Anonymous';
  const userAvatarUrl = user?.avatarImageUrl && user?.address
    ? buildAvatarUrl(user.address, user.avatarImageUrl)
    : null;
  
  // The post text this editor last reported. A `text` that differs came from
  // outside (draft loaded, form reset, mention inserted, AI rewrite) and is
  // written into the editor; one that matches is our own typing echoing back,
  // and rewriting the DOM for it is what used to move the caret.
  const lastEmittedText = useRef<string | null>(null);

  // Mention hook - handles @mention detection and dropdown
  const mention = useMention({
    inputRef: editorRef,
    onMentionInsert: (user, newText) => {
      lastEmittedText.current = newText;
      setText(newText);
      if (editorRef.current) {
        editorRef.current.textContent = newText;
        processLinks(true);
      }
    },
  });

  // Ticker picker — same contract as the mention hook. The query lives here
  // rather than in the dropdown because the arrow keys need the results too.
  const assetPicker = useAssetPicker({
    inputRef: editorRef,
    onInsert: (_asset, newText) => {
      lastEmittedText.current = newText;
      setText(newText);
      if (editorRef.current) {
        editorRef.current.textContent = newText;
        processLinks(true);
      }
    },
  });
  const { data: assetResults = [], isFetching: assetsLoading } = useAssetSearch(
    assetPicker.query,
    assetPicker.isOpen,
  );

  // Every character counts, links included: the API enforces the tier limit on
  // the raw text, so a looser count here let posts through that it then refused.
  const charCount = text.length;

  // Tickers are painted, not wrapped (see lib/cashtag-highlight), skipping any
  // `$` inside an address that has not become a chip yet.
  const repaintCashtags = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const links = findLinks(serializeEditor(editor));
    paintCashtags(editor, (start, end) => links.some((l) => start < l.index + l.length && end > l.index));
  }, [editorRef]);

  useEffect(() => {
    const editor = editorRef.current;
    return () => { if (editor) clearCashtags(editor); };
  }, [editorRef]);

  // Turn typed links into chips. Positions are counted in post text, where a
  // chip counts as its full address, so the caret stays exactly where it was.
  // A link the caret is still touching is left alone until the writer moves on
  // (space, new line, tapping elsewhere) — chipping half an address mid-word is
  // what split links and threw the caret around. `force` chips everything:
  // pastes, blur, and text loaded from outside.
  const processLinks = useCallback((force = false) => {
    const editor = editorRef.current;
    if (!editor || isProcessingLinks.current) return;

    const caret = getEditorCaret(editor);
    const nodesToProcess: { node: Text; matches: LinkMatch[] }[] = [];
    for (const { node, start } of editorTextNodes(editor)) {
      const matches = findLinks(node.textContent || '').filter((m) => {
        // Community links get a card under the post instead of a chip.
        if (/\/app\/communities\/[a-zA-Z0-9_-]+/.test(m.url)) return false;
        if (force || caret === null) return true;
        const from = start + m.index;
        return caret < from || caret > from + m.length;
      });
      if (matches.length > 0) nodesToProcess.push({ node, matches });
    }
    if (nodesToProcess.length === 0) return;

    isProcessingLinks.current = true;
    for (const { node, matches } of nodesToProcess) {
      const nodeText = node.textContent || '';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      for (const match of matches) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(nodeText.substring(lastIndex, match.index)));
        }
        fragment.appendChild(createLinkChip(match.url, match.mode));
        lastIndex = match.index + match.length;
      }
      if (lastIndex < nodeText.length) {
        fragment.appendChild(document.createTextNode(nodeText.substring(lastIndex)));
      }
      node.parentNode?.replaceChild(fragment, node);
    }
    // A chip serializes to exactly the text it replaced, so the same offset is
    // the same spot. Put back synchronously: a frame with the caret lost is a
    // frame where the browser scrolls the editor to its start.
    if (caret !== null) setEditorCaret(editor, caret);
    isProcessingLinks.current = false;
    repaintCashtags();
  }, [editorRef, repaintCashtags]);

  // Handle input changes - preserve line breaks from contentEditable
  const handleInput = useCallback((e?: React.FormEvent<HTMLDivElement>) => {
    const editor = e?.currentTarget || editorRef.current;
    if (!editor) return;

    // Plain text with links as full addresses and line breaks kept.
    let plainText = serializeEditor(editor);

    // Enforce the tier's character limit on the post text, as the API counts it.
    if (plainText.length > maxChars) {
      const caret = getEditorCaret(editor);
      plainText = plainText.slice(0, maxChars);
      editor.textContent = plainText;
      processLinks(true);
      setEditorCaret(editor, Math.min(caret ?? maxChars, maxChars));
    }

    lastEmittedText.current = plainText;
    setText(plainText);
    repaintCashtags();

    // Trigger mention detection
    mention.handleInput(plainText);
    assetPicker.handleInput(plainText);

    // Chip finished links once typing pauses. Links still under the caret are
    // skipped, so this can be short.
    if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
    linkDebounceRef.current = setTimeout(() => processLinks(), 400);
  }, [editorRef, setText, processLinks, repaintCashtags, mention, assetPicker, maxChars]);

  // Handle paste - process links immediately
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();

    const pastedText = e.clipboardData.getData('text/plain');

    // A screenshot, or a file copied from the desktop, arrives as clipboard
    // files with no text alongside it. Route it through the same handler
    // drag-and-drop uses so it attaches instead of vanishing. Text wins when
    // both are present — copying a rich paragraph out of a document carries
    // its inline images too, and the words are what was meant.
    const files = e.clipboardData.files;
    if (!pastedText && files && files.length > 0) {
      onFileDrop(files);
      return;
    }

    if (!pastedText) return;
    
    // insertText fires the editor's own input event, which records the text.
    document.execCommand('insertText', false, pastedText);
    // Chip pasted links straight away rather than after the typing pause.
    if (hasLinks(pastedText)) processLinks(true);
    // Some browsers refuse insertText without firing input; record either way.
    handleInput();
  }, [handleInput, onFileDrop, processLinks]);

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileDrop(files);
    }
  }, [onFileDrop]);

  // Write text that came from outside into the editor (draft restore, form
  // reset after posting, share text, removing a community link).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (text === lastEmittedText.current) return;
    lastEmittedText.current = text;
    if (serializeEditor(editor) === text) return;
    const focused = document.activeElement === editor;
    editor.textContent = text;
    processLinks(true);
    if (focused) setEditorCaret(editor, text.length);
  }, [text, editorRef, processLinks]);

  useEffect(() => () => {
    if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
  }, []);

  return (
    <>
      <div 
        className="p-4 min-h-0 max-h-[60vh] overflow-y-auto relative"
        data-vaul-no-drag
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Keep identity and composer controls in their own top row. The editor
            starts below it at every breakpoint, so text can never run behind
            the controls. */}
        <div className="flex min-h-10 items-start justify-between gap-3">
          <Avatar className="w-10 h-10 shrink-0 rounded-xl">
            <AvatarImage src={userAvatarUrl || undefined} className="rounded-xl" />
            <AvatarFallback className="rounded-xl">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>

          {/* Schedule/Drafts buttons - top right corner */}
          {!hideScheduleAndDrafts && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* Schedule indicator */}
          {scheduledDate && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium"
            >
              <Clock className="w-3 h-3" />
              {format(scheduledDate, 'MMM d, h:mm a')}
            </motion.div>
          )}

          {/* Drafts count badge */}
          {drafts.length > 0 && (
            <span className="text-xs text-zinc-500">
              {drafts.length}{_copy("copy.feff3be66408", { defaultValue: " draft" })}{drafts.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Schedule button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => setShowSchedule(true)}
                aria-label={scheduledDate ? _copy("copy.559b3708d9b1", { defaultValue: "Edit schedule" }) : liveMode === 'townhall' ? _copy("copy.e6c671395de3", { defaultValue: "Schedule stage" }) : liveMode === 'video' ? _copy("copy.e8b72dfec3eb", { defaultValue: "Schedule livestream" }) : _copy("copy.f88c723a216b", { defaultValue: "Schedule post" })}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                  "bg-white/10 backdrop-blur-xl border border-white/20",
                  "hover:bg-white/20 hover:border-white/40",
                  scheduledDate && "bg-amber-500/20 border-amber-500/40"
                )}
              >
                <Calendar className="w-4 h-4 text-white" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>
              {scheduledDate ? _copy("copy.559b3708d9b1", { defaultValue: "Edit schedule" }) : liveMode === 'townhall' ? _copy("copy.e6c671395de3", { defaultValue: "Schedule stage" }) : liveMode === 'video' ? _copy("copy.e8b72dfec3eb", { defaultValue: "Schedule livestream" }) : _copy("copy.f88c723a216b", { defaultValue: "Schedule post" })}
            </TooltipContent>
          </Tooltip>

          {/* Drafts button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => setShowDrafts(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all relative",
                  "bg-white/10 backdrop-blur-xl border border-white/20",
                  "hover:bg-white/20 hover:border-white/40"
                )}
              >
                <Save className="w-4 h-4 text-white" />
                {drafts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-[3px] rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
                    {drafts.length > 9 ? '9+' : drafts.length}
                  </span>
                )}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>{_copy("copy.f592e6a4db3c", { defaultValue: "Drafts" })}</TooltipContent>
          </Tooltip>
          </div>
          )}
        </div>

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-white rounded-xl"
            >
              <Upload className="w-10 h-10 text-white mb-2" />
              <p className="text-white font-medium">{_copy("copy.37fcbf3020fb", { defaultValue: "Drop files here" })}</p>
              <p className="text-white/60 text-sm mt-1">
                {hasVideo ? _copy("copy.3b528b3e550d", { defaultValue: "Images not allowed with video" }) : hasImage ? _copy("copy.f918146e58c9", { defaultValue: "Videos not allowed with images" }) : _copy("copy.1aad167491f4", { defaultValue: "Images, videos, or audio" })}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording overlay */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-row items-center justify-center gap-4 bg-red-500/15 backdrop-blur-sm border border-red-500/40 rounded-xl p-4"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0"
              >
                <Mic className="w-5 h-5 text-white" />
              </motion.div>
              <div className="flex flex-col items-start">
                <p className="text-white font-medium text-sm">{_copy("copy.80e8dd1a5a05", { defaultValue: "Recording" })}</p>
                <p className="text-white/80 text-lg font-mono">
                  {Math.floor((recordingTime || 0) / 60).toString().padStart(2, '0')}:
                  {((recordingTime || 0) % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <motion.button
                type="button"
                onClick={onStopRecording}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10 text-sm font-medium transition-colors ml-auto"
              >
                <Square className="w-3 h-3 fill-current" />{_copy("copy.cae7d57bc067", { defaultValue: "Stop" })}</motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* One full-width editor below the avatar and control row. */}
        <div className="mt-3 min-w-0">
            {/* Content warning: shown instead of the post until a viewer opens it. */}
            {contentWarning !== null && contentWarning !== undefined && onContentWarningChange && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <input
                  type="text"
                  value={contentWarning}
                  onChange={(e) => onContentWarningChange(e.target.value)}
                  placeholder={_copy('contentWarning.placeholder')}
                  aria-label={_copy('contentWarning.label')}
                  maxLength={CONTENT_WARNING_MAX}
                  autoFocus
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/50"
                />
              </div>
            )}
            {/* Title input - shown when title toggle is on OR video/audio */}
            {(showTitle || hasVideo || hasAudio) && (
              <input
                type="text"
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder={_copy("copy.7e8cd2056da7", { defaultValue: "Title" })}
                maxLength={140}
                className="w-full bg-transparent text-white text-lg sm:text-xl font-medium resize-none outline-none mb-1 placeholder:text-white/50 sm:placeholder:text-white/70 caret-white"
              />
            )}
            <div
              ref={editorRef}
              contentEditable
              onInput={handleInput}
              onPaste={handlePaste}
              onBlur={() => {
                // Process links immediately when user leaves the editor
                if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
                processLinks(true);
              }}
              onClick={() => {
                if (editorRef.current) {
                  editorRef.current.focus();
                }
              }}
              onKeyDown={(e) => {
                // Backspace right after a link chip: 🔗 turns into the link's
                // text; a text link is removed. One keypress each, like
                // deleting a character.
                if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  const sel = window.getSelection();
                  if (sel && sel.isCollapsed && sel.rangeCount > 0) {
                    const { startContainer, startOffset } = sel.getRangeAt(0);
                    let prev: Node | null = null;
                    if (startContainer.nodeType === Node.TEXT_NODE) {
                      if (startOffset === 0) prev = startContainer.previousSibling;
                    } else {
                      prev = startContainer.childNodes[startOffset - 1] ?? null;
                    }
                    const chip = prev instanceof HTMLElement && prev.hasAttribute('data-link-chip') ? prev : null;
                    if (chip) {
                      e.preventDefault();
                      const url = chip.getAttribute('data-url') || '';
                      if (chip.getAttribute('data-link-mode') === 'text') {
                        chip.remove();
                      } else {
                        const textChip = createLinkChip(url, 'text');
                        chip.replaceWith(textChip);
                        const range = document.createRange();
                        range.setStartAfter(textChip);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                      }
                      handleInput();
                      return;
                    }
                  }
                }
                // Ticker picker first: it only claims a key while its own
                // dropdown is open, and the two cannot both be open — `@` and
                // `$` are different triggers at the same caret.
                if (assetPicker.handleKeyDown(e, assetResults)) return;
                if (mention.handleKeyDown(e)) {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const liveResults = (window as any).__mentionResults || [];
                    if (liveResults[mention.selectedIndex]) {
                      mention.handleSelect(liveResults[mention.selectedIndex]);
                    }
                  }
                }
              }}
              data-placeholder={(showTitle || hasVideo || hasAudio) ? "Description (optional)" : "What's happening?"}
              className="w-full bg-transparent text-white text-base sm:text-lg resize-none outline-none min-h-[72px] sm:min-h-[72px] empty:before:content-[attr(data-placeholder)] empty:before:text-white/50 sm:empty:before:text-white/70 empty:before:pointer-events-none empty:before:cursor-text focus:empty:before:content-['\200b'] caret-white block"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', caretColor: 'white' }}
            />
        </div>

        {/* Media preview follows the same full-width column as the editor. */}
        <div>
          <PostMediaPreview 
            media={media} 
            onRemove={onRemoveMedia}
            onMove={onMoveMedia}
            onAddAudio={onAddAudio}
            onRemoveAudio={onRemoveAudio}
            onToggleMusicVideo={onToggleMusicVideo}
            onAddThumbnail={onAddThumbnail}
            onRemoveThumbnail={onRemoveThumbnail}
            onApplyFilter={onApplyFilter}
            onClearFilter={onClearFilter}
            onApplyCrop={onApplyCrop}
            onClearCrop={onClearCrop}
            onApplyTrim={onApplyTrim}
            onReplaceImage={onReplaceImage}
            onSetDescription={onSetMediaDescription}
            onFullscreenChange={onMediaFullscreenChange}
            draftVideo={draftVideo}
          />
        </div>

        {isLive && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label={_copy("copy.39f3c85e7452", { defaultValue: "Broadcast timing" })}>
            <button type="button" aria-pressed={!scheduledDate} onClick={() => onSchedule(null)} className={cn('rounded-xl border px-3 py-2 text-xs', !scheduledDate ? 'border-white/40 bg-white/15 text-white' : 'border-white/15 text-white/60')}>{_copy("copy.d1ebd650ec05", { defaultValue: "Go live now" })}</button>
            <button type="button" aria-pressed={!!scheduledDate} onClick={() => setShowSchedule(true)} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs', scheduledDate ? 'border-amber-500/40 bg-amber-500/20 text-amber-400' : 'border-white/15 text-white/60')}>
              <Calendar className="h-4 w-4" />
              {liveMode === 'townhall' ? _copy("copy.e6c671395de3", { defaultValue: "Schedule stage" }) : _copy("copy.e8b72dfec3eb", { defaultValue: "Schedule livestream" })}
            </button>
          </div>
        )}
        {/* Link previews follow the same full-width column as the editor. */}
        <div>
          <LinkPreviews 
            text={text} 
            hideAssetCards={hideAssetCards}
            onHideAssetCardsChange={onHideAssetCardsChange}
            onRemoveCommunityLink={() => {
              // Remove community URL from text
              const cleaned = text.replace(/https?:\/\/[^\s]*\/app\/communities\/[a-zA-Z0-9_-]+/g, '').trim();
              setText(cleaned);
            }}
          />

          <AnimatePresence>
            {isLive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2"
              >
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-medium">
                  {scheduledDate ? _copy("copy.4b0528e1523d", { defaultValue: "{{value1}} will be scheduled", value1: liveMode === 'video' ? _copy("copy.9d4e6fe6676d", { defaultValue: "Livestream" }) : _copy("copy.de838855e4a6", { defaultValue: "Stage" }) }) : _copy("copy.d4e44dac1ed0", { defaultValue: "{{value1}} stream will be created", value1: liveMode === 'video' ? _copy("copy.8413551d20ff", { defaultValue: "Live Video" }) : _copy("copy.3a17aa4e4abb", { defaultValue: "Stages" }) })}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom row: destinations + character count */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className={cn(
              "flex items-center gap-1.5 flex-wrap transition-opacity duration-200",
              canPost ? "opacity-100" : "opacity-0"
            )}>
              <span className="text-xs text-zinc-500">{_copy("copy.76d6aad1a2a0", { defaultValue: "In:" })}</span>
              {destinations.map(dest => (
                <span
                  key={dest}
                  className="text-xs px-1.5 py-0.5 rounded-lg bg-white/10 text-zinc-300"
                >
                  {dest}
                </span>
              ))}
              {onOpenCategories && (
                <button
                  type="button"
                  onClick={onOpenCategories}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Hash className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className={cn("text-xs ml-auto", charCount >= maxChars ? "text-amber-400" : "text-white/60")}>
              {charCount.toLocaleString('en-US')}/{maxChars.toLocaleString('en-US')}
            </span>
          </div>
        </div>

        {/* Poll editor */}
        {poll && (
          <PollEditor
            poll={poll}
            onChange={onPollChange}
            onRemove={() => onPollChange(null)}
          />
        )}
      </div>

      {/* Schedule Sheet */}
      <ScheduleSheet
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        scheduledDate={scheduledDate}
        onSchedule={onSchedule}
        title={liveMode === 'townhall' ? _copy("copy.e6c671395de3", { defaultValue: "Schedule stage" }) : liveMode === 'video' ? _copy("copy.e8b72dfec3eb", { defaultValue: "Schedule livestream" }) : _copy("copy.765608de66a0", { defaultValue: "Schedule Post" })}
        minimumMinutes={liveMode === 'video' ? 30 : 0}
        kind={liveMode === 'townhall' ? 'stage' : liveMode === 'video' ? 'live' : 'post'}
      />

      {/* Drafts Sheet */}
      <DraftsSheet
        isOpen={showDrafts}
        onClose={() => setShowDrafts(false)}
        drafts={drafts}
        onSaveDraft={onSaveDraft}
        onLoadDraft={onLoadDraft}
        onDeleteDraft={onDeleteDraft}
        canSave={canSaveDraft}
      />

      {/* Ticker picker — tokens and stocks for a `$` being typed */}
      <AssetPickerDropdown
        isOpen={assetPicker.isOpen}
        position={assetPicker.position}
        results={assetResults}
        loading={assetsLoading}
        selectedIndex={assetPicker.selectedIndex}
        onSelectedIndexChange={assetPicker.setSelectedIndex}
        onSelect={assetPicker.handleSelect}
      />

      {/* User Mention Dropdown */}
      <UserMentionDropdown
        query={mention.query}
        isOpen={mention.isOpen}
        position={mention.position}
        selectedIndex={mention.selectedIndex}
        onSelectedIndexChange={mention.setSelectedIndex}
        onSelect={mention.handleSelect}
        onClose={mention.handleClose}
      />
    </>
  );
}
