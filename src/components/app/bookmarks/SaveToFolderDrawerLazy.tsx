/**
 * The save-to-folder drawer, fetched the first time somebody opens it.
 * ===================================================================
 *
 * `PostUtilityButtons` mounts one per card with `open` false, which kept the
 * drawer and its folder queries on the boot path. Same approach as
 * `ShopSheetLazy`: mount nothing until `open` first goes true, then keep it
 * mounted so vaul's close animation is unchanged.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { SaveToFolderDrawer as SaveToFolderDrawerComponent } from './SaveToFolderDrawer';

const SaveToFolderDrawer = lazy(() =>
  import('./SaveToFolderDrawer').then((m) => ({ default: m.SaveToFolderDrawer })),
);

type SaveToFolderDrawerProps = ComponentProps<typeof SaveToFolderDrawerComponent>;

export function SaveToFolderDrawerLazy(props: SaveToFolderDrawerProps) {
  const [everOpened, setEverOpened] = useState(props.open);
  useEffect(() => {
    if (props.open) setEverOpened(true);
  }, [props.open]);

  if (!everOpened) return null;

  return (
    <Suspense fallback={null}>
      <SaveToFolderDrawer {...props} />
    </Suspense>
  );
}
