import { lazy, Suspense, type ComponentProps } from 'react';
import type { ArticleFeedCover as Cover } from './ArticleFeedCover';
const Body = lazy(() => import('./ArticleFeedCover').then(m => ({ default: m.ArticleFeedCover })));
export function ArticleFeedCover(props: ComponentProps<typeof Cover>) {
  return <Suspense fallback={<div className="space-y-3"><p>{props.title}</p>{props.children}</div>}>
    <Body {...props} />
  </Suspense>;
}
