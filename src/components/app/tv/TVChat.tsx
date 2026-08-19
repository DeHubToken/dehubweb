/**
 * TV Chat
 * =======
 * Live chat under a playing TV channel. One room per channel.
 *
 * Rendering is RealtimeChatPanel — the same component the Stages room uses —
 * so a message looks identical wherever it is read. What is left here is the
 * channel-specific wiring: which hook owns the table, and the fact that a
 * click in here must not reach the card's play/pause handler.
 *
 * @module components/app/tv/TVChat
 */

import { useCallback } from 'react';
import { useTVChat } from '@/hooks/use-tv-chat';
import { RealtimeChatPanel, type ChatSenderProfile } from '@/components/app/chat/RealtimeChatPanel';

interface TVChatProps {
  channelId: string;
  channelName?: string;
  /**
   * Subscribe only while the channel is actually on screen and playing.
   * /app/tv mounts up to 50 cards at once and never unmounts the page, so an
   * ungated panel would hold 50 realtime channels open for the whole session.
   */
  enabled?: boolean;
}

export function TVChat({ channelId, channelName, enabled = true }: TVChatProps) {
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  } = useTVChat(channelId, enabled);

  const handleSend = useCallback(
    (content: string, replyToId: string | undefined, profile: ChatSenderProfile) =>
      sendMessage(content, 'text', undefined, replyToId, profile),
    [sendMessage],
  );

  return (
    <RealtimeChatPanel
      messages={messages}
      isLoading={isLoading}
      onSend={handleSend}
      onEdit={editMessage}
      onDelete={deleteMessage}
      onReact={addReaction}
      onRemoveReaction={removeReaction}
      title="Live chat"
      subtitle={channelName}
      listClassName="h-56"
      // Playback controls sit right above this; a click in the chat must not
      // reach the card's play/pause handler.
      onClick={(e) => e.stopPropagation()}
    />
  );
}
