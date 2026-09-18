import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImmersiveLiveChrome } from '@/components/app/live/ImmersiveLiveChrome';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/use-dehub-profile', () => ({ useDeHubProfile: () => ({}) }));
vi.mock('@/hooks/use-follow', () => ({ useFollowOverrides: () => new Map(), toggleFollowFor: vi.fn() }));
vi.mock('@/components/app/BadgeIcon', () => ({ BadgeIcon: () => null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(progress = 0.5) {
  const onSeek = vi.fn();
  render(<ImmersiveLiveChrome streamerName="Creator" title="Replay" isLive={false} isEnded viewers={0}
    isMuted onToggleMute={() => {}} hidden={false} onToggleHidden={() => {}} progress={progress} onSeek={onSeek} />);
  return { onSeek, slider: screen.getByRole('slider', { name: 'Replay' }) };
}

describe('replay seeking', () => {
  it('supports keyboard seeking and timeline endpoints', () => {
    const { slider, onSeek } = mount();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(0.55);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  it('previews a drag without restarting playback at every pointer movement', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { slider, onSeek } = mount();
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
    fireEvent.pointerDown(slider, { clientX: 25 });
    fireEvent.pointerMove(window, { clientX: 75 });
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute('aria-valuenow', '75');
    fireEvent.pointerUp(window, { clientX: 75 });
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(0.75);
  });

  it('cancels an interrupted drag without seeking', () => {
    const { slider, onSeek } = mount();
    fireEvent.pointerDown(slider);
    fireEvent.pointerCancel(window);
    expect(onSeek).not.toHaveBeenCalled();
  });
});
