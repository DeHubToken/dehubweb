/**
 * The bell's search: what the notifications pill turns into when its search
 * button is tapped (phones). Like Home's feed search it grows out of the
 * button that opened it and covers the tab row (styles/feed-search.css):
 *
 *   [bell] [search box ...........] [x]
 *
 * It filters the rows already loaded, by who did it, what they said and the
 * post it was on.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import X from '@/components/ui/cut-icons/close';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

const CLOSE_MS = 220;

/** Where the search button sat on screen, so the box grows out of it. */
export type MeltFrom = { left: number; right: number } | null;

type Names = Map<string, { displayName?: string | null; username?: string | null }>;

/** Whether a row matches a lowercased query. */
export function notificationMatches(n: DeHubNotification, query: string, names?: Names): boolean {
  const known = n.actorAddress ? names?.get(n.actorAddress.toLowerCase()) : undefined;
  const text = [
    n.actor?.displayName,
    n.actor?.username,
    n.actorUsername,
    known?.displayName,
    known?.username,
    ...(n.latestActorNames ?? []),
    n.content,
    n.tokenTitle,
    n.commentPreview,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return text.includes(query);
}

export function NotificationSearchLine({
  value,
  from,
  placeholder,
  closeLabel,
  onChange,
  onClose,
}: {
  value: string;
  from: MeltFrom;
  placeholder: string;
  closeLabel: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [melt, setMelt] = useState<CSSProperties>({});
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !from) return;
    const b = bar.getBoundingClientRect();
    setMelt({
      '--melt-l': `${Math.max(0, from.left - b.left)}px`,
      '--melt-r': `${Math.max(0, b.right - from.right)}px`,
    } as CSSProperties);
  }, [from]);

  useEffect(() => {
    // Focus after the first frame so phones raise the keyboard for it.
    const id = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    inputRef.current?.blur();
    window.setTimeout(onClose, CLOSE_MS);
  };

  return (
    <div
      ref={barRef}
      data-feed-search-bar
      data-notification-search
      data-closing={closing ? '' : undefined}
      className="flex h-[40px] min-w-0 flex-1 items-center gap-1 pr-1"
      style={melt}
    >
      <input
        ref={inputRef}
        // Not type="search": every search input gets the boxed search-field
        // look (styles/search-fields.css), and here the pill is the box.
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Enter') inputRef.current?.blur();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-[29px] min-w-0 flex-1 bg-transparent px-1.5 text-[15px] text-white placeholder:text-zinc-500 outline-none"
      />
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="flex h-[29px] w-9 shrink-0 items-center justify-center rounded-[10px] text-zinc-400 [@media(hover:hover)]:hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
