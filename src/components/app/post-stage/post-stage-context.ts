import { createContext, useContext } from 'react';

/**
 * What the phone post page ("Stage") hands down to the card it renders.
 *
 * Feed cards never sit under a provider, so `usePostStage()` is null there and
 * every card keeps its feed layout. Only SinglePostPage on a phone provides it.
 */
export interface PostStageValue {
  /** Leave the post (history back, or the home feed on a cold open). */
  onBack: () => void;
  /** Scroll to the comments and put the cursor in the docked composer. */
  openComments: () => void;
  /** Show the quotes list (the comments area switches to it). */
  openQuotes: () => void;
  /** Show the reposters list. */
  openReposts: () => void;
  /** Quote posts of this post. */
  quoteCount: number;
  /** Plain reposts of this post (quotes not included). */
  repostCount: number;
}

export const PostStageContext = createContext<PostStageValue | null>(null);

export function usePostStage(): PostStageValue | null {
  return useContext(PostStageContext);
}
