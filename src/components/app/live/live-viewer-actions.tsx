/**
 * The full-bleed live viewer's action buttons, handed to the chat composer.
 *
 * Gift, share and the reaction thumb belong on the same row as the message
 * box — they are what you do to a broadcast, and a phone has one row at the
 * bottom of the screen. But the buttons and the box come from opposite ends of
 * the tree: the buttons are LiveStreamCard's (the gift drawer, the tip count
 * and the post's reaction state all live there) and the box is inside
 * LivePostChat, which the post page injects into LiveStreamCard as an opaque
 * `chatSlot` it cannot see into.
 *
 * Rather than drill the gift drawer and the vote cache up through
 * SinglePostPage and back down, the card publishes the finished node here and
 * the composer picks it up. One seam, named, instead of five props threaded
 * through a page that has no use for any of them.
 *
 * Empty everywhere else: the card renders no provider outside full-bleed, so
 * the chat in a desktop card reads null and draws its composer as it always
 * did.
 */
import { createContext, useContext } from 'react';

const LiveViewerActionsContext = createContext<React.ReactNode>(null);

export const LiveViewerActionsProvider = LiveViewerActionsContext.Provider;

/** The buttons to sit after the send button, or null outside full-bleed. */
export function useLiveViewerActions(): React.ReactNode {
  return useContext(LiveViewerActionsContext);
}
