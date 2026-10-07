import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DubVolumeControl } from '@/components/app/video/DubVolumeControl';
import { DEFAULT_DUB_MIX, getDubMix, setDubMix } from '@/lib/dub-mix';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const mute = vi.fn();
const unmute = vi.fn();
function Controls() {
  const [open, setOpen] = useState(false);
  return <DubVolumeControl open={open} onOpenChange={setOpen} muted={false} onToggleMute={mute} onUnmute={unmute} />;
}
const finger = { identifier: 1, clientX: 10, clientY: 10 };

describe('dub volume controls', () => {
  beforeEach(() => { setDubMix(DEFAULT_DUB_MIX); mute.mockClear(); unmute.mockClear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('opens on desktop click and saves independent track levels', () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole('button', { name: 'videoPlayer.volume' }));
    expect(screen.getByRole('slider', { name: 'dub.dubbed' })).toHaveValue('100');
    const original = screen.getByRole('slider', { name: 'dub.original' });
    expect(original).toHaveValue('10');
    fireEvent.change(original, { target: { value: '0' } });
    expect(getDubMix()).toEqual({ voice: 1, original: 0 });
    fireEvent.change(screen.getByRole('slider', { name: 'dub.dubbed' }), { target: { value: '50' } });
    expect(getDubMix()).toEqual({ voice: 0.5, original: 0 });
    expect(JSON.parse(localStorage.getItem('video-dub-mix')!)).toEqual(getDubMix());
    expect(mute).not.toHaveBeenCalled();
  });

  it('opens after a touch hold and survives the compatibility click without muting', () => {
    vi.useFakeTimers();
    render(<Controls />);
    const button = screen.getByRole('button', { name: 'videoPlayer.volume' });
    fireEvent.touchStart(button, { touches: [finger] });
    act(() => vi.advanceTimersByTime(220));
    fireEvent.touchEnd(button, { changedTouches: [finger], touches: [] });
    fireEvent.click(button);
    expect(screen.getByRole('slider', { name: 'dub.dubbed' })).toBeInTheDocument();
    expect(mute).not.toHaveBeenCalled();
  });

  it('keeps a short touch as mute and leaves scrolling alone', () => {
    vi.useFakeTimers();
    render(<Controls />);
    const button = screen.getByRole('button', { name: 'videoPlayer.volume' });
    fireEvent.touchStart(button, { touches: [finger] });
    fireEvent.touchEnd(button, { changedTouches: [finger], touches: [] });
    fireEvent.click(button);
    expect(mute).toHaveBeenCalledTimes(1);
    fireEvent.touchStart(button, { touches: [finger] });
    fireEvent.touchMove(button, { touches: [{ ...finger, clientY: 40 }] });
    act(() => vi.advanceTimersByTime(220));
    fireEvent.touchEnd(button, { changedTouches: [finger], touches: [] });
    fireEvent.click(button);
    expect(mute).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
