import { fireEvent, render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDrawerPullDismiss } from '@/hooks/use-drawer-pull-dismiss';

afterEach(cleanup);

function setup() {
  const close = vi.fn();
  function Sheet() {
    const ref = useDrawerPullDismiss<HTMLDivElement>(close);
    return (
      <div data-vaul-drawer="" data-testid="sheet">
        <div ref={ref}>
          <h2 data-testid="title">Who's here</h2>
          <div data-testid="list"><button type="button" data-testid="row">Someone</button></div>
        </div>
      </div>
    );
  }
  return { close, ...render(<Sheet />) };
}

function drag(target: HTMLElement, steps: Array<[number, number]>) {
  fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 100 }] });
  for (const [dx, dy] of steps) {
    fireEvent.touchMove(target, { touches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
  }
  fireEvent.touchEnd(target, { changedTouches: [] });
}

describe('drawer pull dismissal', () => {
  it('follows the finger and closes on a long pull from the top of the list', () => {
    const { close, getByTestId } = setup();
    const sheet = getByTestId('sheet');
    fireEvent.touchStart(getByTestId('row'), { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(getByTestId('row'), { touches: [{ clientX: 100, clientY: 160 }] });
    expect(sheet.style.transform).toBe('translate3d(0, 60px, 0)');
    fireEvent.touchMove(getByTestId('row'), { touches: [{ clientX: 100, clientY: 230 }] });
    fireEvent.touchEnd(getByTestId('row'), { changedTouches: [] });
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes from the title too', () => {
    const { close, getByTestId } = setup();
    drag(getByTestId('title'), [[0, 60], [0, 160]]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('springs back on a short pull', () => {
    const { close, getByTestId } = setup();
    drag(getByTestId('row'), [[0, 8], [0, 14], [0, 20]]);
    expect(close).not.toHaveBeenCalled();
    expect(getByTestId('sheet').style.transform).toBe('translate3d(0, 0, 0)');
  });

  it('leaves a scrolled list, an upward swipe and a sideways swipe alone', () => {
    const { close, getByTestId } = setup();
    const list = getByTestId('list');
    list.scrollTop = 120;
    drag(getByTestId('row'), [[0, 60], [0, 200]]);
    list.scrollTop = 0;
    drag(getByTestId('row'), [[0, -20], [0, 200]]);
    drag(getByTestId('row'), [[80, 10], [120, 200]]);
    expect(close).not.toHaveBeenCalled();
    expect(getByTestId('sheet').style.transform).toBe('');
  });
});
