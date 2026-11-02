import { describe, it, expect } from 'vitest';
import { rankBuilders, periodStart, type BuilderRequestRow, type BuilderCommentRow } from './top-builders';

const req = (id: string, wallet: string, username: string, status: string, votes: number, created: string, updated = created): BuilderRequestRow => ({
  id, author_wallet_address: wallet, author_username: username, author_avatar: null,
  status, vote_count: votes, created_at: created, updated_at: updated,
});

describe('rankBuilders', () => {
  it('scores ships, upvotes and comments on other people\'s requests', () => {
    const requests = [
      req('1', '0xa', 'ann', 'shipped', 3, '2026-10-02T00:00:00Z'),
      req('2', '0xb', 'bob', 'open', 1, '2026-10-03T00:00:00Z'),
    ];
    const comments: BuilderCommentRow[] = [
      { wallet_address: '0xB', username: 'bob', feature_request_id: '1', created_at: '2026-10-04T00:00:00Z' },
      { wallet_address: '0xa', username: 'ann', feature_request_id: '1', created_at: '2026-10-04T00:00:00Z' }, // own request: no points
    ];
    const [ann, bob] = rankBuilders(requests, comments, 0);
    expect(ann).toMatchObject({ username: 'ann', shipped: 1, votes: 3, comments: 0, points: 13 });
    expect(bob).toMatchObject({ username: 'bob', shipped: 0, votes: 1, comments: 1, points: 3 });
  });

  it('leaves team accounts out and caps comment points', () => {
    const requests = [req('1', '0x9324840523a5d17dd12a2f11a9472e5a199c1937', 'maldoteth', 'shipped', 50, '2026-10-01T00:00:00Z')];
    const comments = Array.from({ length: 30 }, () => ({ wallet_address: '0xc', username: 'cat', feature_request_id: '1', created_at: '2026-10-05T00:00:00Z' }));
    const out = rankBuilders(requests, comments, 0);
    expect(out.map((b) => b.username)).toEqual(['cat']);
    expect(out[0].commentPoints).toBe(40);
  });

  it('this month counts ships by ship day', () => {
    const since = periodStart('month', new Date('2026-11-15T12:00:00'));
    const requests = [req('1', '0xa', 'ann', 'shipped', 0, '2026-09-01T00:00:00Z', '2026-11-03T00:00:00Z')];
    expect(rankBuilders(requests, [], since)[0].points).toBe(10);
    expect(rankBuilders(requests, [], periodStart('month', new Date('2026-12-15T12:00:00')))).toEqual([]);
  });
});
