import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSubtitleOverlay } from '@/components/app/video/VideoSubtitleOverlay';
import { useCachedVideoDub } from '@/hooks/use-cached-video-dub';

const fixture = vi.hoisted(() => ({ phone: true, dub: false, appLang: 'en', sourceLang: '', corrections: new Map(), request: vi.fn(), lookup: vi.fn(), dubLookup: vi.fn(), engine: vi.fn() }));
vi.mock('@/hooks/use-touch-device', () => ({ useIsTouchDevice: () => fixture.phone }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: fixture.appLang } }) }));
vi.mock('@/hooks/use-video-transcript', () => ({
  useVideoTranscript: (id: number, enabled: boolean) => {
    fixture.lookup(id, enabled);
    return { status: 'ready', transcript: fixture.sourceLang ? { id: 'transcript', source_lang: fixture.sourceLang, segments: [] } : null, inFlight: false, start: { mutate: fixture.request } };
  },
  useTranslatedSegments: (id: string, lang: string, enabled: boolean) => {
    fixture.dubLookup(id, lang, enabled);
    return { segments: [{ start: 0, end: 2, text: 'Hola' }], status: 'ready', request: fixture.request };
  },
}));
vi.mock('@/hooks/use-transcript-corrections', () => ({
  useTranscriptCorrections: () => ({ accepted: fixture.corrections }),
  applyCorrections: (segments: unknown) => segments,
}));
vi.mock('@/hooks/dub-preference', () => ({
  useDubPreference: () => ({ on: fixture.dub, lang: null, setDub: fixture.request }),
  useSpeechVoices: () => [], pickVoice: (_voices: unknown, lang: string | null) => lang ? { lang } : null, primeSpeech: vi.fn(),
}));
vi.mock('@/components/app/video/VoiceDubEngine', () => ({ default: () => { fixture.engine(); return null; } }));
vi.mock('@/hooks/use-cached-video-dub', () => ({ useCachedVideoDub: vi.fn(() => undefined) }));
vi.mock('@/hooks/use-dub-discovery', () => ({ useDubDiscovery: vi.fn() }));
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
    fixture.dub = false;
    fixture.appLang = 'en';
    fixture.sourceLang = '';
    localStorage.clear();
    fixture.request.mockClear();
    fixture.lookup.mockClear();
    fixture.dubLookup.mockClear();
    fixture.engine.mockClear();
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

  it('plays an explicitly selected dub with captions off', async () => {
    fixture.dub = true;
    fixture.appLang = 'es';
    fixture.sourceLang = 'en';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} />);
    await waitFor(() => expect(fixture.engine).toHaveBeenCalled());
    expect(fixture.dubLookup).toHaveBeenCalledWith('transcript', 'es', true);
    expect(localStorage.getItem('video-subs:enabled')).toBe('0');
  });

  it('prepares foreign-language translation and audio without playing a dub', () => {
    fixture.appLang = 'es'; fixture.sourceLang = 'en';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} />);
    expect(fixture.lookup).toHaveBeenCalledWith(123, true);
    expect(fixture.dubLookup).toHaveBeenCalledWith('transcript', 'es', true);
    expect(useCachedVideoDub).toHaveBeenLastCalledWith('transcript', 'es', true);
    expect(fixture.engine).not.toHaveBeenCalled();
  });

  it('does not fetch a transcript or translation for a muted card', () => {
    fixture.dub = true;
    fixture.appLang = 'es';
    fixture.sourceLang = 'en';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    video.muted = true;
    render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} />);
    expect(fixture.lookup).not.toHaveBeenCalledWith(123, true);
    expect(fixture.dubLookup).not.toHaveBeenCalledWith('transcript', 'es', true);
  });

  it('keeps dubbing available when the original track is silent or playback pauses', async () => {
    fixture.dub = true;
    fixture.appLang = 'es';
    fixture.sourceLang = 'en';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, writable: true });
    video.volume = 0;
    const available = vi.fn();
    render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} onDubAvailableChange={available} />);
    await waitFor(() => expect(available).toHaveBeenLastCalledWith(true));
    expect(fixture.dubLookup).toHaveBeenCalledWith('transcript', 'es', true);
    Object.defineProperty(video, 'paused', { value: true });
    fireEvent.pause(video);
    expect(available).toHaveBeenLastCalledWith(true);
  });

  it('offers the mixer while a selected dub is waiting for the transcript on a muted card', () => {
    fixture.dub = true;
    fixture.appLang = 'es';
    const video = document.createElement('video');
    video.muted = true;
    const available = vi.fn();
    const { rerender } = render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} onDubAvailableChange={available} />);
    expect(available).toHaveBeenLastCalledWith(true);
    expect(fixture.lookup).not.toHaveBeenCalledWith(123, true);
    expect(fixture.engine).not.toHaveBeenCalled();
    fixture.dub = false;
    rerender(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: video }} onDubAvailableChange={available} />);
    expect(available).toHaveBeenLastCalledWith(false);
  });

  it('uses the normal volume control when the video already speaks the selected language', () => {
    fixture.dub = true;
    fixture.appLang = 'es';
    fixture.sourceLang = 'es';
    const available = vi.fn();
    render(<VideoSubtitleOverlay tokenId={123} videoRef={{ current: document.createElement('video') }} onDubAvailableChange={available} />);
    expect(available).toHaveBeenLastCalledWith(false);
  });
});
