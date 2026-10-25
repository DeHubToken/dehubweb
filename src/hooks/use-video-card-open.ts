import { useCallback, useLayoutEffect, type RefObject } from 'react';

interface VideoCardOpenOptions {
  mediaRef: RefObject<HTMLElement | null>;
  shorts: boolean;
  blocked: boolean;
  wasDismissed: () => boolean;
  openShorts: () => void;
  openPost: () => void;
}

/** Every primary card surface shares the same destination and drawer guards. */
export function useVideoCardOpen({ mediaRef, shorts, blocked, wasDismissed, openShorts, openPost }: VideoCardOpenOptions) {
  const open = useCallback(() => {
    if (blocked || wasDismissed()) return;
    if (shorts) openShorts();
    else openPost();
  }, [shorts, blocked, wasDismissed, openShorts, openPost]);

  useLayoutEffect(() => {
    if (!shorts) return;
    const bento = mediaRef.current?.closest<HTMLElement>('[data-feed-item]');
    if (!bento) return;
    const background = (event: MouseEvent) => {
      // Child captions own their handler; creator/menu/reaction controls own
      // theirs. Only this container's actual padding needs a second target.
      if (event.target !== bento || window.getSelection()?.toString()) return;
      open();
    };
    bento.addEventListener('click', background);
    return () => bento.removeEventListener('click', background);
  }, [mediaRef, shorts, open]);

  return open;
}
