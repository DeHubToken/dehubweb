import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canOpenQuickActions, installQuickActions } from '@/lib/quick-actions';
import { describePageBug, pageBugContext, enrichPageBugContext } from '@/lib/page-bug-report';

let cleanup: (() => void) | undefined;
let surface: HTMLDivElement;
function pointer(type: string, target: Element = surface, overrides = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: 20, ...overrides });
  target.dispatchEvent(event);
  return event;
}
beforeEach(() => { vi.useFakeTimers(); surface = document.createElement('div'); document.body.append(surface); });
afterEach(() => { cleanup?.(); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('page hold gesture', () => {
  it('opens once after a hold and consumes the release click', () => {
    const open = vi.fn(); cleanup = installQuickActions(open, () => true);
    const tap = vi.fn(); surface.addEventListener('click', tap);
    pointer('pointerdown'); vi.advanceTimersByTime(650);
    expect(open).toHaveBeenCalledTimes(1);
    expect(pointer('pointerup').defaultPrevented).toBe(true);
    surface.click(); expect(tap).not.toHaveBeenCalled();
  });
  it('keeps short taps, ordinary buttons, and reserved reaction controls distinct', () => {
    const open = vi.fn(); cleanup = installQuickActions(open, () => true);
    pointer('pointerdown'); pointer('pointerup'); vi.advanceTimersByTime(700);
    expect(open).not.toHaveBeenCalled();
    surface.innerHTML = '<button>Action</button><button data-no-quick-actions><span>Reaction</span></button><input /><div contenteditable="true">Draft</div>';
    expect(canOpenQuickActions(surface.querySelector('button'))).toBe(true);
    for (const selector of ['span', 'input', '[contenteditable]']) {
      const target = surface.querySelector(selector)!;
      expect(canOpenQuickActions(target)).toBe(false);
      pointer('pointerdown', target); vi.advanceTimersByTime(700);
    }
    expect(open).not.toHaveBeenCalled();
  });
  it.each(['move', 'scroll', 'cancel', 'blur', 'multitouch', 'unmount'])('cancels on %s', reason => {
    const open = vi.fn(); cleanup = installQuickActions(open, () => true);
    pointer('pointerdown');
    if (reason === 'move') pointer('pointermove', surface, { clientX: 31 });
    if (reason === 'scroll') surface.dispatchEvent(new Event('scroll'));
    if (reason === 'cancel') pointer('pointercancel');
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    if (reason === 'multitouch') pointer('pointerdown', surface, { pointerId: 2, isPrimary: false });
    if (reason === 'unmount') cleanup();
    vi.advanceTimersByTime(800); expect(open).not.toHaveBeenCalled();
  });
});

describe('report context', () => {
  it('omits query and fragment secrets while retaining the original page', async () => {
    window.history.replaceState({}, '', '/app/home?token=secret#private');
    const context = pageBugContext();
    window.history.replaceState({}, '', '/app/features');
    const description = describePageBug('Video is stuck', await enrichPageBugContext(context));
    expect(description).toContain('/app/home');
    expect(description).toContain('Video is stuck');
    expect(description).not.toMatch(/secret|private|features/);
    expect(description).toContain('Model:');
  });
});
