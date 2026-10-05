import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), getMessages: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  isAuthenticated: true, walletAddress: '0x111', user: { _id: 'me', address: '0x111' },
}) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/app/messages' }) }));
vi.mock('@/lib/api/dehub', () => ({ getMessages: mocks.getMessages }));
vi.mock('@/lib/api/dehub/dm-socket', () => ({
  emitSendMessage: mocks.send,
  waitForDmSocket: async () => {},
  onDmSendMessage: () => () => {},
  onEditMessage: () => () => {},
  onDmDeleteMessage: () => () => {},
  onDmReactionUpdated: () => () => {},
  onFeeConfirmed: () => () => {},
  onReValidateMessage: () => () => {},
  onReadReceipt: () => () => {},
}));
vi.mock('@/lib/dm-e2ee/crypto', () => ({ isEncryptedContent: () => false }));
vi.mock('@/lib/dm-e2ee/keys', () => ({
  prepareOutgoing: async (_peer: string, content: string) => ({ content, encrypted: false }),
  onIdentityChange: () => () => {},
}));

import { messagesKeys, useMessages, useSendMessage } from '@/hooks/use-messages';

const stored = { _id: 'old', conversation: 'c1', content: 'old reply', author: 'other', isRead: true };
const saved = { _id: 'saved', conversation: 'c1', content: 'new reply', msgType: 'msg', author: 'me' };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(messagesKeys.messages('c1'), { pages: [{ items: [stored], hasMore: false }], pageParams: [0] });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => ({ send: useSendMessage('c1'), thread: useMessages('c1') }), { wrapper });
  const items = () => client.getQueryData<any>(messagesKeys.messages('c1')).pages[0].items;
  return { client, hook, items };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMessages.mockResolvedValue({ items: [stored], totalCount: 1, hasMore: false });
});

describe('reply persistence through refresh and failure', () => {
  it('keeps the pending reply across a refresh and replaces it with the persisted id', async () => {
    let confirm!: (message: any) => void;
    mocks.send.mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
    const { client, hook, items } = setup();
    let pending!: Promise<any>;
    act(() => { pending = hook.result.current.send.mutateAsync({ content: 'new reply' }); });
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    await act(async () => { await hook.result.current.thread.refetch(); });
    expect(items().some((message: any) => message._id.startsWith('temp-') && message.content === 'new reply')).toBe(true);
    await act(async () => { confirm(saved); await pending; });
    expect(items().filter((message: any) => message.content === 'new reply').map((message: any) => message._id)).toEqual(['saved']);
    hook.unmount();
    client.clear();
  });

  it('removes only the rejected reply while retaining messages received in the meantime', async () => {
    let reject!: (error: Error) => void;
    mocks.send.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const { client, hook, items } = setup();
    let pending!: Promise<any>;
    act(() => { pending = hook.result.current.send.mutateAsync({ content: 'new reply' }).catch(error => error); });
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    const received = { ...stored, _id: 'incoming', content: 'incoming reply' };
    client.setQueryData(messagesKeys.messages('c1'), (old: any) => ({
      ...old, pages: [{ ...old.pages[0], items: [received, ...old.pages[0].items] }],
    }));
    await act(async () => { reject(new Error('Server rejected the reply')); await pending; });
    expect(items().map((message: any) => message._id)).toEqual(['incoming', 'old']);
    hook.unmount();
    client.clear();
  });
});
