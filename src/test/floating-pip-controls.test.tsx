import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FloatingPiPPlayer } from '../components/app/tv/FloatingPiPPlayer';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } } }));
vi.mock('../lib/media-session', () => ({
  claimMediaSession: vi.fn(), releaseMediaSession: vi.fn(), setMediaSessionPlaying: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
});
afterEach(cleanup);

function player() {
  const close = vi.fn();
  const ui = render(<FloatingPiPPlayer channel={{ id: 'tv', name: 'TV', streamUrl: '/live.m3u8' }} index={0} onClose={close} />);
  const root = ui.container.firstElementChild as HTMLDivElement;
  const handle = root.querySelector('[data-pip-drag-handle]') as HTMLDivElement;
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  handle.releasePointerCapture = vi.fn();
  return { close, root, handle };
}

function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(target, event);
}

it('captures the handle even when touching its icon and keeps close reachable at the bottom', () => {
  const { root, handle, close } = player();
  pointer(handle.querySelector('svg')!, 'pointerdown', 100, 20);
  expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
  expect(handle.style.touchAction).toBe('none');
  pointer(handle, 'pointermove', 390, 1000);
  expect(parseFloat(root.style.top) + parseFloat(root.style.height)).toBeLessThanOrEqual(844);
  pointer(handle, 'pointercancel', 390, 1000);
  const top = root.style.top;
  pointer(handle, 'pointermove', 0, 0);
  expect(root.style.top).toBe(top);
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(close).toHaveBeenCalledWith('tv');
});

it('resizes and clamps the complete player when the phone rotates', () => {
  const { root, close } = player();
  expect(parseFloat(root.style.width)).toBe(280);
  fireEvent.click(screen.getByRole('button', { name: 'calls.expand' }));
  expect(parseFloat(root.style.width)).toBe(366);
  expect(close).not.toHaveBeenCalled();
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
    window.dispatchEvent(new Event('resize'));
  });
  expect(parseFloat(root.style.left) + parseFloat(root.style.width)).toBeLessThanOrEqual(300);
  expect(parseFloat(root.style.top) + parseFloat(root.style.height)).toBeLessThanOrEqual(220);
  fireEvent.click(screen.getByRole('button', { name: 'calls.minimize' }));
  expect(screen.getByRole('button', { name: 'calls.expand' })).toBeInTheDocument();
});
