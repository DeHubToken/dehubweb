import { describe, expect, it, vi } from 'vitest';
import {
  emitCommentCreated,
  emitCommentsDeleted,
  reconcileCommentCount,
  subscribeToCommentCount,
} from '../comment-count-events';

describe('reconcileCommentCount', () => {
  it('does not add the server-confirmed comment twice', () => {
    expect(reconcileCommentCount(1, 1)).toBe(1);
  });

  it('accepts a newer server count without lowering an optimistic count', () => {
    expect(reconcileCommentCount(1, 2)).toBe(2);
    expect(reconcileCommentCount(2, 1)).toBe(2);
    expect(reconcileCommentCount(2, 1, 1)).toBe(2);
  });

  it('does not let a stale server count undo a delete', () => {
    expect(reconcileCommentCount(4, 5, -1)).toBe(4);
  });

  it('takes a server count that has already counted the delete', () => {
    expect(reconcileCommentCount(4, 4, -1)).toBe(4);
    expect(reconcileCommentCount(4, 3, -1)).toBe(3);
  });
});

describe('comment count events', () => {
  it('reports a post as +1 and a delete as minus every row it removed', () => {
    const onChange = vi.fn();
    const off = subscribeToCommentCount('7', onChange);

    emitCommentCreated('7');
    emitCommentsDeleted('7', 3);
    emitCommentsDeleted('7');
    off();

    expect(onChange.mock.calls.map(([delta]) => delta)).toEqual([1, -3, -1]);
  });

  it('ignores other posts and stops after unsubscribing', () => {
    const onChange = vi.fn();
    const off = subscribeToCommentCount('7', onChange);

    emitCommentCreated('8');
    off();
    emitCommentCreated('7');

    expect(onChange).not.toHaveBeenCalled();
  });
});
