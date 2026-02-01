/**
 * Minimized AI Chats Hook
 * =======================
 * Manages a global stack of minimized AI chat sessions.
 * Persists state in sessionStorage and limits to 5 chats max.
 */

import { useState, useEffect, useCallback } from 'react';

export interface MinimizedChat {
  id: string;
  title: string;
  type: 'image' | 'video' | 'live' | 'post';
  author?: string;
}

const STORAGE_KEY = 'minimized-ai-chats';
const MAX_CHATS = 5;

// Get initial state from sessionStorage
function getStoredChats(): MinimizedChat[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save to sessionStorage
function saveChats(chats: MinimizedChat[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

// Clear all stored chats on page load to prevent orphan accumulation
// This ensures a fresh start each page load
function clearStoredChats() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Clear on initial load to prevent orphans from previous sessions
clearStoredChats();

// Global state to sync across components
let globalChats: MinimizedChat[] = [];
const listeners = new Set<(chats: MinimizedChat[]) => void>();

function notifyListeners() {
  listeners.forEach(listener => listener([...globalChats]));
}

export function useMinimizedChats() {
  const [chats, setChats] = useState<MinimizedChat[]>(globalChats);

  useEffect(() => {
    const listener = (newChats: MinimizedChat[]) => setChats(newChats);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const addChat = useCallback((chat: MinimizedChat) => {
    // Check if already minimized
    if (globalChats.some(c => c.id === chat.id)) return;
    
    // Limit to MAX_CHATS (remove oldest if at limit)
    if (globalChats.length >= MAX_CHATS) {
      globalChats = globalChats.slice(1);
    }
    
    globalChats = [...globalChats, chat];
    saveChats(globalChats);
    notifyListeners();
  }, []);

  const removeChat = useCallback((id: string) => {
    globalChats = globalChats.filter(c => c.id !== id);
    saveChats(globalChats);
    notifyListeners();
  }, []);

  const isMinimized = useCallback((id: string) => {
    return globalChats.some(c => c.id === id);
  }, []);

  const getPosition = useCallback((id: string) => {
    return globalChats.findIndex(c => c.id === id);
  }, []);

  const clearAll = useCallback(() => {
    globalChats = [];
    saveChats(globalChats);
    notifyListeners();
  }, []);

  return {
    chats,
    addChat,
    removeChat,
    isMinimized,
    getPosition,
    clearAll,
  };
}
