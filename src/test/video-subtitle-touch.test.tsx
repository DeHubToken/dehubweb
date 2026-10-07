import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSubtitleOverlay } from '@/components/app/video/VideoSubtitleOverlay';

const fixture = vi.hoisted(() => ({ phone: true, corrections: new Map(), request: vi.fn() }));
vi.mock('@/hooks/use-touch-device', () => ({ useIsTouchDevice: () => fixture.phone }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-video-transcript', () => ({
  useVideoTranscript: () => ({ status: 'ready', transcript: null, inFlight: false, start: { mutate: fixture.request } }),
  useTranslatedSegments: () => ({ segments: null, status: 'ready', request: fixture.request }),
}));
vi.mock('@/hooks/use-transcript-corrections', () => ({
  useTranscriptCorrections: () => ({ accepted: fixture.corrections }),
  applyCorrections: (segments: unknown) => segments,
}));
vi.mock('@/hooks/dub-preference', () => ({
  useDubPreference: () => ({ on: false, lang: null, setDub: fixture.request }),
  useSpeechVoices: () => [], pickVoice: () => null, primeSpeech: vi.fn(),
}));
vi.mock('@/lib/wallet-unlock-flow', () => ({ useWalletUnlockPrompt: () => false }));
vi.mock('@/lib/scroll-freeze-watchdog', () => ({ settleAfterOverlayClose: vi.fn() }));
vi.mock('@/lib/overlay-open', () => ({ OverlayOpenTracker: () => null }));

function setup() {
  render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: null }} />);
  return screen.getByRole('button', { name: 'Subtitles off' });
}
const finger = { identifier: 1, clientX: 30, clientY: 30 };

describe('subtitle menu on phones', () => {
  beforeEach(() => {
    fixture.phone = true;
    localStorage.clear();
    fixture.request.mockClear();
  });
  afterEach(cleanup);

  it('opens a held press after release and survives the compatibility click', async () => {
    const button = setup();
    fireEvent.touchStart(button, { touches: [finger] });
    fireEvent.contextMenu(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.touchEnd(button, { changedTouches: [finger], touches: [] });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem('video-subs:enabled')).toBe('0');
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it('opens settings with a tap and keeps them open while changing settings', async () => {
    const button = setup();
    fireEvent.click(button);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem('video-subs:enabled')).toBe('1');
  });

  it('does not open when the finger scrolls or the gesture is cancelled', () => {
    const button = setup();
    fireEvent.touchStart(button, { touches: [finger] });
    fireEvent.touchMove(button, { touches: [{ ...finger, clientY: 80 }] });
    fireEvent.touchEnd(button, { changedTouches: [{ ...finger, clientY: 80 }], touches: [] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.touchStart(button, { touches: [finger] });
    fireEvent.touchCancel(button);
    fireEvent.touchEnd(button, { changedTouches: [finger], touches: [] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the desktop click toggle', () => {
    fixture.phone = false;
    fireEvent.click(setup());
    expect(localStorage.getItem('video-subs:enabled')).toBe('1');
  });
});
