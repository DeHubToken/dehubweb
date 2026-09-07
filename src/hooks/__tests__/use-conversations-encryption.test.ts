import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptFromPeer: vi.fn(),
  loadIdentity: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('react-router-dom', () => ({ useLocation: vi.fn() }));
vi.mock('@/lib/api/dehub', () => ({}));
vi.mock('@/lib/api/dehub/dm-socket', () => ({}));
vi.mock('@/lib/dm-e2ee/crypto', () => ({
  isEncryptedContent: (content: unknown) => typeof content === 'string' && content.startsWith('e2e:'),
}));
vi.mock('@/lib/dm-e2ee/keys', () => ({
  decryptFromPeer: mocks.decryptFromPeer,
  decryptMessageInPlace: vi.fn(),
  loadIdentity: mocks.loadIdentity,
  onIdentityChange: vi.fn(),
  prepareOutgoing: vi.fn(),
}));

import { decryptConversationPreviews } from '@/hooks/use-messages';

describe('encrypted conversation previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptFromPeer.mockResolvedValue('Decrypted preview');
  });

  it('loads the stored identity before decrypting the conversation row', async () => {
    const result = await decryptConversationPreviews([{
      id: 'conversation-1',
      otherUser: { address: '0x2222222222222222222222222222222222222222' },
      participants: [],
      unreadCount: 0,
      lastMessage: {
        content: 'e2e:1:nonce:ciphertext',
        createdAt: '2026-09-06T20:00:00.000Z',
      },
    } as never], '0x1111111111111111111111111111111111111111');

    expect(result[0].lastMessage?.content).toBe('Decrypted preview');
    expect(result[0].lastMessage?.undecryptable).toBe(false);
    expect(mocks.loadIdentity).toHaveBeenCalledWith('0x1111111111111111111111111111111111111111');
    expect(mocks.decryptFromPeer).toHaveBeenCalledWith(
      '0x2222222222222222222222222222222222222222',
      'e2e:1:nonce:ciphertext',
    );
    expect(mocks.loadIdentity.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.decryptFromPeer.mock.invocationCallOrder[0]);
  });
});
