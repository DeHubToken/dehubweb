import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFirstTap } from '@/lib/first-tap';

function pointer(type: string, target: EventTarget, x = 10, y = 10, pointerType = 'touch') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }) as PointerEvent;
  Object.defineProperties(event, { pointerType: { value: pointerType }, pointerId: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}

describe('first-tap', () => {
  let now = 1000;
  let root: HTMLDivElement;
  let back: HTMLButtonElement;
  let pressed: ReturnType<typeof vi.fn<(event: Event) => void>>;
  let uninstall: () => void;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    root = document.createElement('div');
    back = document.createElement('button');
    back.innerHTML = '<svg><path></path></svg>';
    root.appendChild(back);
    document.body.appendChild(root);
    pressed = vi.fn<(event: Event) => void>();
    back.addEventListener('click', pressed);
    uninstall = installFirstTap(root);
  });

  afterEach(() => {
    uninstall();
    root.remove();
    vi.restoreAllMocks();
  });

  it('presses on lift when the browser sends no click (tap right after a flick)', () => {
    const icon = back.querySelector('path')!;
    pointer('pointerdown', icon);
    now += 60;
    pointer('pointerup', icon);
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('drops the browser click that follows, so nothing fires twice', () => {
    pointer('pointerdown', back);
    now += 60;
    pointer('pointerup', back);
    now += 10;
    const late = new MouseEvent('click', { bubbles: true, cancelable: true });
    back.dispatchEvent(late);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(late.defaultPrevented).toBe(true);
  });

  it('leaves drags, holds and mouse clicks alone', () => {
    pointer('pointerdown', back, 10, 10);
    pointer('pointermove', back, 10, 40);
    pointer('pointerup', back, 10, 40);
    pointer('pointerdown', back);
    now += 700;
    pointer('pointerup', back);
    pointer('pointerdown', back, 10, 10, 'mouse');
    pointer('pointerup', back, 10, 10, 'mouse');
    expect(pressed).not.toHaveBeenCalled();
  });

  it('ignores disabled buttons', () => {
    back.disabled = true;
    pointer('pointerdown', back);
    pointer('pointerup', back);
    expect(pressed).not.toHaveBeenCalled();
  });
});
