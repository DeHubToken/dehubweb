/**
 * Proposal Discussion
 * ===================
 * The thread under a governance proposal — where follow-up questions get
 * asked before the vote. The shared threaded UI on the governance tables, in
 * governance's words. Both the board card and the proposal page mount this,
 * so a reply reads the same wherever it was written.
 *
 * @module components/app/governance/ProposalDiscussion
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ThreadedComments, type ThreadedCommentsLabels } from '@/components/app/comments/ThreadedComments';
import {
  useProposalDiscussion,
  useSubmitProposalComment,
  useEditProposalComment,
  useDeleteProposalComment,
  useReactToProposalComment,
  type ProposalComment,
} from '@/hooks/use-proposal-discussion';

interface ProposalDiscussionProps {
  proposalId: string;
  proposalAuthorAddress: string;
  /** A comment a notification pointed at — ringed and forced into view. */
  focusCommentId?: string | null;
  /** The board card's short, scrolling variant; the page shows everything. */
  compact?: boolean;
}

export function ProposalDiscussion({
  proposalId,
  proposalAuthorAddress,
  focusCommentId,
  compact = false,
}: ProposalDiscussionProps) {
  const { t } = useTranslation();

  const { data: threads, isLoading } = useProposalDiscussion(proposalId);
  const submitComment = useSubmitProposalComment();
  const editComment = useEditProposalComment();
  const deleteComment = useDeleteProposalComment();
  const reactToComment = useReactToProposalComment();

  const labels = useMemo<ThreadedCommentsLabels>(() => ({
    addComment: t('governance.addComment'),
    writeReply: t('governance.discussion.writeReply'),
    reply: t('governance.discussion.reply'),
    replyingTo: (name) => t('governance.discussion.replyingTo', { name }),
    edited: t('governance.discussion.edited'),
    empty: t('governance.discussion.empty'),
    showMoreReplies: (count) => t('governance.discussion.showMoreReplies', { count }),
    authorChip: t('governance.discussion.authorChip'),
    signInToComment: t('governance.discussion.signInToComment'),
    deleteTitle: t('governance.discussion.deleteTitle'),
    deleteDescription: t('governance.discussion.deleteDescription'),
  }), [t]);

  return (
    <ThreadedComments<ProposalComment>
      threads={threads}
      isLoading={isLoading}
      entityAuthorAddress={proposalAuthorAddress}
      focusCommentId={focusCommentId}
      labels={labels}
      busy={reactToComment.isPending}
      submitting={submitComment.isPending}
      listMaxHeightClass={compact ? 'max-h-60' : 'max-h-none'}
      onSubmit={({ content, parent }) =>
        submitComment.mutateAsync({ proposalId, content, parentId: parent?.id ?? null })
      }
      onEdit={(comment, content) => editComment.mutate({ commentId: comment.id, content, proposalId })}
      onDelete={(comment) => deleteComment.mutate({ commentId: comment.id, proposalId })}
      onReact={(comment, reaction) =>
        reactToComment.mutate({ commentId: comment.id, reaction, current: comment.myReaction, proposalId })
      }
    />
  );
}
