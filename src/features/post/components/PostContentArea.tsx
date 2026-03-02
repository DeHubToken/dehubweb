import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PostMediaPreview } from './PostMediaPreview';
import { LinkPreviews } from './LinkPreviews';
import type { MediaFile, AudioFile, LiveMode } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import { useEffect, useCallback, useRef, useState } from 'react';
import { Upload, Calendar, Save, Clock, Mic, Square, Plus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScheduleSheet } from './ScheduleSheet';
import { DraftsSheet, type Draft } from './DraftsSheet';
import { format } from 'date-fns';
import { UserMentionDropdown, type MentionUser } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import { ChainSelector, type ChainId } from '@/components/app/ChainSelector';

interface PostContentAreaProps {
  text: string;
  setText: (text: string) => void;
  description: string;
  setDescription: (description: string) => void;
  showDescription: boolean;
  setShowDescription: (show: boolean) => void;
  editorRef: React.RefObject<HTMLDivElement>;
  media: MediaFile[];
  onRemoveMedia: (index: number) => void;
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
  liveMode: LiveMode;
  canPost: boolean;
  destinations: string[];
  hasVideo: boolean;
  hasImage: boolean;
  onFileDrop: (files: FileList) => void;
  // Schedule/Drafts props
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
  drafts: Draft[];
  onSaveDraft: () => void;
  onLoadDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
  canSaveDraft: boolean;
  // Recording props
  isRecording?: boolean;
  recordingTime?: number;
  onStopRecording?: () => void;
  // Chain selector props
  chainId: ChainId;
  onChainChange: (chainId: ChainId) => void;
}

// URL regex pattern - create fresh each time to avoid state issues with global flag
const createUrlRegex = () => /(https?:\/\/[^\s<]+)/g;

// Create a link chip element
function createLinkChip(url: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute('data-link-chip', 'true');
  chip.setAttribute('data-url', url);
  chip.contentEditable = 'false';
  chip.className = 'inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-primary/20 text-primary rounded-lg text-sm cursor-pointer hover:bg-primary/30 transition-colors';
  chip.innerHTML = `🔗`;
  chip.title = url;
  chip.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return chip;
}

