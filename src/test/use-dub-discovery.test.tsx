import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthContext } from '@/contexts/AuthContext';
import { useDubDiscovery } from '@/hooks/use-dub-discovery';

const fixture = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), on: false, at: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
vi.mock('@/hooks/dub-preference', () => ({ getDubPreference: () => ({ on: fixture.on }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { info: fixture.toast } }));

function Harness({ video, wallet, source = 'es', open }: { video: HTMLVideoElement; wallet: string | null; source?: string; open: () => void }) {
  return <AuthContext.Provider value={{ isAuthenticated: !!wallet, walletAddress: wallet } as any}>
    <Listener video={video} source={source} open={open} />
  </AuthContext.Provider>;
}
function Listener({ video, source, open }: { video: HTMLVideoElement; source: string; open: () => void }) {
  useDubDiscovery({ current: video }, 6543, source, 'en', true, fixture.on, open);
  return null;
}
function video() {
  const v = document.createElement('video');
  Object.defineProperties(v, { paused: { value: false, writable: true }, duration: { value: 30 }, readyState: { value: 2 } });
  return v;
}
function pass(v: HTMLVideoElement) {
  for (let second = 1; second <= 12; second++) {
    fixture.at += 1000; v.currentTime = second; fireEvent.timeUpdate(v);
  }
}
beforeEach(() => {
  fixture.on = false; fixture.at = 0; fixture.rpc.mockReset(); fixture.toast.mockReset();
  fixture.rpc.mockResolvedValue({ data: true, error: null });
  vi.spyOn(Date, 'now').mockImplementation(() => fixture.at);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('claims only after real replay and opens existing settings without enabling a dub', async () => {
  const v = video(), open = vi.fn();
  render(<Harness video={v} wallet="0x4444444444444444444444444444444444444444" open={open} />);
  pass(v); expect(fixture.rpc).not.toHaveBeenCalled();
  v.currentTime = 0; fireEvent.seeked(v); fireEvent.timeUpdate(v);
  pass(v); await act(async () => {});
  expect(fixture.rpc).toHaveBeenCalledTimes(1);
  expect(fixture.toast).toHaveBeenCalledTimes(1);
  Object.defineProperty(v, 'paused', { value: true });
  fixture.toast.mock.calls[0][1].action.onClick();
  expect(open).toHaveBeenCalledTimes(1); expect(fixture.on).toBe(false);
});
it('does not claim for muted playback, unknown language or signed-out playback', () => {
  const v = video(); v.muted = true;
  const view = render(<Harness video={v} wallet="0x5555555555555555555555555555555555555555" open={vi.fn()} />);
  pass(v); v.currentTime = 0; fireEvent.seeked(v); pass(v);
  v.muted = false;
  view.rerender(<Harness video={v} wallet={null} open={vi.fn()} />);
  pass(v);
  view.rerender(<Harness video={v} source="und" wallet="0x5555555555555555555555555555555555555555" open={vi.fn()} />);
  pass(v);
  expect(fixture.rpc).not.toHaveBeenCalled();
});
