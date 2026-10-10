import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoScrubZone } from '../use-video-scrub-zone';

function setup(expanded = false) {
  const onCommit = vi.fn(), onPreview = vi.fn(), onStart = vi.fn(), onFinish = vi.fn(), onCancel = vi.fn();
  const buttonPress = vi.fn(), openPost = vi.fn(), openProfile = vi.fn();
  const tabTouch = vi.fn();
  function Fixture() {
    const mediaRef = useRef<HTMLDivElement>(null), eventRef = useRef<HTMLDivElement>(null);
    const handlers = useVideoScrubZone({ enabled: true, duration: 100, onCommit, onPreview, onStart, onFinish, onCancel, ignoreSelector: '[data-audio-style-picker]', ...(expanded ? { mediaRef, eventRef } : {}) });
    return <div onTouchStart={tabTouch} onTouchMove={tabTouch} onTouchEnd={tabTouch} onTouchCancel={tabTouch}>
    <div data-testid="post" ref={eventRef} onClick={openPost} {...(expanded ? handlers : {})}>
    <div data-testid="media" ref={mediaRef} {...(expanded ? {} : handlers)}>
      <div data-video-controls><button onClick={event => { event.stopPropagation(); buttonPress(); }}>Play</button></div>
      <div data-testid="strip" />
      <div data-testid="track" data-scrub-track />
      <div data-audio-style-picker><button>Preset</button></div>
    </div>
    <button onClick={event => { event.stopPropagation(); openProfile(); }}>Author</button>
    <div data-testid="caption">Caption</div>
    </div></div>;
  }
  const view = render(<Fixture />);
  const media = view.getByTestId('media');
  vi.spyOn(media, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} });
  media.setPointerCapture = vi.fn();
  const post = view.getByTestId('post');
  post.setPointerCapture = vi.fn();
  const pointer = (target: Element, type: string, x: number, y = 80) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    fireEvent(target, event);
  };
  return { ...view, media, post, pointer, onCommit, onPreview, onStart, onFinish, onCancel, buttonPress, openPost, openProfile, tabTouch };
}

