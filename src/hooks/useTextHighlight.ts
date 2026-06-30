
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const useTextHighlight = () => {
  const highlightAppliedRef = useRef(false);
  const location = useLocation();

  const highlightText = (searchTerm: string, containerElement?: HTMLElement) => {
    if (!searchTerm.trim() || highlightAppliedRef.current) return;

    const container = containerElement || document.body;
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script and style elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if already highlighted
          if (parent.closest('.search-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    let firstMatch: HTMLElement | null = null;

    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      if (regex.test(text)) {
        const highlightedHTML = text.replace(regex, '<mark class="search-highlight bg-yellow-200 dark:bg-yellow-800 px-1 rounded animate-pulse">$1</mark>');
        
        const wrapper = document.createElement('span');
        wrapper.innerHTML = highlightedHTML;
        
        textNode.parentNode?.replaceChild(wrapper, textNode);
        
        // Store reference to first match for scrolling
        if (!firstMatch) {
          firstMatch = wrapper.querySelector('.search-highlight');
        }
      }
    });

    highlightAppliedRef.current = true;

    // Smooth scroll to first match
    if (firstMatch) {
      setTimeout(() => {
        firstMatch.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
        
        // Add extra emphasis animation
        firstMatch.style.animation = 'searchHighlight 2s ease-in-out';
      }, 300);
    }
  };

  const clearHighlights = () => {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(highlight => {
      const parent = highlight.parentElement;
      if (parent) {
        // Replace the parent span with just the text content
        const textContent = parent.textContent || '';
        const textNode = document.createTextNode(textContent);
        parent.parentNode?.replaceChild(textNode, parent);
      }
    });
    highlightAppliedRef.current = false;
  };

  // Clear highlights on route change
  useEffect(() => {
    clearHighlights();
  }, [location.pathname]);

  // Check for search highlight on mount/route change
  useEffect(() => {
    const searchTerm = sessionStorage.getItem('search-highlight');
    if (searchTerm) {
      // Clear previous highlights first
      clearHighlights();
      
      // Apply new highlights after a short delay to ensure content is rendered
      setTimeout(() => {
        highlightText(searchTerm);
      }, 500);
      
      // Clean up immediately after applying
      sessionStorage.removeItem('search-highlight');
    }
  }, [location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHighlights();
    };
  }, []);

  return {
    highlightText,
    clearHighlights
  };
};
