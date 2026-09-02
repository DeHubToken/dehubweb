/**
 * The shop sheet, fetched the first time somebody opens it.
 * ========================================================
 *
 * `ShopSheet` is a drawer for picking listings and affiliate links while
 * composing or editing a post. It is mounted unconditionally by both of its
 * callers, because vaul needs the element present to animate the open — so its
 * weight, and `useMyListings`'s behind it, has been landing in the boot path
 * for every visitor whether or not they ever compose a post, let alone attach
 * a shop board to one.
 *
 * `open` already says whether anyone is looking at it. Mounting nothing until
 * that first goes true keeps the module off the entry graph, and keeping it
 * mounted afterwards leaves the close animation and the sheet's own state
 * exactly as they were.
 *
 * No fallback, deliberately. The sheet animates in from the bottom over the
 * composer; a skeleton sliding up first would be worse than the extra frame.
 *
 * Same idea as `ShopBoardLazy`, one surface further up.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { ShopSheet as ShopSheetComponent } from './ShopSheet';

export type { ShopBoardDraft } from './ShopSheet';

const ShopSheet = lazy(() => import('./ShopSheet').then((m) => ({ default: m.ShopSheet })));

type ShopSheetProps = ComponentProps<typeof ShopSheetComponent>;

export function ShopSheetLazy(props: ShopSheetProps) {
  // Once, not per open: unmounting on close would re-fetch the chunk and throw
  // away the picker's state every time somebody glanced at it.
  const [everOpened, setEverOpened] = useState(props.open);
  useEffect(() => {
    if (props.open) setEverOpened(true);
  }, [props.open]);

  if (!everOpened) return null;

  return (
    <Suspense fallback={null}>
      <ShopSheet {...props} />
    </Suspense>
  );
}
