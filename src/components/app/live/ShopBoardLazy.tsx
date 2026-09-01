/**
 * Shop board, loaded only when a post actually has one.
 * =====================================================
 *
 * `ShopBoard` renders nothing when a post has no listings and no affiliate
 * links, which is almost every post — but it is imported statically by four
 * feed cards, so its weight (and `live-checkout`'s, and `useStreamProducts`'s)
 * has been landing in the entry chunk for every visitor, board or no board.
 *
 * The test it makes that decision on is free: the counts ride the feed payload.
 * So make it here, before the module is reached, and let the real board arrive
 * on the network only for the posts that have something to show. Same props,
 * same "renders nothing when there is nothing" contract.
 *
 * There is no fallback on purpose. The board is a button below (or over) a
 * post; a skeleton in its place would push the layout around for a control
 * nobody is waiting on.
 */
import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type { ShopBoard as ShopBoardComponent } from './ShopBoard';

const ShopBoard = lazy(() => import('./ShopBoard').then((m) => ({ default: m.ShopBoard })));

type ShopBoardProps = ComponentProps<typeof ShopBoardComponent>;

export function ShopBoardLazy(props: ShopBoardProps) {
  const total = (props.links?.length ?? 0) + Math.max(0, props.listingCount ?? 0);
  if (total === 0) return null;

  return (
    <Suspense fallback={null}>
      <ShopBoard {...props} />
    </Suspense>
  );
}
