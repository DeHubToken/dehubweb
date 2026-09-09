import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMentionDropdown } from '@/components/app/mentions/UserMentionDropdown';

const { apiCallMock } = vi.hoisted(() => ({ apiCallMock: vi.fn() }));

vi.mock('@/lib/api/dehub/core', () => ({ apiCall: apiCallMock }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));
vi.mock('@/components/app/VerifiedBadge', () => ({ VerifiedBadge: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => null }));
vi.mock('@/lib/assistant', () => ({
  ASSISTANT_AVATAR: '',
  isAssistantAddress: () => false,
}));

describe('user mention touch selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiCallMock.mockResolvedValue({
      result: [{ username: 'alice', displayName: 'Alice', address: '0xalice' }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('selects at touch-start before a keyboard resize can move the row', async () => {
    const onSelect = vi.fn();
    render(
      <UserMentionDropdown
        query="ali"
        isOpen
        position={{ top: 0, left: 0 }}
        selectedIndex={0}
        onSelectedIndexChange={vi.fn()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    fireEvent.touchStart(screen.getByRole('button', { name: 'Mention @alice' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice' }));
  });
});
