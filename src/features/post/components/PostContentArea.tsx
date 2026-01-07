import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PostMediaPreview } from './PostMediaPreview';
import type { MediaFile, AudioFile, LiveMode } from '../types';
import { useEffect, useCallback, useRef } from 'react';
import { Link } from 'lucide-react';

interface PostContentAreaProps {
  text: string;
  setText: (text: string) => void;
  editorRef: React.RefObject<HTMLDivElement>;
  media: MediaFile[];
  onRemoveMedia: (index: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
  onToggleMusicVideo: (index: number) => void;
  onAddThumbnail: (index: number, thumbnailUrl: string) => void;
  onRemoveThumbnail: (index: number) => void;
  liveMode: LiveMode;
  canPost: boolean;
  destinations: string[];
  hasVideo: boolean;
}

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// Shorten URL for display
function shortenUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    // Show domain + truncated path
    const path = urlObj.pathname;
    if (path && path !== '/') {
      const shortPath = path.length > 10 ? path.substring(0, 10) + '...' : path;
      return domain + shortPath;
    }
    return domain;
  } catch {
    // Fallback: just truncate
    return url.length > 25 ? url.substring(0, 22) + '...' : url;
  }
}

export function PostContentArea({
  text,
  setText,
  editorRef,
  media,
  onRemoveMedia,
  onAddAudio,
  onRemoveAudio,
  onToggleMusicVideo,
  onAddThumbnail,
  onRemoveThumbnail,
  liveMode,
  canPost,
  destinations,
  hasVideo,
}: PostContentAreaProps) {
  const isLive = liveMode !== null;
  const isProcessingLinks = useRef(false);

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
    
    if (!URL_REGEX.test(textWithoutChips)) return;
    
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
      const text = textNode.textContent || '';
      const matches = [...text.matchAll(URL_REGEX)];
      
      if (matches.length > 0) {
        nodesToProcess.push({ node: textNode, matches });
      }
    }

    // Process nodes in reverse to maintain positions
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
      const { node, matches } = nodesToProcess[i];
      const text = node.textContent || '';
      
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      
      for (const match of matches) {
        const url = match[0];
        const index = match.index!;
        
        // Text before the URL
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
        }
        
        // Create link chip
        const chip = document.createElement('span');
        chip.setAttribute('data-link-chip', 'true');
        chip.setAttribute('data-url', url);
        chip.contentEditable = 'false';
        chip.className = 'inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-primary/20 text-primary rounded-full text-sm cursor-pointer hover:bg-primary/30 transition-colors';
        chip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>${shortenUrl(url)}</span>`;
        chip.onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
        
        fragment.appendChild(chip);
        lastIndex = index + url.length;
      }
      
      // Text after the last URL
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
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

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    
    // Get plain text including URLs from chips
    let plainText = '';
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_ALL,
      null
    );
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) {
        plainText += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.hasAttribute('data-link-chip')) {
          plainText += el.getAttribute('data-url') || '';
          // Skip children of link chip
          walker.nextSibling();
        }
      }
    }
    
    setText(plainText);
    
    // Process links after a short delay (debounce)
    setTimeout(processLinks, 300);
  }, [editorRef, setText, processLinks]);

  // Sync content when text is cleared (e.g., on form reset)
  useEffect(() => {
    if (text === '' && editorRef.current && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
    }
  }, [text, editorRef]);

  return (
    <div className="p-4 max-h-[60vh] overflow-y-auto">
      <div className="flex gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            data-placeholder={hasVideo ? "This first line is used for thumbnail titles..." : "What's happening?"}
            className="w-full bg-transparent text-white text-lg resize-none outline-none min-h-[80px] pb-5 empty:before:content-[attr(data-placeholder)] empty:before:text-white/70 empty:before:pointer-events-none"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          />
          <span className={cn("absolute bottom-0 right-0 text-xs", charCount > 280 ? "text-amber-400" : "text-white")}>
            {charCount}/280
          </span>

          <PostMediaPreview 
            media={media} 
            onRemove={onRemoveMedia}
            onAddAudio={onAddAudio}
            onRemoveAudio={onRemoveAudio}
            onToggleMusicVideo={onToggleMusicVideo}
            onAddThumbnail={onAddThumbnail}
            onRemoveThumbnail={onRemoveThumbnail}
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
                  {liveMode === 'video' ? 'Live Video' : 'Town Hall'} stream will be created
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {canPost && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 flex items-center gap-1.5 flex-wrap"
              >
                <span className="text-xs text-zinc-500">In:</span>
                {destinations.map(dest => (
                  <span
                    key={dest}
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full",
                      dest === 'Shorts' ? 'bg-emerald-500/20 text-emerald-400' :
                      dest === 'Live' ? 'bg-red-500/20 text-red-400' :
                      dest === 'Music' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-zinc-800 text-zinc-400'
                    )}
                  >
                    {dest}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
