import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeableRow } from './swipeable-row';

describe('swipe actions on transparent theme rows', () => {
  it('keeps closed actions inaccessible, then reveals and closes them with the row', () => {
    const block = vi.fn();
    const { container } = render(<SwipeableRow actions={[
      { key: 'block', label: 'Block', icon: null, onSelect: block },
      { key: 'delete', label: 'Delete', icon: null, onSelect: vi.fn(), destructive: true },
    ]}><button>Conversation</button></SwipeableRow>);
    const panel = container.querySelector('[data-swipe-actions]')!;
    const action = panel.querySelector('button')!;
    const track = panel.parentElement!;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(action.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
    expect(panel.previousElementSibling?.textContent).toBe('Conversation');

    fireEvent.touchStart(track, { touches: [{ clientX: 250, clientY: 40 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 110, clientY: 40 }] });
    fireEvent.touchEnd(track);
    expect(track.style.transform).toBe('translate3d(-152px, 0, 0)');
    expect(action.disabled).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    expect(block).toHaveBeenCalledTimes(1);
    expect(track.style.transform).toBe('translate3d(0px, 0, 0)');
    expect(action.disabled).toBe(true);
  });
});
