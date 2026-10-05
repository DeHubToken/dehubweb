import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoScrubZone } from '../use-video-scrub-zone';

function setup() {
  const onCommit = vi.fn(), onPreview = vi.fn(), onStart = vi.fn(), onFinish = vi.fn(), onCancel = vi.fn();
  const buttonPress = vi.fn(), openPost = vi.fn();
  function Fixture() {
    const handlers = useVideoScrubZone({ enabled: true, duration: 100, onCommit, onPreview, onStart, onFinish, onCancel, ignoreSelector: '[data-audio-style-picker]' });
    return <div onClick={openPost}><div data-testid="media" {...handlers}>
      <button onClick={event => { event.stopPropagation(); buttonPress(); }}>Play</button>
      <div data-testid="strip" />
      <div data-audio-style-picker><button>Preset</button></div>
    </div></div>;
  }
  const view = render(<Fixture />);
  const media = view.getByTestId('media');
  vi.spyOn(media, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} });
  media.setPointerCapture = vi.fn();
  const pointer = (target: Element, type: string, x: number, y = 80) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    fireEvent(target, event);
  };
  return { ...view, media, pointer, onCommit, onPreview, onStart, onFinish, onCancel, buttonPress, openPost };
}

describe('video scrub priority', () => {
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

  it('seeks from empty space across the bottom 48px without opening the post', () => {
    const s = setup(), strip = s.getByTestId('strip');
    s.pointer(strip, 'pointerdown', 160, 55);
    s.pointer(strip, 'pointerup', 160, 55);
    fireEvent.click(strip, { detail: 1 });
    expect(s.onCommit).toHaveBeenCalledWith(80);
    expect(s.openPost).not.toHaveBeenCalled();
  });

  it('yields vertical travel without seeking or clicking', () => {
    const s = setup(), strip = s.getByTestId('strip');
    s.pointer(strip, 'pointerdown', 160);
    s.pointer(strip, 'pointermove', 160, 65);
    s.pointer(strip, 'pointerup', 160, 65);
    fireEvent.click(strip, { detail: 1 });
    expect(s.onCommit).not.toHaveBeenCalled();
    expect(s.openPost).not.toHaveBeenCalled();
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
