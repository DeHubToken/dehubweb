import { cloneElement, useCallback, useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import {
  dockRetainedPost, getRetainedPost, markRetainedPostIntent, openRetainedComments, registerRetainedPost, RetainedPostActivityContext,
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
  const pageActive = useContext(CachedPageActiveContext);
  const retainedId = useContext(RetainedPostActivityContext);
  const selected = retainedId === id && getRetainedPost(id) === entryRef.current;
  const pinnedHere = pinned && getRetainedPost(id) === entryRef.current && !!entryRef.current?.dock;
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
    {createPortal(<CachedPageActiveContext.Provider value={pageActive || selected || pinnedHere}><div {...frameProps}>
      {leading}
      {pinnedHere ? cloneElement(children as ReactElement<{ onOpenComments?: typeof openComments }>, { onOpenComments: openComments }) : children}
    </div></CachedPageActiveContext.Provider>, container)}
  </div>;
}

export function RetainedPostDock({ entry }: { entry: RetainedPostEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return dockRetainedPost(entry, ref.current);
  }, [entry]);
  return <div data-retained-post-dock={entry.id} ref={ref} />;
}
