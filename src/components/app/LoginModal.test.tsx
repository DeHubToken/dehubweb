import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoginModal } from './LoginModal';

const auth = vi.hoisted(() => ({
  walletPhase: 'none', isProcessingRedirect: false, loginIntent: 'signin', requiresUsername: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-keyboard-open', () => ({ useKeyboardSafeSheet: () => ({ style: null }) }));
vi.mock('@/lib/wallet-setup-intent', () => ({ getWalletSetupIntent: () => null, setWalletSetupIntent: vi.fn() }));
vi.mock('@/components/app/login/LoginModalBody', () => ({ LoginModalBody: () => <button>Sign in with Apple</button> }));
vi.mock('@/components/app/login/LoginProfileStep', () => ({ LoginProfileStep: () => <input aria-label="Username" /> }));
vi.mock('@/components/app/login/LoginBodySkeleton', () => ({ LoginBodySkeleton: () => <span>Loading</span> }));
vi.mock('@/components/app/DeHubLoader', () => ({ DeHubPageLoader: () => <span>Loading</span> }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open, onOpenChange, dismissible }: { children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; dismissible: boolean }) => open ? (
    <section data-testid="sheet" data-dismissible={String(dismissible)}>
      <button onClick={() => onOpenChange(false)}>Close sheet</button>{children}
    </section>
  ) : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  warmDeferredSheets: vi.fn(),
}));
vi.mock('@/components/ui/dialog', () => ({ Dialog: () => null, DialogContent: () => null, DialogTitle: () => null }));

beforeEach(() => {
  Object.assign(auth, { walletPhase: 'none', isProcessingRedirect: false, requiresUsername: false });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([390, 820, 1280])('keeps signup in one sheet at %i px and prevents abandoning the required profile', async (width) => {
  vi.stubGlobal('innerWidth', width);
  const close = vi.fn();
  const view = render(<LoginModal open onOpenChange={close} />);
  await screen.findByRole('button', { name: 'Sign in with Apple' });
  const sheet = screen.getByTestId('sheet');
  auth.requiresUsername = true;
  view.rerender(<LoginModal open onOpenChange={close} />);
  await screen.findByRole('textbox', { name: 'Username' });
  expect(screen.getByTestId('sheet')).toBe(sheet);
  expect(sheet).toHaveAttribute('data-dismissible', 'false');
  expect(screen.queryByRole('button', { name: 'Sign in with Apple' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
  expect(close).not.toHaveBeenCalled();

  auth.requiresUsername = false;
  view.rerender(<LoginModal open onOpenChange={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
  expect(close).toHaveBeenCalledWith(false);
});
