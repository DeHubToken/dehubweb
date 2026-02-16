import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';

export type OptimisticPost = {
  id: string;
  type: 'post' | 'image' | 'video';
  data: TextPost | ImagePost | VideoItem;
  createdAt: Date;
};

interface OptimisticPostsContextValue {
  optimisticPosts: OptimisticPost[];
  addOptimisticPost: (post: OptimisticPost) => void;
  clearOptimisticPosts: () => void;
  removeOptimisticPost: (id: string) => void;
}

const OptimisticPostsContext = createContext<OptimisticPostsContextValue | undefined>(undefined);

export function OptimisticPostsProvider({ children }: { children: ReactNode }) {
  const [optimisticPosts, setOptimisticPosts] = useState<OptimisticPost[]>([]);

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
