import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThreadedComments, type ThreadedCommentsProps } from '@/components/app/comments/ThreadedComments';
import type { ThreadedComment } from '@/lib/comment-threads';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: '0xviewer', openLoginModal: vi.fn() }) }));
vi.mock('@/hooks/use-draft-state', async () => {
  const { useState } = await import('react');
  return { useDraftState: (_key: string, initial: unknown) => useState(initial) };
});
vi.mock('@/hooks/use-mention', () => ({ useMention: () => ({ isOpen: false, handleInput: vi.fn() }) }));
vi.mock('@/hooks/use-reaction-tray', () => ({ useReactionTray: () => ({ open: false, areaProps: {}, buttonProps: {} }) }));
vi.mock('@/components/ui/cut-icons/create-cut-icon', () => ({ createCutIcon: () => () => null }));
vi.mock('@/components/app/BadgedName', () => ({ BadgedName: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/components/app/NewMemberChip', () => ({ NewMemberChip: () => null }));
vi.mock('@/components/app/TranslatableText', () => ({ TranslatableText: ({ text }: any) => <p>{text}</p> }));
vi.mock('@/components/app/cards/ReactionPicker', () => ({ ReactionPicker: () => null }));
vi.mock('@/components/app/cards/ReactionEmoji', () => ({ ReactionEmoji: () => null }));
vi.mock('@/components/app/mentions', () => ({ UserMentionDropdown: () => null }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => null }));
vi.mock('@/lib/feed-utils', () => ({ formatTimeAgo: () => 'now' }));
vi.mock('@/components/app/cards/CommentsSection', async () => {
  const { createContext } = await import('react');
  return {
    PostCommentRow: ({ comment }: { comment: { text: string } }) => <p>{comment.text}</p>,
    CommentCreatorContext: createContext(null),
  };
});
vi.mock('@/components/app/cards/CommentLikersDrawer', () => ({ CommentLikersDrawer: () => null }));
vi.mock('@/components/app/chat/EmojiGifPicker', () => ({ EmojiGifPicker: () => null }));
vi.mock('@/components/app/audio/VoiceStripPlayer', () => ({ VoiceStripPlayer: () => null }));
vi.mock('@/lib/comment-threads', () => ({ countThreadComments: (threads: any[] | undefined) => threads?.reduce((sum, thread) => sum + 1 + thread.replies.length, 0) ?? 0 }));

afterEach(cleanup);
const base: ThreadedCommentsProps<ThreadedComment> = {
  draftScope: 'test', threads: undefined, isLoading: false, isError: true, isFetching: false,
  onRetry: vi.fn(), entityAuthorAddress: '0xauthor', busy: false, submitting: false,
  onSubmit: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onReact: vi.fn(),
  labels: { addComment: 'Add a comment', writeReply: 'Reply', reply: 'Reply', replyingTo: name => name,
    edited: 'Edited', empty: 'No comments yet', showMoreReplies: () => 'More' },
};

describe('discussion read failures', () => {
  it('offers retry instead of claiming a failed read is empty, and keeps the draft', () => {
    const retry = vi.fn();
    const props = { ...base, onRetry: retry };
    const view = render(<ThreadedComments {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('comments.loadFailed');
    expect(screen.queryByText('No comments yet')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My unsent reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(<ThreadedComments {...props} isFetching />);
    expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveValue('My unsent reply');
    view.rerender(<ThreadedComments {...props} threads={[]} isError={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No comments yet')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('My unsent reply');
  });

  it('keeps cached comments visible when a refresh fails', () => {
    const comment: ThreadedComment = { id: 'cached', wallet_address: '0xauthor', username: 'author', avatar: null,
      content: 'Previously loaded comment', created_at: '2026-10-28T00:00:00Z', parent_id: null, updated_at: null,
      reactionCounts: {}, likes: 0, dislikes: 0, myReaction: null };
    render(<ThreadedComments {...base} threads={[{ comment, replies: [] }]} />);
    expect(screen.getByText('Previously loaded comment')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('comments.loadFailed');
    expect(screen.queryByText('No comments yet')).toBeNull();
  });
});
