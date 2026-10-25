import { cloneElement, useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  dockRetainedPost, openRetainedComments, registerRetainedPost,
  useRetainedPostPinned, type RetainedCommentsTab, type RetainedPostEntry,
} from '@/lib/retained-post-surface';

/** The feed owns this card for its whole lifetime, including while it is on the post page. */
export function RetainedPostSurface({ id, children }: { id: string; children: ReactElement }) {
  const source = useRef<HTMLDivElement>(null);
  const [container] = useState(() => {
    const element = document.createElement('div');
    element.dataset.retainedPostSurface = id;
    return element;
  });
  const pinned = useRetainedPostPinned(id);
  useLayoutEffect(() => {
    const slot = source.current;
    if (!slot) return;
    slot.appendChild(container);
    const entry: RetainedPostEntry = { id, container, source: slot, dock: null, restore: null };
    const unregister = registerRetainedPost(entry);
    return () => { unregister(); container.remove(); };
  }, [id, container]);
  const openComments = useCallback((tab?: RetainedCommentsTab) => openRetainedComments(id, tab), [id]);
  return <div ref={source} data-retained-post-source={id}>
    {createPortal(pinned ? cloneElement(children as ReactElement<{ onOpenComments?: typeof openComments }>, { onOpenComments: openComments }) : children, container)}
  </div>;
}

export function RetainedPostDock({ entry }: { entry: RetainedPostEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return dockRetainedPost(entry, ref.current);
  }, [entry]);
  return <div data-retained-post-dock={entry.id} ref={ref} />;
}
