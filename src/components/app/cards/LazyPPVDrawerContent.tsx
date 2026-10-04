import { lazy, Suspense, type ComponentProps } from 'react';
import type { PPVDrawerContent as Content } from './PPVDrawerContent';
const Body = lazy(() => import('./PPVDrawerContent').then(m => ({ default: m.PPVDrawerContent })));
export function PPVDrawerContent({ open, ...props }: ComponentProps<typeof Content> & { open: boolean }) {
  if (!open) return null;
  return <Suspense fallback={null}><Body {...props} /></Suspense>;
}
