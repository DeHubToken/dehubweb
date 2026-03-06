/**
 * useMention Hook
 * ================
 * Handles @mention detection and dropdown state for text inputs.
 * Works with both contentEditable elements and regular textareas.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MentionUser } from '@/components/app/mentions';

interface UseMentionOptions {
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | HTMLDivElement | null>;
  onMentionInsert?: (user: MentionUser, newText: string) => void;
}

interface UseMentionReturn {
  // State
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
  selectedIndex: number;
  
  // Actions
  handleInput: (text: string, cursorPosition?: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean; // Returns true if event was handled
  handleSelect: (user: MentionUser) => void;
  handleClose: () => void;
  setSelectedIndex: (index: number) => void;
}

// Extract @mention query from text at cursor position
function extractMentionQuery(text: string, cursorPos: number): { query: string; startIndex: number } | null {
  // Look backwards from cursor for @
  let startIndex = -1;
  
  for (let i = cursorPos - 1; i >= 0; i--) {
    const char = text[i];
    
    // Stop at whitespace or start of text
    if (/\s/.test(char)) {
      break;
    }
    
    // Found @
    if (char === '@') {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) return null;
  
  // Extract query (characters after @)
  const query = text.substring(startIndex + 1, cursorPos);
  
  // Must have at least 1 character after @
  if (query.length < 1) return null;
  
  // Query shouldn't contain spaces
  if (/\s/.test(query)) return null;
  
  return { query, startIndex };
}

export function useMention({ inputRef, onMentionInsert }: UseMentionOptions): UseMentionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mentionStartRef = useRef<number>(-1);
  const textRef = useRef<string>('');

  // Calculate dropdown position — always directly above the @ symbol
  const updatePosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    
    const dropdownWidth = 280;
    const dropdownHeight = 260; // Approximate max height for 5 users + header
    
    // For contentEditable, get precise caret position
    if (input instanceof HTMLDivElement) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const caretRect = range.getBoundingClientRect();
        
        if (caretRect.height > 0 && caretRect.top > 0) {
          // Always position above the caret
          let top = caretRect.top - dropdownHeight - 8;
          let left = caretRect.left - 20;
          
          left = Math.max(12, Math.min(left, window.innerWidth - dropdownWidth - 12));
          
          // Only flip below if literally no space above (very top of screen)
          if (top < 8) {
            top = caretRect.bottom + 8;
          }
          
          setPosition({ top, left });
          return;
        }
      }
    }
    
    // For textareas/inputs — position above the input element
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const rect = input.getBoundingClientRect();
      let top = rect.top - dropdownHeight - 8;
      let left = Math.max(12, Math.min(rect.left, window.innerWidth - dropdownWidth - 12));
      
      if (top < 8) {
        top = rect.bottom + 8;
      }
      
      setPosition({ top, left });
      return;
    }
    
    // Fallback
    const rect = input.getBoundingClientRect();
    let top = rect.top - dropdownHeight - 8;
    let left = Math.max(12, Math.min(rect.left, window.innerWidth - dropdownWidth - 12));
    
    if (top < 8) {
      top = rect.bottom + 8;
    }
    
    setPosition({ top, left });
  }, [inputRef]);

  // Handle text input changes
  const handleInput = useCallback((text: string, cursorPosition?: number) => {
    textRef.current = text;
    
    // Get cursor position
    let cursorPos = cursorPosition;
    
    if (cursorPos === undefined) {
      const input = inputRef.current;
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        cursorPos = input.selectionStart ?? text.length;
      } else if (input instanceof HTMLDivElement) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(input);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          cursorPos = preCaretRange.toString().length;
        }
      }
    }
    
    if (cursorPos === undefined) {
      cursorPos = text.length;
    }
    
    // Check for @mention
    const mention = extractMentionQuery(text, cursorPos);
    
    if (mention) {
      setQuery(mention.query);
      mentionStartRef.current = mention.startIndex;
      setIsOpen(true);
      setSelectedIndex(0);
      updatePosition();
    } else {
      setIsOpen(false);
      setQuery('');
      mentionStartRef.current = -1;
    }
  }, [inputRef, updatePosition]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!isOpen) return false;
    
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const maxIdx = Math.max(0, ((window as any).__mentionResults?.length ?? 5) - 1);
        setSelectedIndex(prev => Math.min(prev + 1, maxIdx));
        return true;
      }
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return true;
        
      case 'Enter':
      case 'Tab':
        // Selection handled by parent through handleSelect
        // Return true to indicate we want to handle this
        return true;
        
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        return true;
        
      default:
        return false;
    }
  }, [isOpen]);

  // Handle user selection
  const handleSelect = useCallback((user: MentionUser) => {
    const text = textRef.current;
    const startIndex = mentionStartRef.current;
    
    if (startIndex === -1) return;
    
    // Get cursor position to find end of mention
    const input = inputRef.current;
    let cursorPos = text.length;
    
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      cursorPos = input.selectionStart ?? text.length;
    } else if (input instanceof HTMLDivElement) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(input);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        cursorPos = preCaretRange.toString().length;
      }
    }
    
    // Build new text with @username inserted
    const before = text.substring(0, startIndex);
    const after = text.substring(cursorPos);
    const mention = `@${user.username} `;
    const newText = before + mention + after;
    
    // Call callback with new text
    if (onMentionInsert) {
      onMentionInsert(user, newText);
    }
    
    // Close dropdown
    setIsOpen(false);
    setQuery('');
    mentionStartRef.current = -1;
    
    // Focus input and set cursor after mention
    setTimeout(() => {
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.focus();
        const newCursorPos = startIndex + mention.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      } else if (input instanceof HTMLDivElement) {
        input.focus();
        // For contentEditable, the parent component handles cursor positioning
      }
    }, 0);
  }, [inputRef, onMentionInsert]);

  // Handle close
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    mentionStartRef.current = -1;
  }, []);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    
    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isOpen, updatePosition]);

  return {
    isOpen,
    query,
    position,
    selectedIndex,
    handleInput,
    handleKeyDown,
    handleSelect,
    handleClose,
    setSelectedIndex,
  };
}

export default useMention;
