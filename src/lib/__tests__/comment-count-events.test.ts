import { describe, expect, it } from 'vitest';
import { reconcileCommentCount } from '../comment-count-events';

describe('reconcileCommentCount', () => {
  it('does not add the server-confirmed comment twice', () => {
    expect(reconcileCommentCount(1, 1)).toBe(1);
  });

  it('accepts a newer server count without lowering an optimistic count', () => {
    expect(reconcileCommentCount(1, 2)).toBe(2);
    expect(reconcileCommentCount(2, 1)).toBe(2);
  });
});
