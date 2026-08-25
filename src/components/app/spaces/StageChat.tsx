/**
 * StageChat
 * =========
 * The audience's own channel in a Stage: listeners talk to each other while
 * the speakers talk, and what they write stays on the stage afterwards as its
 * comments.
 *
 * One component for all three states of a stage, because it is one
 * conversation: people gather on an announced stage before it starts, chat
 * through it while it is live, and keep commenting on the recording after it
 * ends. Only the labels change.
 *
 * Rendering is the shared RealtimeChatPanel, so a message here looks like a
 * message anywhere else on DeHub.
 *
 * @module components/app/spaces/StageChat
 */

import { MessageSquare } from 'lucide-react';
import { useCallback } from 'react';
import { RealtimeChatPanel, type ChatSenderProfile } from '@/components/app/chat/RealtimeChatPanel';
import { useStageChat } from '@/hooks/use-stage-chat';
import type { AudioSpace } from '@/types/audio-spaces.types';

type StageLike = Pick<AudioSpace, 'id' | 'host_wallet_address' | 'status'>;

interface StageChatProps {
  space: StageLike;
  /**
   * Hold the realtime subscription open only while the panel is actually being
   * read. The Recorded tab renders a row per stage and each can open a comment
   * panel, so an ungated subscription there would accumulate one channel per
   * stage for the whole session.
   */
  enabled?: boolean;
  className?: string;
  /** Height of the scrolling list. Taller in the room than under a recording. */
  listClassName?: string;
}

export function StageChat({
  space,
  enabled = true,
  className,
  listClassName = 'h-56',
}: StageChatProps) {
  const {
    messages,
    isLoading,
    unavailable,
    isHost,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  } = useStageChat(space.id, { enabled, hostWallet: space.host_wallet_address });

  const handleSend = useCallback(
    (content: string, replyToId: string | undefined, profile: ChatSenderProfile) =>
      sendMessage(content, replyToId, profile),
    [sendMessage],
  );

  const ended = space.status === 'ended';
  const scheduled = space.status === 'scheduled';

  return (
    <RealtimeChatPanel
      messages={messages}
      isLoading={isLoading}
      onSend={handleSend}
      onEdit={editMessage}
      onDelete={deleteMessage}
      onReact={addReaction}
      onRemoveReaction={removeReaction}
      // The host moderates their own room. Worth having on a live stage for
      // the obvious reason, and on an ended one because the comments outlive
      // the stage and nobody else can clean them up.
      canModerate={isHost}
      draftKey={`stage:${space.id}`}
      icon={MessageSquare}
      title={ended ? 'Comments' : 'Live chat'}
      emptyHint={
        ended
          ? 'No comments yet — leave the first.'
          : scheduled
            ? 'Nothing yet — say hello before it starts.'
            : 'No messages yet — say something to the room.'
      }
      placeholder={ended ? 'Leave a comment...' : 'Message the room...'}
      signInLabel={ended ? 'Sign in to comment' : 'Sign in to chat'}
      error={
        unavailable
          ? 'Chat is not available for this stage yet.'
          : null
      }
      listClassName={listClassName}
      className={className}
    />
  );
}
