import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const listing = vi.hoisted(() => ({
  getSignInEmail: vi.fn(),
  joinDhbListingWaitlist: vi.fn(),
  readJoinedEmail: vi.fn(),
  rememberJoinedEmail: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'mal' }, walletAddress: '0xabc' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, vars?: Record<string, string>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars?.[k] ?? ''),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/market/dhb-listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/market/dhb-listing')>()),
  ...listing,
}));

import { DhbListingSoonCard } from '@/components/app/DhbListingSoonCard';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('DhbListingSoonCard', () => {
  it('signs a person up with their sign-in email in one tap', async () => {
    listing.readJoinedEmail.mockReturnValue(null);
    listing.getSignInEmail.mockResolvedValue('mal@example.com');
    listing.joinDhbListingWaitlist.mockResolvedValue({ alreadyJoined: false });

    render(<DhbListingSoonCard />);
    expect(screen.getByText('Token listing soon!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => expect(screen.getByText(/We'll email mal@example.com/)).toBeTruthy());
    expect(listing.joinDhbListingWaitlist).toHaveBeenCalledWith({
      email: 'mal@example.com',
      walletAddress: '0xabc',
      username: 'mal',
      source: 'explore',
    });
  });

  it('asks for an email when the account has none', async () => {
    listing.readJoinedEmail.mockReturnValue(null);
    listing.getSignInEmail.mockResolvedValue(null);
    listing.joinDhbListingWaitlist.mockResolvedValue({ alreadyJoined: false });

    render(<DhbListingSoonCard />);
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    const input = await screen.findByLabelText('Enter your email');
    expect(listing.joinDhbListingWaitlist).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'new@fan.io' } });
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => expect(screen.getByText(/We'll email new@fan.io/)).toBeTruthy());
    expect(listing.joinDhbListingWaitlist).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@fan.io' }));
  });

  it('shows "on the list" straight away for someone who already signed up here', () => {
    listing.readJoinedEmail.mockReturnValue('mal@example.com');
    render(<DhbListingSoonCard />);
    expect(screen.queryByRole('button', { name: /notify me/i })).toBeNull();
    expect(screen.getByText(/You're on the list/)).toBeTruthy();
  });
});
