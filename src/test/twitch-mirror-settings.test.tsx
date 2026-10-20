import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitchMirrorSettings } from '@/components/app/settings/TwitchMirrorSettings';

const mocks = vi.hoisted(() => ({ status: vi.fn(), enable: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock('@/lib/api/dehub/twitch-mirror', () => ({ twitchMirror: mocks }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { address: '0xcreator' } }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TwitchMirrorSettings />
  </QueryClientProvider>);
}

describe('Twitch mirroring controls', () => {
  beforeEach(() => vi.clearAllMocks());
  it('lets a creator stop mirroring even when the relay becomes unavailable', async () => {
    mocks.status.mockResolvedValue({ available: false, connected: true, enabled: true, state: 'error' });
    mocks.enable.mockResolvedValue({});
    show();
    const toggle = await screen.findByRole('switch');
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith(false));
  });
  it('does not offer an active connect button before the backend is available', async () => {
    mocks.status.mockResolvedValue({ available: false, connected: false, enabled: false });
    show();
    await screen.findByText('twitchMirror.unavailable');
    expect(screen.getByRole('button', { name: 'twitchMirror.connect' })).toBeDisabled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
