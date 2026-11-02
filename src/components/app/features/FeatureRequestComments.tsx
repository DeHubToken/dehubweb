/**
 * Feature Request Comments
 * ========================
 * The comment thread under a feature request: the shared threaded UI
 * (`components/app/comments/ThreadedComments`) on this board's tables and in
 * this board's words. Governance proposals wear the same component, so the two
 * boards cannot drift apart on how a thread behaves.
 *
 * @module components/app/features/FeatureRequestComments
 */

import { useCallback, useMemo } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { ThreadedComments, type ThreadedCommentsLabels } from '@/components/app/comments/ThreadedComments';
import {
  useFeatureRequestComments,
  useSubmitComment,
  useEditComment,
  useDeleteComment,
  useReactToComment,
  uploadFeatureCommentMedia,
  getFeatureCommentLikers,
  type FeatureRequestComment,
} from '@/hooks/use-feature-request-comments';
import { useAuth } from '@/contexts/AuthContext';

interface FeatureRequestCommentsProps {
  featureRequestId: string;
  featureTitle: string;
  featureAuthorAddress: string;
  /** A comment a notification pointed at — ringed and forced into view. */
  focusCommentId?: string | null;
}

export function FeatureRequestComments({
  featureRequestId,
  featureTitle,
  featureAuthorAddress,
  focusCommentId,
}: FeatureRequestCommentsProps) {
  const { t } = useI18n();
  const { walletAddress } = useAuth();

  const { data: threads, isLoading, isError, isFetching, refetch } = useFeatureRequestComments(featureRequestId);
  const submitComment = useSubmitComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const reactToComment = useReactToComment();

  const labels = useMemo<ThreadedCommentsLabels>(() => ({
    addComment: t('features.addComment'),
    writeReply: t('features.writeReply'),
    reply: t('features.replyToComment'),
    replyingTo: (name) => t('features.replyingTo', { name }),
    edited: t('features.commentEdited'),
    empty: t('features.noComments'),
    showMoreReplies: (count) => (count === 1 ? t('features.showOneMoreReply') : t('features.showMoreReplies', { count })),
    authorChip: t('features.requestAuthorChip'),
  }), [t]);

  // Same paperclip, GIFs and voice notes a post comment has; files land in
  // the board's own bucket.
  const media = useMemo(() => ({
    upload: (file: File) => {
      if (!walletAddress) return Promise.reject(new Error('Not signed in'));
      return uploadFeatureCommentMedia(file, walletAddress);
    },
  }), [walletAddress]);

  const permalink = useCallback(
    (commentId: string) => `${window.location.origin}/features?request=${featureRequestId}&comment=${commentId}`,
    [featureRequestId],
  );

  return (
    <ThreadedComments<FeatureRequestComment>
      draftScope={`thread:featureRequestId:${featureRequestId}`}
      threads={threads}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      onRetry={() => { void refetch(); }}
      entityAuthorAddress={featureAuthorAddress}
      focusCommentId={focusCommentId}
      labels={labels}
      busy={reactToComment.isPending}
      submitting={submitComment.isPending}
      media={media}
      permalink={permalink}
      loadLikers={getFeatureCommentLikers}
      onSubmit={({ content, parent, media: attached }) =>
        submitComment.mutateAsync({
          featureRequestId,
          content,
          media: attached,
          parentId: parent?.id ?? null,
          featureTitle,
          featureAuthorAddress,
          parentAuthorAddress: parent?.wallet_address ?? null,
        })
      }
      onEdit={(comment, content) => editComment.mutateAsync({ commentId: comment.id, content, featureRequestId })}
      onDelete={(comment) => deleteComment.mutate({ commentId: comment.id, featureRequestId })}
      onReact={(comment, reaction) =>
        reactToComment.mutate({ commentId: comment.id, reaction, current: comment.myReaction, featureRequestId })
      }
    />
  );
}
