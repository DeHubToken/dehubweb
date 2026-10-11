import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuickActionsDrawer from '@/components/app/QuickActionsDrawer';

const mocks = vi.hoisted(() => ({ submit: vi.fn(), capture: vi.fn(), login: vi.fn(), authenticated: true }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: mocks.authenticated, walletAddress: '0xabc', openLoginModal: mocks.login, disconnect: vi.fn() }) }));
vi.mock('@/hooks/use-feature-requests', () => ({ useSubmitFeatureRequest: () => ({ mutateAsync: mocks.submit, isPending: false }) }));
vi.mock('@/components/app/settings/ProfilesSection', () => ({ ProfilesSection: () => null }));
vi.mock('@/hooks/use-surface-draft', () => ({ useSurfaceDraft: () => {
  const [value, setter] = useState('');
  return [value, Object.assign(setter, { complete: (_sent: string, replacement: string) => { setter(replacement); return true; } })];
} }));
vi.mock('@/components/ui/drawer', () => {
  const Box = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { Drawer: Box, DrawerContent: Box, DrawerHeader: Box, DrawerTitle: Box, DrawerDescription: Box };
});
vi.mock('@/lib/page-bug-report', async importOriginal => ({ ...await importOriginal<object>(), captureBugScreenshot: mocks.capture, enrichPageBugContext: async (context: unknown) => context }));
const context = { page: 'https://dehub.io/app/home', capturedAt: '2026-10-11T12:00:00Z', device: 'Android 16', viewport: '400 × 800', model: 'Pixel', userAgent: 'Browser' };
beforeEach(() => { mocks.submit.mockReset(); mocks.capture.mockReset().mockResolvedValue(null); mocks.login.mockReset(); mocks.authenticated = true; });
afterEach(cleanup);

it('sends a short report and automatic context even when capture is unavailable', async () => {
  const close = vi.fn(); mocks.submit.mockResolvedValue({ id: 'saved' });
  render(<QuickActionsDrawer context={context} initialReport onClose={close} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Video freezes' } });
  await waitFor(() => expect(screen.getByText('quickActions.send')).toBeEnabled());
  fireEvent.click(screen.getByText('quickActions.send'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ category: 'bug_fix', title: 'Video freezes', description: expect.stringContaining('Model: Pixel'), mediaFiles: [] }));
  expect(mocks.submit.mock.calls[0][0].description).toContain(context.page);
});
it('keeps the message on failure and prevents duplicate submissions while pending', async () => {
  let fail!: (error: Error) => void;
  mocks.submit.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
  const close = vi.fn(); render(<QuickActionsDrawer context={context} initialReport onClose={close} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No sound' } });
  await waitFor(() => expect(screen.getByText('quickActions.send')).toBeEnabled());
  fireEvent.click(screen.getByText('quickActions.send')); fireEvent.click(screen.getByText('quickActions.send'));
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  fail(new Error('offline'));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toHaveValue('No sound'); expect(close).not.toHaveBeenCalled();
});
it('asks guests to sign in before writing a public bug', async () => {
  mocks.authenticated = false;
  render(<QuickActionsDrawer context={context} initialReport onClose={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Cannot play' } });
  await waitFor(() => expect(screen.getByText('quickActions.signIn')).toBeEnabled());
  fireEvent.click(screen.getByText('quickActions.signIn'));
  expect(mocks.login).toHaveBeenCalledTimes(1); expect(mocks.submit).not.toHaveBeenCalled();
});