export function PostContentArea({
  text,
  setText,
  description,
  setDescription,
  showDescription,
  setShowDescription,
  editorRef,
  media,
  onRemoveMedia,
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
  liveMode,
  canPost,
  destinations,
  hasVideo,
  hasImage,
  onFileDrop,
  scheduledDate,
  onSchedule,
  drafts,
  onSaveDraft,
  onLoadDraft,
  onDeleteDraft,
  canSaveDraft,
  isRecording,
  recordingTime,
  onStopRecording,
  chainId,
  onChainChange,
}: PostContentAreaProps) {
  const isLive = liveMode !== null;
  const isProcessingLinks = useRef(false);
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
  
  // Mention hook - handles @mention detection and dropdown
  const mention = useMention({
    inputRef: editorRef,
    onMentionInsert: (user, newText) => {
      setText(newText);
      if (editorRef.current) {
        editorRef.current.textContent = newText;
        // Re-apply link chips after mention insertion
        setTimeout(processLinks, 0);
      }
    },
  });

  const charCount = text.length;

  // Save and restore cursor position
  const saveCursorPosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current!);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    
    return preCaretRange.toString().length;
  }, [editorRef]);

  const restoreCursorPosition = useCallback((position: number) => {
    if (!editorRef.current || position === null) return;
    
    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentPos = 0;
    let node: Text | null = null;

    while (walker.nextNode()) {
      node = walker.currentNode as Text;
      const nodeLength = node.textContent?.length || 0;
      
      if (currentPos + nodeLength >= position) {
        const range = document.createRange();
        range.setStart(node, Math.min(position - currentPos, nodeLength));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      currentPos += nodeLength;
    }
  }, [editorRef]);

  // Process links in the content
  const processLinks = useCallback(() => {
    if (!editorRef.current || isProcessingLinks.current) return;
    
    const editor = editorRef.current;
    const html = editor.innerHTML;
    
    // Check if there are unprocessed URLs (not already in link chips)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content without link chips
    const linkChips = tempDiv.querySelectorAll('[data-link-chip]');
    linkChips.forEach(chip => chip.remove());
    const textWithoutChips = tempDiv.textContent || '';
    
    if (!createUrlRegex().test(textWithoutChips)) return;
    
    isProcessingLinks.current = true;
    const cursorPos = saveCursorPosition();
    
    // Process text nodes only (not link chips)
    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip text inside link chips
          if ((node.parentElement as HTMLElement)?.closest('[data-link-chip]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodesToProcess: { node: Text; matches: RegExpMatchArray[] }[] = [];
    
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const nodeText = textNode.textContent || '';
      const matches = [...nodeText.matchAll(createUrlRegex())];
      
      if (matches.length > 0) {
        nodesToProcess.push({ node: textNode, matches });
      }
    }

    // Process nodes in reverse to maintain positions
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
      const { node, matches } = nodesToProcess[i];
      const nodeText = node.textContent || '';
      
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      
      for (const match of matches) {
        const url = match[0];
        const index = match.index!;
        
        // Text before the URL
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(nodeText.substring(lastIndex, index)));
        }
        
        // Create link chip using helper function
        fragment.appendChild(createLinkChip(url));
        lastIndex = index + url.length;
      }
      
      // Text after the last URL
      if (lastIndex < nodeText.length) {
        fragment.appendChild(document.createTextNode(nodeText.substring(lastIndex)));
      }
      
      node.parentNode?.replaceChild(fragment, node);
    }

    // Restore cursor
    if (cursorPos !== null) {
      setTimeout(() => {
        restoreCursorPosition(cursorPos);
        isProcessingLinks.current = false;
      }, 0);
    } else {
      isProcessingLinks.current = false;
    }
  }, [editorRef, saveCursorPosition, restoreCursorPosition]);

  // Handle input changes - preserve line breaks from contentEditable
  const handleInput = useCallback((e?: React.FormEvent<HTMLDivElement>) => {
    const editor = e?.currentTarget || editorRef.current;
    if (!editor) return;
    
    // Get plain text including URLs from chips and preserving line breaks
    let plainText = '';
    
    const processNode = (node: Node, isFirst: boolean = false) => {
      if (node.nodeType === Node.TEXT_NODE) {
        plainText += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toUpperCase();
        
        // Handle link chips specially - skip their children
        if (el.hasAttribute('data-link-chip')) {
          plainText += el.getAttribute('data-url') || '';
          return;
        }
        
        // BR elements become newlines
        if (tagName === 'BR') {
          plainText += '\n';
          return;
        }
        
        // Block elements (DIV, P) add newline before (except first)
        const isBlock = tagName === 'DIV' || tagName === 'P';
        if (isBlock && !isFirst && plainText.length > 0 && !plainText.endsWith('\n')) {
          plainText += '\n';
        }
        
        // Process children recursively
        let first = true;
        for (const child of el.childNodes) {
          processNode(child, first && isFirst);
          first = false;
        }
      }
    };
    
    // Process all children of editor
    let first = true;
    for (const child of editor.childNodes) {
      processNode(child, first);
      first = false;
    }
    
    setText(plainText);
    
    // Trigger mention detection
    mention.handleInput(plainText);
    
    // Process links after a short delay (debounce)
    setTimeout(processLinks, 300);
  }, [editorRef, setText, processLinks, mention]);

  // Handle paste - process links immediately
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    
    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText) return;
    
    const urlRegex = createUrlRegex();
    const hasUrls = urlRegex.test(pastedText);
    
    if (hasUrls) {
      // Process URLs in pasted text and insert with chips
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      
      // Reset regex and find all matches
      const matches = [...pastedText.matchAll(createUrlRegex())];
      
      for (const match of matches) {
        const url = match[0];
        const index = match.index!;
        
        // Text before the URL
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(pastedText.substring(lastIndex, index)));
        }
        
        // Create link chip
        fragment.appendChild(createLinkChip(url));
        lastIndex = index + url.length;
      }
      
      // Text after the last URL
      if (lastIndex < pastedText.length) {
        fragment.appendChild(document.createTextNode(pastedText.substring(lastIndex)));
      }
      
      // Insert at cursor
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      // No URLs, just insert plain text
      document.execCommand('insertText', false, pastedText);
    }
    
    // Update state
    handleInput();
  }, [handleInput]);

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

  // Sync content when text is cleared (e.g., on form reset)
  useEffect(() => {
    if (text === '' && editorRef.current && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
    }
  }, [text, editorRef]);

  return (
    <>
      <div 
        className="p-4 max-h-[60vh] overflow-y-auto relative"
        data-vaul-no-drag
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Mobile: Avatar in absolute top left */}
        <div className="absolute top-3 left-4 z-10 sm:hidden">
          <Avatar className="w-8 h-8 rounded-xl">
            <AvatarImage src={userAvatarUrl || undefined} className="rounded-xl" />
            <AvatarFallback className="rounded-xl">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>

        {/* Schedule/Drafts/Chain buttons - top right corner */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
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
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Chain selector button */}
          <ChainSelector
            selectedChainId={chainId}
            onChainChange={onChainChange}
            variant="icon"
          />

          {/* Schedule button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => setShowSchedule(true)}
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
              {scheduledDate ? 'Edit schedule' : 'Schedule post'}
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
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
                    {drafts.length}
                  </span>
                )}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Drafts</TooltipContent>
          </Tooltip>
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
              <p className="text-white font-medium">Drop files here</p>
              <p className="text-white/60 text-sm mt-1">
                {hasVideo ? 'Images not allowed with video' : hasImage ? 'Videos not allowed with images' : 'Images, videos, or audio'}
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
                <p className="text-white font-medium text-sm">Recording</p>
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
                <Square className="w-3 h-3 fill-current" />
                Stop
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Unified: Avatar (desktop flex row) + single contentEditable for both mobile/desktop */}
        <div className="flex gap-3">
          {/* Desktop avatar — hidden on mobile (mobile has absolute avatar above) */}
          <div className="hidden sm:flex flex-shrink-0">
            <Avatar className="w-10 h-10 rounded-xl">
              <AvatarImage src={userAvatarUrl || undefined} className="rounded-xl" />
              <AvatarFallback className="rounded-xl">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0 mt-12 sm:mt-0">
            <div
              ref={editorRef}
              contentEditable
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={(e) => {
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
              data-placeholder={hasVideo ? "First line used as title..." : "What's happening?"}
              className="w-full bg-transparent text-white text-base sm:text-lg resize-none outline-none min-h-[48px] sm:min-h-[60px] empty:before:content-[attr(data-placeholder)] empty:before:text-white/50 sm:empty:before:text-white/70 empty:before:pointer-events-none"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            />
          </div>
        </div>

        {/* Media preview - full width on mobile, breaks out of avatar indent */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 sm:pl-[52px]">
          <PostMediaPreview 
            media={media} 
            onRemove={onRemoveMedia}
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
          />
        </div>

        {/* Link previews - with proper indent on desktop */}
        <div className="sm:pl-[52px]">
          <LinkPreviews text={text} />

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
                  {liveMode === 'video' ? 'Live Video' : 'Town Hall'} stream will be created
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom row: destinations + character count */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <AnimatePresence>
              {canPost && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-1.5 flex-wrap"
                >
                  <span className="text-xs text-zinc-500">In:</span>
                  {destinations.map(dest => (
                    <span
                      key={dest}
                      className="text-xs px-1.5 py-0.5 rounded-lg bg-white/10 text-zinc-300"
                    >
                      {dest}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <span className={cn("text-xs ml-auto", charCount > 280 ? "text-amber-400" : "text-white/60")}>
              {charCount}/280
            </span>
          </div>
        </div>
      </div>

      {/* Schedule Sheet */}
      <ScheduleSheet
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        scheduledDate={scheduledDate}
        onSchedule={onSchedule}
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
