import { cloneElement, useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  dockRetainedPost, markRetainedPostIntent, openRetainedComments, registerRetainedPost,
  useRetainedPostPinned, type RetainedCommentsTab, type RetainedPostEntry,
} from '@/lib/retained-post-surface';

/** The feed owns this card for its whole lifetime, including while it is on the post page. */
export function RetainedPostSurface({ id, children, frameProps, leading }: {
  id: string; children: ReactElement; frameProps?: HTMLAttributes<HTMLDivElement>; leading?: ReactNode;
}) {
  const source = useRef<HTMLDivElement>(null);
  const entryRef = useRef<RetainedPostEntry | null>(null);
  const [container] = useState(() => {
    const element = document.createElement('div');
    element.dataset.retainedPostSurface = id;
    element.dataset.feedRoot = '';
    return element;
  });
  const pinned = useRetainedPostPinned(id);
  useLayoutEffect(() => {
    const slot = source.current;
    if (!slot) return;
    slot.appendChild(container);
    const entry: RetainedPostEntry = { id, container, source: slot, dock: null, restore: null };
    entryRef.current = entry;
    const unregister = registerRetainedPost(entry);
    return () => { entryRef.current = null; unregister(); container.remove(); };
  }, [id, container]);
  const openComments = useCallback((tab?: RetainedCommentsTab) => openRetainedComments(id, tab), [id]);
  const markIntent = useCallback(() => { if (entryRef.current) markRetainedPostIntent(entryRef.current); }, []);
  return <div ref={source} data-retained-post-source={id} onPointerDownCapture={markIntent} onClickCapture={markIntent}>
    {createPortal(<div {...frameProps}>
      {leading}
      {pinned ? cloneElement(children as ReactElement<{ onOpenComments?: typeof openComments }>, { onOpenComments: openComments }) : children}
    </div>, container)}
  </div>;
}

export function RetainedPostDock({ entry }: { entry: RetainedPostEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return dockRetainedPost(entry, ref.current);
  }, [entry]);
  return <div data-retained-post-dock={entry.id} ref={ref} />;
}
