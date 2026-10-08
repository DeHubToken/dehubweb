import { lazy, Suspense } from 'react';
import type { RichPreview } from '@/lib/rich-links';

const Card = lazy(() => import('./RichLinkCard').then(module => ({ default: module.RichLinkCard })));
export function RichLinkCard(props: { preview: RichPreview; onRemove?: () => void }) {
  return <Suspense fallback={<a className="block p-3 text-sm text-white/70" href={props.preview.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{props.preview.siteName}</a>}><Card {...props} /></Suspense>;
}