describe('video scrub priority', () => {
  it('keeps every touch phase of a scrub away from tab navigation', () => {
    const s = setup(), track = s.getByTestId('track');
    fireEvent.touchStart(track, { touches: [{ clientX: 20, clientY: 95 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 150, clientY: 70 }] });
    fireEvent.touchEnd(track, { touches: [] });
    expect(s.tabTouch).not.toHaveBeenCalled();
    fireEvent.touchStart(track, { touches: [{ clientX: 20, clientY: 95 }] });
    fireEvent.touchCancel(track, { touches: [] });
    expect(s.tabTouch).not.toHaveBeenCalled();
    // A later gesture outside the bottom strip still reaches the feed.
    fireEvent.touchStart(s.media, { touches: [{ clientX: 20, clientY: 10 }] });
    expect(s.tabTouch).toHaveBeenCalledTimes(1);
  });

  it('claims the dedicated track on press and retains it through drift and reversals', () => {
    const s = setup(), track = s.getByTestId('track');
    s.pointer(track, 'pointerdown', 20, 95);
    expect(s.onStart).toHaveBeenCalledTimes(1);
    expect(s.onPreview).toHaveBeenLastCalledWith(10);
    s.pointer(s.media, 'pointermove', 21, 75);
    s.pointer(s.media, 'pointermove', 250, 30);
    expect(s.onPreview).toHaveBeenLastCalledWith(100);
    s.pointer(s.media, 'pointermove', -10, 30);
    expect(s.onPreview).toHaveBeenLastCalledWith(0);
    s.pointer(s.media, 'pointerup', 100, 30);
    expect(s.onCommit).toHaveBeenCalledExactlyOnceWith(50);
    expect(s.onFinish).toHaveBeenCalledTimes(1);
    expect(s.onCancel).not.toHaveBeenCalled();
    expect(s.openPost).not.toHaveBeenCalled();
  });

  it('leaves audio preset scrolling outside the transport scrub gesture', () => {
    const s = setup(), preset = s.getByRole('button', { name: 'Preset' });
    s.pointer(preset, 'pointerdown', 20);
    s.pointer(preset, 'pointermove', 150);
    s.pointer(preset, 'pointerup', 150);
    expect(s.onStart).not.toHaveBeenCalled();
    expect(s.onPreview).not.toHaveBeenCalled();
    expect(s.onCommit).not.toHaveBeenCalled();
  });
  it('takes a horizontal drag that starts over Play and consumes its release click', () => {
    const s = setup(), button = s.getByRole('button', { name: 'Play' });
    s.pointer(button, 'pointerdown', 20);
    s.pointer(button, 'pointermove', 150);
    expect(s.onPreview).toHaveBeenLastCalledWith(75);
    expect(s.onCommit).not.toHaveBeenCalled();
    s.pointer(s.media, 'pointerup', 160);
    fireEvent.click(button, { detail: 1 });
    expect(s.onCommit).toHaveBeenCalledWith(80);
    expect(s.buttonPress).not.toHaveBeenCalled();
    expect(s.openPost).not.toHaveBeenCalled();
  });

  it('keeps a stationary button tap working', () => {
    const s = setup(), button = s.getByRole('button', { name: 'Play' });
    s.pointer(button, 'pointerdown', 20);
    s.pointer(button, 'pointerup', 20);
    fireEvent.click(button, { detail: 1 });
    expect(s.buttonPress).toHaveBeenCalledTimes(1);
    expect(s.onCommit).not.toHaveBeenCalled();
  });

  it('seeks from empty space across the bottom 64px without opening the post', () => {
    const s = setup(), strip = s.getByTestId('strip');
    s.pointer(strip, 'pointerdown', 160, 36);
    s.pointer(strip, 'pointerup', 160, 36);
    fireEvent.click(strip, { detail: 1 });
    expect(s.onCommit).toHaveBeenCalledWith(80);
    expect(s.openPost).not.toHaveBeenCalled();
  });

  it('yields vertical travel over a transport button without seeking or clicking', () => {
    const s = setup(), strip = s.getByRole('button', { name: 'Play' });
    s.pointer(strip, 'pointerdown', 160);
    s.pointer(strip, 'pointermove', 160, 65);
    s.pointer(strip, 'pointerup', 160, 65);
    fireEvent.click(strip, { detail: 1 });
    expect(s.onCommit).not.toHaveBeenCalled();
    expect(s.openPost).not.toHaveBeenCalled();
  });

  it('owns a near-track author touch through vertical drift, reversal and release', () => {
    const s = setup(true), author = s.getByRole('button', { name: 'Author' });
    s.pointer(author, 'pointerdown', 20, 124);
    fireEvent.touchStart(author, { touches: [{ clientX: 20, clientY: 124 }] });
    expect(s.onStart).toHaveBeenCalledTimes(1);
    expect(s.onPreview).toHaveBeenLastCalledWith(10);
    expect(s.post.setPointerCapture).toHaveBeenCalledWith(1);
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    fireEvent(author, move);
    expect(move.defaultPrevented).toBe(true);
    s.pointer(s.post, 'pointermove', 250, 170);
    expect(s.onPreview).toHaveBeenLastCalledWith(100);
    s.pointer(s.post, 'pointermove', -10, 60);
    expect(s.onPreview).toHaveBeenLastCalledWith(0);
    s.pointer(s.post, 'pointerup', 100, 160);
    fireEvent.touchEnd(author, { touches: [] });
    fireEvent.click(author, { detail: 1 });
    fireEvent.click(s.post, { detail: 1 });
    expect(s.onCommit).toHaveBeenCalledExactlyOnceWith(50);
    expect(s.openProfile).not.toHaveBeenCalled();
    expect(s.openPost).not.toHaveBeenCalled();
    expect(s.tabTouch).not.toHaveBeenCalled();

    // A fresh deliberate tap outside the 24px extension restores navigation.
    s.pointer(author, 'pointerdown', 20, 130);
    s.pointer(author, 'pointerup', 20, 130);
    fireEvent.click(author, { detail: 1 });
    expect(s.openProfile).toHaveBeenCalledTimes(1);
    const caption = s.getByTestId('caption');
    s.pointer(caption, 'pointerdown', 20, 150);
    s.pointer(caption, 'pointerup', 20, 150);
    fireEvent.click(caption, { detail: 1 });
    expect(s.openPost).toHaveBeenCalledTimes(1);
    const scroll = new Event('touchmove', { bubbles: true, cancelable: true });
    fireEvent(caption, scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it('preserves stationary transport button taps with the expanded post boundary', () => {
    const s = setup(true), button = s.getByRole('button', { name: 'Play' });
    s.pointer(button, 'pointerdown', 20, 80);
    s.pointer(button, 'pointerup', 20, 80);
    fireEvent.click(button, { detail: 1 });
    expect(s.buttonPress).toHaveBeenCalledTimes(1);
    expect(s.onStart).not.toHaveBeenCalled();
  });

  it('does not claim touches beside the media or beyond the enlarged strip', () => {
    const s = setup(true), caption = s.getByTestId('caption');
    for (const [x, y] of [[-1, 110], [201, 110], [100, 125], [100, 35]]) {
      s.pointer(caption, 'pointerdown', x, y);
      s.pointer(caption, 'pointerup', x, y);
      fireEvent.click(caption, { detail: 1 });
    }
    expect(s.openPost).toHaveBeenCalledTimes(4);
    expect(s.onStart).not.toHaveBeenCalled();
  });

  it('cancels an interrupted scrub without committing the preview', () => {
    const s = setup(), strip = s.getByTestId('strip');
    s.pointer(strip, 'pointerdown', 20);
    s.pointer(strip, 'pointermove', 150);
    s.pointer(s.media, 'pointercancel', 150);
    expect(s.onCancel).toHaveBeenCalledTimes(1);
    expect(s.onFinish).toHaveBeenCalledTimes(1);
    expect(s.onCommit).not.toHaveBeenCalled();
  });
});
