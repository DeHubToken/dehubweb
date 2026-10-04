import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SoundtrackControl } from './SoundtrackControl';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => { vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** A playing 40 s song, with its wave laid out 200 px wide from x = 100. */
function renderPlaying() {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'duration', { configurable: true, value: 40 });
  el.currentTime = 4;
  const photo = { click: vi.fn(), pointerDown: vi.fn() };
  render(
    <div onClick={photo.click} onPointerDown={photo.pointerDown}>
      <SoundtrackControl title="Song" playing loading={false} error={false} toggle={vi.fn()} audioRef={{ current: el }} />
    </div>,
  );
  const wave = screen.getByRole('slider');
  wave.getBoundingClientRect = () => ({ left: 100, width: 200, right: 300, top: 0, bottom: 30, height: 30, x: 100, y: 0, toJSON: () => ({}) });
  return { el, wave, photo };
}

it('seeks the song when the wave is dragged, without the photo seeing it', () => {
  const { el, wave, photo } = renderPlaying();
  fireEvent.pointerDown(wave, { clientX: 150, pointerId: 1 });
  fireEvent.pointerMove(wave, { clientX: 250, pointerId: 1 });
  expect(el.currentTime).toBe(4);
  fireEvent.pointerUp(wave, { clientX: 250, pointerId: 1 });
  fireEvent.click(wave);
  expect(el.currentTime).toBe(30);
  expect(photo.pointerDown).not.toHaveBeenCalled();
  expect(photo.click).not.toHaveBeenCalled();
});

it('seeks from the keyboard', () => {
  const { el, wave } = renderPlaying();
  fireEvent.keyDown(wave, { key: 'ArrowRight' });
  expect(el.currentTime).toBe(9);
  fireEvent.keyDown(wave, { key: 'Home' });
  expect(el.currentTime).toBe(0);
});
