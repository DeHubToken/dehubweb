import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PostCommentsSplit } from '../PostCommentsSplit';

describe('PostCommentsSplit', () => {
  it('keeps touches, taps and keys from reaching the feed behind it', () => {
    const feed = {
      onTouchStart: vi.fn(), onTouchEnd: vi.fn(), onClick: vi.fn(), onKeyDown: vi.fn(), onPointerDown: vi.fn(),
    };
    const inside = vi.fn();
    const { getByTestId } = render(
      <div {...feed}>
        <PostCommentsSplit onClose={() => {}}>
          <button type="button" data-testid="inside" onClick={inside}>reply</button>
        </PostCommentsSplit>
      </div>,
    );
    const el = getByTestId('inside');
    fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 600 }] });
    fireEvent.touchEnd(el);
    fireEvent.pointerDown(el);
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(inside).toHaveBeenCalledTimes(1);
    for (const handler of Object.values(feed)) expect(handler).not.toHaveBeenCalled();
  });
});
