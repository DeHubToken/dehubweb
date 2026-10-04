import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHandoffVideo } from '@/hooks/use-handoff-video';
import { HandoffImage } from '@/components/app/cards/HandoffImage';
import { galleryIndex, rememberGalleryIndex } from '@/lib/media-presentation';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function VideoSlot({ detail = false }: { detail?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | undefined>(detail ? undefined : '/clip.mp4');
  const [muted, setMuted] = useState(true);
  const { attachSlot } = useHandoffVideo({
    videoRef: ref, handoffKey: 'continuity-test', src, muted,
    loop: false, preload: 'metadata', className: 'video',
    onAdopt: el => { if (el.getAttribute('src')) { setSrc('/clip.mp4'); setMuted(el.muted); } },
  });
  return <div data-testid={detail ? 'detail' : 'feed'} ref={attachSlot} />;
}

describe('media navigation continuity', () => {
  it('keeps a hidden cached feed from stealing the visible video or image', () => {
    const slot = (active: boolean) => <CachedPageActiveContext.Provider value={active}><VideoSlot /><HandoffImage mediaKey="hidden-tab-photo" src="/photo.jpg" /></CachedPageActiveContext.Provider>;
    const view = render(<><div data-testid="visible-tab">{slot(true)}</div><div data-testid="hidden-tab">{slot(false)}</div></>);
    const video = view.getByTestId('visible-tab').querySelector('video');
    const image = view.getByTestId('visible-tab').querySelector('img');
    expect(video).toBeTruthy();
    expect(image).toBeTruthy();
    expect(view.getByTestId('hidden-tab').querySelector('video')).toBeNull();
    expect(view.getByTestId('hidden-tab').querySelector('img')).toBeNull();
    view.rerender(<><div data-testid="visible-tab">{slot(false)}</div><div data-testid="hidden-tab">{slot(true)}</div></>);
    expect(view.getByTestId('hidden-tab').querySelector('video')).toBe(video);
    expect(view.getByTestId('hidden-tab').querySelector('img')).toBe(image);
  });
  it('keeps the loaded video, playhead and sound through an initially cold detail slot and back', () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const view = render(<><VideoSlot /><span /></>);
    const video = view.getByTestId('feed').querySelector('video')!;
    video.currentTime = 42;
    video.playbackRate = 1.5;
    video.muted = false;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    view.rerender(<><VideoSlot /><VideoSlot detail /></>);
    expect(view.getByTestId('detail').querySelector('video')).toBe(video);
    expect(video.getAttribute('src')).toBe('/clip.mp4');
    expect(video.currentTime).toBe(42);
    expect(video.playbackRate).toBe(1.5);
    expect(video.muted).toBe(false);
    expect(load).not.toHaveBeenCalled();
    video.currentTime = 48;
    view.rerender(<><VideoSlot /><span /></>);
    expect(view.getByTestId('feed').querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(48);
    expect(load).not.toHaveBeenCalled();
  });

  it('moves the same decoded image feed → post → fullscreen → post → feed', () => {
    const photo = (priority: number) => <HandoffImage mediaKey="image-continuity" priority={priority} src="/photo.jpg" style={{ maxHeight: 600 }} />;
    const view = render(<>{photo(0)}<span /><span /></>);
    const image = view.container.querySelector('img')!;
    view.rerender(<>{photo(0)}{photo(1)}<span /></>);
    expect(view.container.querySelectorAll('img')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-image-slot]')[1].firstChild).toBe(image);
    view.rerender(<>{photo(0)}{photo(1)}{photo(2)}</>);
    expect(view.container.querySelectorAll('[data-image-slot]')[2].firstChild).toBe(image);
    view.rerender(<>{photo(0)}{photo(1)}<span /></>);
    expect(view.container.querySelectorAll('[data-image-slot]')[1].firstChild).toBe(image);
    view.rerender(<>{photo(0)}<span /><span /></>);
    expect(view.container.querySelector('[data-image-slot]')!.firstChild).toBe(image);
    expect(image.style.maxHeight).toBe('600px');
  });

  it('retains gallery selection without an unbounded history', () => {
    act(() => rememberGalleryIndex('gallery-test', 3));
    expect(galleryIndex('gallery-test')).toBe(3);
    for (let index = 0; index < 129; index++) rememberGalleryIndex(`gallery-${index}`, 1);
    expect(galleryIndex('gallery-test')).toBe(0);
    expect(galleryIndex('gallery-128')).toBe(1);
  });

  it('notifies a cached image once when its load callback updates the parent', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(800);
    const loaded = vi.fn();
    function CachedPhoto() {
      const [loads, setLoads] = useState(0);
      return <><output>{loads}</output><HandoffImage mediaKey="cached-load-state" src="/cached.jpg" onImageLoad={() => {
        loaded();
        setLoads(value => value + 1);
      }} /></>;
    }
    const view = render(<CachedPhoto />);
    expect(view.container.querySelector('output')?.textContent).toBe('1');
    view.rerender(<CachedPhoto />);
    fireEvent.load(view.container.querySelector('img')!);
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it('notifies new image owners and replacement bitmaps without repeating on handoff back', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
    const height = vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(800);
    const feedLoaded = vi.fn();
    const detailLoaded = vi.fn();
    const photo = (src: string, detail = false) => <HandoffImage mediaKey="cached-load-handoff" priority={detail ? 1 : 0} src={src} onImageLoad={detail ? detailLoaded : feedLoaded} />;
    const view = render(<>{photo('/first.jpg')}<span /></>);
    const image = view.container.querySelector('img')!;
    view.rerender(<>{photo('/first.jpg')}{photo('/first.jpg', true)}</>);
    expect(detailLoaded).toHaveBeenCalledOnce();
    view.rerender(<>{photo('/first.jpg')}<span /></>);
    expect(view.container.querySelector('img')).toBe(image);
    expect(feedLoaded).toHaveBeenCalledOnce();
    view.rerender(<>{photo('/second.jpg')}<span /></>);
    expect(feedLoaded).toHaveBeenCalledTimes(2);
    height.mockReturnValue(600);
    fireEvent.load(image);
    expect(feedLoaded).toHaveBeenCalledTimes(3);
    fireEvent.load(image);
    expect(feedLoaded).toHaveBeenCalledTimes(3);
  });
});
