import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoginModal } from './LoginModal';

const auth = vi.hoisted(() => ({
  walletPhase: 'none', isProcessingRedirect: false, loginIntent: 'signin', requiresUsername: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth, useLoginSheet: () => auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }), Trans: ({ defaults }: { defaults?: string }) => <>{defaults}</> }));
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

it.each([390, 820, 1280])('moves signup into the full-screen welcome flow at %i px and keeps the required profile from being abandoned', async (width) => {
  vi.stubGlobal('innerWidth', width);
  const close = vi.fn();
  const view = render(<LoginModal open onOpenChange={close} />);
  await screen.findByRole('button', { name: 'Sign in with Apple' });
  expect(screen.getByTestId('sheet')).toHaveAttribute('data-dismissible', 'true');
  auth.requiresUsername = true;
  view.rerender(<LoginModal open onOpenChange={close} />);
  await screen.findByRole('textbox', { name: 'Username' });
  // The profile step takes the whole screen, with no sheet to swipe or close.
  const flow = screen.getByRole('dialog');
  expect(flow).toHaveAttribute('data-welcome-flow');
  expect(screen.queryByTestId('sheet')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in with Apple' })).toBeNull();
  expect(close).not.toHaveBeenCalled();

  auth.requiresUsername = false;
  view.rerender(<LoginModal open onOpenChange={close} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Close sheet' }));
  expect(close).toHaveBeenCalledWith(false);
});
