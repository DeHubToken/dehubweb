import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  open: false,
  notify: null as null | ((version: any) => void),
  message: vi.fn(() => 'app-new-version'),
  dismiss: vi.fn(),
  stop: vi.fn(),
  translate: vi.fn(),
  dismissVersion: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { message: state.message, dismiss: state.dismiss } }));
vi.mock('@/lib/overlay-open', () => ({ useAnyOverlayOpen: () => state.open }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/app' }) }));
vi.mock('@/i18n', () => ({ default: { language: 'fr', t: (key: string) => key } }));
vi.mock('@/lib/auto-translate-setting', () => ({ autoTranslateEnabled: () => true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.translate } } }));
vi.mock('@/lib/version-check', () => ({
  startVersionWatch: (notify: typeof state.notify) => { state.notify = notify; return state.stop; },
  takeStaleReload: () => false,
  dismissVersionUpdate: state.dismissVersion,
}));
import { NewVersionToast } from '@/components/app/NewVersionToast';

describe('update notice and modal ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); state.open = false; });

  it('queues while a menu is open, hides on reopen, and honours user dismissal', async () => {
    state.open = true;
    const view = render(<NewVersionToast />);
    act(() => state.notify?.({ version: 'new' }));
    expect(state.message).not.toHaveBeenCalled();
    state.open = false;
    view.rerender(<NewVersionToast />);
    await waitFor(() => expect(state.message).toHaveBeenCalledTimes(1));
    state.open = true;
    view.rerender(<NewVersionToast />);
    expect(state.dismiss).toHaveBeenCalledWith('app-new-version');
    state.open = false;
    view.rerender(<NewVersionToast />);
    expect(state.message).toHaveBeenCalledTimes(2);
    act(() => (state.message.mock.calls[1] as any)[1].onDismiss());
    state.open = true; view.rerender(<NewVersionToast />);
    state.open = false; view.rerender(<NewVersionToast />);
    expect(state.message).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(state.stop).toHaveBeenCalledOnce();
  });

  it('does not bypass a newly opened menu when translation finishes', async () => {
    let resolve!: (value: any) => void;
    state.translate.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<NewVersionToast />);
    act(() => state.notify?.({ version: 'new', note: 'Changes' }));
    state.open = true; view.rerender(<NewVersionToast />);
    await act(async () => { resolve({ data: { translatedText: 'Modifications' } }); });
    expect(state.message).not.toHaveBeenCalled();
    state.open = false; view.rerender(<NewVersionToast />);
    expect(state.message).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('drops a pending translation on unmount', async () => {
    let resolve!: (value: any) => void;
    state.translate.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<NewVersionToast />);
    act(() => state.notify?.({ version: 'new', note: 'Changes' }));
    view.unmount();
    await act(async () => { resolve({ data: { translatedText: 'Modifications' } }); });
    expect(state.message).not.toHaveBeenCalled();
  });
});
