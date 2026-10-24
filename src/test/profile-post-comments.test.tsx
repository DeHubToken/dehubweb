import { createContext, useContext, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const Profile = createContext<string | null>(null);

vi.mock('@/contexts/SidebarCollapseContext', () => ({
  useSidebarCollapse: () => ({ isCollapsed: false }),
}));
vi.mock('@/lib/wallet-unlock-flow', () => ({ useWalletUnlockPrompt: () => false }));
vi.mock('@/components/app/cards/CommentsSection', () => ({
  CommentsSection: ({ onClose }: { onClose: () => void }) => {
    const profile = useContext(Profile);
    return <button onClick={onClose}>Close comments for {profile}</button>;
  },
}));

import { CommentsWrapper } from '@/components/app/cards/CommentsWrapper';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([390, 1280])('keeps a profile post mounted and its context available through comments at %ipx', async (width) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('max-width: 767px') ? width < 768 : query.includes('max-width: 1023px') ? width < 1024 : false,
    media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  function Post() {
    const [open, setOpen] = useState(false);
    return <article data-testid="profile-post">
      <p>Profile post stays here</p>
      <button onClick={() => setOpen(true)}>Open comments</button>
      <CommentsWrapper open={open} onOpenChange={setOpen} tokenId="101" />
    </article>;
  }
  render(<Profile.Provider value="member"><Post /></Profile.Provider>);
  const post = screen.getByTestId('profile-post');
  fireEvent.click(screen.getByRole('button', { name: 'Open comments' }));
  const close = await screen.findByRole('button', { name: 'Close comments for member' });
  expect(screen.getByTestId('profile-post')).toBe(post);
  fireEvent.click(close);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Close comments for member' })).toBeNull());
  expect(screen.getByTestId('profile-post')).toBe(post);
});
