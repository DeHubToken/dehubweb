import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DeHubConversation } from '@/lib/api/dehub';

const source = vi.hoisted(() => ({ conversations: [] as DeHubConversation[] }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'me' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-messages', () => ({
  useConversations: () => ({ conversations: source.conversations, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateConversation: () => ({}),
  useUserSearchForDM: () => ({}),
  useDeleteConversation: () => ({}),
}));
vi.mock('@/hooks/use-public-chat-unread', () => ({ usePublicChatUnreadCount: () => 0, usePublicChatReading: vi.fn() }));
vi.mock('@/hooks/use-dm-realtime', () => ({ useDMRealtime: vi.fn() }));
vi.mock('@/hooks/use-draft', () => ({ useDraftText: () => '' }));
vi.mock('@/hooks/use-keyboard-open', () => ({ useKeyboardOpen: () => false, useVisualViewportBox: () => ({}) }));
vi.mock('@/lib/undoable-delete', () => ({ usePendingDeletes: () => new Set(), scheduleDelete: vi.fn(), undoDelete: vi.fn(), UNDO_WINDOW_MS: 5000 }));
vi.mock('@/lib/api/dehub', () => ({ getAccountInfo: vi.fn(), getMediaUrl: vi.fn() }));
vi.mock('@/lib/api/dehub/dm-socket', () => ({ emitSendMessage: vi.fn() }));
vi.mock('@/lib/api/dehub/blocks', () => ({ blockUser: vi.fn() }));
vi.mock('@/lib/dm-e2ee/keys', () => ({ prepareOutgoing: vi.fn() }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => '', extractAvatarPath: () => '' }));
vi.mock('@/components/app/chat', () => ({
  DirectMessageChat: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Back to messages</button>,
  PublicChat: () => null, NewConversationModal: () => null, NewMessageSelector: () => null, CreateGroupModal: () => null,
}));
vi.mock('@/components/app/page-kit/PageKit', () => ({
  PageIsland: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  IslandAction: () => null,
}));
vi.mock('@/components/app/war/WarHudIcon', () => ({ BrandIcon: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('@/components/app/DhbAmount', () => ({ DhbCoin: () => null }));
vi.mock('@/components/app/VerifiedBadge', () => ({ VerifiedBadge: () => null }));
vi.mock('@/components/app/BadgeIcon', () => ({ BadgeIcon: () => null }));
vi.mock('@/components/app/chat/OnlineDot', () => ({ OnlineDot: () => null }));
vi.mock('@/components/app/AuthGate', () => ({ AuthGate: () => null }));
vi.mock('@/components/SEOHead', () => ({ SEOHead: () => null }));
vi.mock('@/components/ui/swipeable-row', () => ({ SwipeableRow: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

import MessagesPage from '../MessagesPage';

const inbox = () => <MemoryRouter initialEntries={['/app/messages']}><MessagesPage /></MemoryRouter>;

describe('conversation unread state', () => {
  beforeEach(() => {
    source.conversations = [{
      id: 'conversation-1', participants: [], unreadCount: 2,
      createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z',
      otherUser: { address: 'peer', displayName: 'Aaron', username: 'aaron' },
      lastMessage: { id: 'message-1', conversationId: 'conversation-1', sender: { address: 'peer' }, type: 'text', content: 'First message', createdAt: '2026-10-08T10:00:00Z' },
    }];
  });

  it('shows new unread messages after opening and leaving the same conversation', async () => {
    const view = render(inbox());
    const initialRow = screen.getByRole('button', { name: /Aaron/ });
    expect(initialRow.querySelector('[data-count-badge]')).toHaveTextContent('2');
    expect(screen.getByText('First message')).toHaveClass('text-white', 'font-bold');

    fireEvent.click(initialRow);
    // The chat marks the messages read in the shared query when it opens.
    source.conversations = source.conversations.map(conversation => ({ ...conversation, unreadCount: 0 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to messages' }));
    await waitFor(() => expect(screen.getByText('First message')).toHaveClass('text-white', 'font-normal'));
    expect(screen.getByRole('button', { name: /Aaron/ }).querySelector('[data-count-badge]')).toBeNull();

    // A socket refetch supplies a newer incoming message without remounting the page.
    source.conversations = source.conversations.map(conversation => ({
      ...conversation, unreadCount: 1,
      lastMessage: { ...conversation.lastMessage!, id: 'message-2', content: 'New message after leaving', createdAt: '2026-10-08T10:01:00Z' },
    }));
    view.rerender(inbox());
    expect(screen.getByRole('button', { name: /Aaron/ }).querySelector('[data-count-badge]')).toHaveTextContent('1');
    expect(screen.getByText('New message after leaving')).toHaveClass('text-white', 'font-bold');
  });
});
