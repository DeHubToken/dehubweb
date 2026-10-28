/** The Remix menu, loaded when an options sheet opens rather than with every card. */
import { lazy, Suspense, type ComponentProps } from 'react';

const Menu = lazy(() => import('./RemixMenuItems').then((m) => ({ default: m.RemixMenuItems })));

export function RemixMenuItems(props: ComponentProps<typeof import('./RemixMenuItems').RemixMenuItems>) {
  return <Suspense fallback={null}><Menu {...props} /></Suspense>;
}
