import { fireEvent, render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommentsPullDismiss } from '@/hooks/use-comments-pull-dismiss';

afterEach(cleanup);

function setup() {
  const close = vi.fn();
  function Drawer() {
    return <div {...useCommentsPullDismiss(close)}>
      <div data-testid="list"><p data-testid="comment">A comment</p></div>
      <textarea data-testid="reply" />
    </div>;
  }
  return { close, ...render(<Drawer />) };
}

function swipe(target: HTMLElement, dx: number, dy: number) {
  fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
}

describe('comments pull dismissal', () => {
  it('closes on a downward pull from the top of the comments', () => {
    const { close, getByTestId } = setup();
    swipe(getByTestId('comment'), 5, 100);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the drawer open when scrolling a thread back to the top', () => {
    const { close, getByTestId } = setup();
    const list = getByTestId('list');
    list.scrollTop = 150;
    fireEvent.touchStart(getByTestId('comment'), { touches: [{ clientX: 100, clientY: 100 }] });
    list.scrollTop = 0;
    fireEvent.touchEnd(getByTestId('comment'), { changedTouches: [{ clientX: 100, clientY: 300 }] });
    expect(close).not.toHaveBeenCalled();
  });

  it('ignores upward, horizontal and short gestures, and touches in the composer', () => {
    const { close, getByTestId } = setup();
    swipe(getByTestId('comment'), 0, -100);
    swipe(getByTestId('comment'), 150, 80);
    swipe(getByTestId('comment'), 0, 20);
    swipe(getByTestId('reply'), 0, 100);
    expect(close).not.toHaveBeenCalled();
  });

  it('does not close after a cancelled gesture', () => {
    const { close, getByTestId } = setup();
    const target = getByTestId('comment');
    fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchCancel(target);
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: 100, clientY: 300 }] });
    expect(close).not.toHaveBeenCalled();
  });
});
