/**
 * Search History Hook
 * ====================
 * Manages local search history with localStorage persistence.
 * Stores recent searches and provides utilities for add/remove/clear.
 * 
 * @module hooks/use-search-history
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'dehub_search_history';
const MAX_HISTORY_ITEMS = 10;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  type?: 'query' | 'user' | 'tag';
}

/**
 * Get storage key for current user (or anonymous)
 */
function getStorageKey(walletAddress?: string | null): string {
  if (walletAddress) {
    return `${STORAGE_KEY}_${walletAddress.toLowerCase()}`;
  }
  return `${STORAGE_KEY}_anonymous`;
}

/**
 * Load search history from localStorage
 */
function loadHistory(walletAddress?: string | null): SearchHistoryItem[] {
  try {
    const key = getStorageKey(walletAddress);
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    
    // Validate and clean up old entries
    return parsed
      .filter((item): item is SearchHistoryItem => 
        typeof item === 'object' && 
        typeof item.query === 'string' && 
        typeof item.timestamp === 'number'
      )
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Save search history to localStorage
 */
function saveHistory(history: SearchHistoryItem[], walletAddress?: string | null): void {
  try {
    const key = getStorageKey(walletAddress);
    localStorage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // Silently fail on quota errors
  }
}

/**
 * Hook for managing search history
 */
export function useSearchHistory() {
  const { walletAddress } = useAuth();
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => 
    loadHistory(walletAddress)
  );

  // Reload history when wallet changes
  useEffect(() => {
    setHistory(loadHistory(walletAddress));
  }, [walletAddress]);

  /**
   * Add a search query to history
   */
  const addToHistory = useCallback((query: string, type: 'query' | 'user' | 'tag' = 'query') => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setHistory(prev => {
      // Remove existing entry for same query (case-insensitive)
      const filtered = prev.filter(
        item => item.query.toLowerCase() !== trimmed.toLowerCase()
      );
      
      // Add new entry at the start
      const newHistory: SearchHistoryItem[] = [
        { query: trimmed, timestamp: Date.now(), type },
        ...filtered,
      ].slice(0, MAX_HISTORY_ITEMS);
      
      // Persist to localStorage
      saveHistory(newHistory, walletAddress);
      
      return newHistory;
    });
  }, [walletAddress]);

  /**
   * Remove a specific search from history
   */
  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const filtered = prev.filter(
        item => item.query.toLowerCase() !== query.toLowerCase()
      );
      saveHistory(filtered, walletAddress);
      return filtered;
    });
  }, [walletAddress]);

  /**
   * Clear all search history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      const key = getStorageKey(walletAddress);
      localStorage.removeItem(key);
    } catch {
      // Silently fail
    }
  }, [walletAddress]);

  /**
   * Get recent searches (just the query strings)
   */
  const recentSearches = history.map(item => item.query);

  return {
    history,
    recentSearches,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
