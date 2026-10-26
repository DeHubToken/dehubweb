import { createContext, useContext } from 'react';

/**
 * Set by the feed around a card that is in a paid boost slot. The card marks
 * itself: the corner bolt lights up and the time row says "Boosted". A boosted
 * post must say so in words, or a paid slot reads as organic reach.
 */
export const BoostedPostContext = createContext(false);

export const useBoostedPost = () => useContext(BoostedPostContext);
