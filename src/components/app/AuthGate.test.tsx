import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

const auth = vi.hoisted(() => ({
  openLoginModal: vi.fn(), isLoading: false, isConnecting: false, needsSignature: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/assistant', () => ({ ASSISTANT_AVATAR: '/unavailable-avatar.png' }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.isLoading = false;
  auth.isConnecting = false;
  auth.needsSignature = false;
});
afterEach(cleanup);

it('offers sign-in before the avatar loads and after it fails', () => {
  render(<AuthGate />);
  fireEvent.click(screen.getByRole('button', { name: 'nav.login' }));
  expect(auth.openLoginModal).toHaveBeenCalledTimes(1);
  fireEvent.error(screen.getByRole('img'));
  fireEvent.click(screen.getByRole('button', { name: 'nav.login' }));
  expect(auth.openLoginModal).toHaveBeenCalledTimes(2);
});

it('reveals sign-in when auth finishes loading without waiting for an image event', () => {
  auth.isLoading = true;
  const { rerender } = render(<AuthGate />);
  expect(screen.queryByRole('button')).toBeNull();
  auth.isLoading = false;
  rerender(<AuthGate />);
  expect(screen.getByRole('button', { name: 'nav.login' })).toBeEnabled();
});

it('still prevents duplicate sign-in while connecting', () => {
  auth.isConnecting = true;
  render(<AuthGate />);
  expect(screen.getByRole('button', { name: 'nav.connecting' })).toBeDisabled();
});
