/**
 * The quote composer, fetched the first time somebody opens it.
 * =============================================================
 *
 * Every post, image and video card mounts a `QuotePostModal` with `open` false,
 * so the composer and its embed rendering sat on the boot path for every
 * visitor. Same approach as `ShopSheetLazy`: mount nothing until `open` first
 * goes true, then keep it mounted so the close animation and the draft survive.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { QuotePostModal as QuotePostModalComponent } from './QuotePostModal';

const QuotePostModal = lazy(() =>
  import('./QuotePostModal').then((m) => ({ default: m.QuotePostModal })),
);

type QuotePostModalProps = ComponentProps<typeof QuotePostModalComponent>;

export function QuotePostModalLazy(props: QuotePostModalProps) {
  const [everOpened, setEverOpened] = useState(props.open);
  useEffect(() => {
    if (props.open) setEverOpened(true);
  }, [props.open]);

  if (!everOpened) return null;

  return (
    <Suspense fallback={null}>
      <QuotePostModal {...props} />
    </Suspense>
  );
}
