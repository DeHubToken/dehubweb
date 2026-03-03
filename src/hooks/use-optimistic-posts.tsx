import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';

const STORAGE_KEY = 'dehub-optimistic-posts';


export type OptimisticPost = {
  id: string;
  type: 'post' | 'image' | 'video';
  data: TextPost | ImagePost | VideoItem;
  createdAt: Date;
  /** true when media URLs were blob: and won't survive refresh */
  mediaExpired?: boolean;
};

interface OptimisticPostsContextValue {
  optimisticPosts: OptimisticPost[];
  addOptimisticPost: (post: OptimisticPost) => void;
  clearOptimisticPosts: () => void;
  removeOptimisticPost: (id: string) => void;
}

const OptimisticPostsContext = createContext<OptimisticPostsContextValue | undefined>(undefined);

function loadFromStorage(): OptimisticPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<OptimisticPost & { createdAt: string }>;
    return parsed
      .map(p => ({ ...p, createdAt: new Date(p.createdAt) }))
      .map(p => ({ ...p, mediaExpired: true })); // blob URLs don't survive refresh
  } catch {
    return [];
  }
}

function saveToStorage(posts: OptimisticPost[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // storage full or unavailable
  }
}

export function OptimisticPostsProvider({ children }: { children: ReactNode }) {
  const [optimisticPosts, setOptimisticPosts] = useState<OptimisticPost[]>(loadFromStorage);

  // Sync to localStorage whenever posts change
  useEffect(() => {
    saveToStorage(optimisticPosts);
  }, [optimisticPosts]);

  const addOptimisticPost = useCallback((post: OptimisticPost) => {
    setOptimisticPosts(prev => [post, ...prev]);
  }, []);

  const clearOptimisticPosts = useCallback(() => {
    setOptimisticPosts([]);
  }, []);

  const removeOptimisticPost = useCallback((id: string) => {
    setOptimisticPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  return (
    <OptimisticPostsContext.Provider value={{ 
      optimisticPosts, 
      addOptimisticPost, 
      clearOptimisticPosts,
      removeOptimisticPost,
    }}>
      {children}
    </OptimisticPostsContext.Provider>
  );
}

export function useOptimisticPosts() {
  const context = useContext(OptimisticPostsContext);
  if (!context) {
    throw new Error('useOptimisticPosts must be used within OptimisticPostsProvider');
  }
  return context;
}
