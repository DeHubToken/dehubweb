/**
 * The reaction chips, loaded after first paint. Every feed card shows them,
 * but none needs them to paint, so they stay off the boot path.
 */
import { lazy, Suspense, type ComponentProps } from 'react';

const chips = () => import('./ReactionChips');
const ReactionOf = lazy(() => chips().then((m) => ({ default: m.ReactionOfChip })));
const Reactions = lazy(() => chips().then((m) => ({ default: m.ReactionsLink })));
const ReactingTo = lazy(() => chips().then((m) => ({ default: m.ReactingToChip })));

type Props<T extends keyof typeof import('./ReactionChips')> = ComponentProps<(typeof import('./ReactionChips'))[T]>;

export function ReactionOfChip(props: Props<'ReactionOfChip'>) {
  return <Suspense fallback={null}><ReactionOf {...props} /></Suspense>;
}

export function ReactionsLink(props: Props<'ReactionsLink'>) {
  return <Suspense fallback={null}><Reactions {...props} /></Suspense>;
}

export function ReactingToChip(props: Props<'ReactingToChip'>) {
  return <Suspense fallback={null}><ReactingTo {...props} /></Suspense>;
}
