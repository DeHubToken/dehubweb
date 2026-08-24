import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { ReplyOrb } from './ReplyOrb';
import type { SmartReplySuggestion } from '@/hooks/use-smart-replies';

/**
 * Two drafted replies, one per line, with the orb centred in the gap between
 * them. The same rail on every surface — phone, tablet and desktop — so the
 * feature reads as one thing wherever it is met.
 *
 * GEOMETRY IS SHARED WITH MOBILE. dehub-mobile's components/DM/SmartReplyTray
 * is the React Native twin: same socket, same notch, same gap. Change one,
 * change the other.
 *
 * Four numbers and nothing else. Every attempt at this rail that sized the
 * cut-out, the ring and the orb separately ended up with the ring off the orb
 * or the orb off the hole.
 */
const ORB = 44;
/** The orb's own box: a hairline circle that IS the socket ring, so the ring
 *  cannot drift off the orb — it is the same element. */
const SOCKET = 48;
/** Cut-out radius. The mask circle is centred on the GAP between the two
 *  cards, so each card is bitten NOTCH - GAP/2 deep at the edge facing the
 *  orb, and the orb nests in a hole formed by both halves. */
const NOTCH = SOCKET / 2;
/** Space between the stacked cards. Wide enough that the bite is shallower
 *  than the cards' own padding, so no text is ever eaten by the arc. */
const GAP = 28;

export type SmartReplyRailStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface SmartReplyRailProps {
  status: SmartReplyRailStatus;
  suggestions: SmartReplySuggestion[];
  error: string | null;
  /** Tap the orb — first draft, then redraft. */
  onGenerate: () => void;
  /** Card tapped: the text goes into the composer, unsent. */
  onPick: (text: string) => void;
  onDismiss: () => void;
  /** Padding and dividers around the rail. The only thing that differs
   *  between the band above the composer and the strip below it. */
  className?: string;
}

export function SmartReplyRail({
  status,
  suggestions,
  error,
  onGenerate,
  onPick,
  onDismiss,
  className = '',
}: SmartReplyRailProps) {
  // 'idle' is unresolved, not empty: the call is on its way, so it reads as
  // loading rather than as a rail with nothing in it.
  const busy = status === 'loading' || status === 'idle';

  // A failed draft keeps the rail — muted, one line of copy, orb live to press
  // again. A dead band and a working one must never be confusable.
  const notice =
    status === 'empty'
      ? 'Nothing to draft from yet — send a message to get started.'
      : status === 'error'
        ? error || 'Could not draft replies'
        : null;

  // Always exactly two slots. The drafter can come back with one usable
  // suggestion, and a single card would leave the orb centred on nothing.
  const slots: (SmartReplySuggestion | null)[] =
    status === 'ready' ? [suggestions[0] ?? null, suggestions[1] ?? null] : [null, null];

  // The socket ring wears whatever hairline the cards currently wear, so it
  // never reads brighter than the surface it is carved from.
  const rimClass = notice
    ? 'border-white/[0.05]'
    : busy
      ? 'border-white/[0.07]'
      : 'border-white/10';

  const notchVars = {
    '--smart-reply-notch': `${NOTCH}px`,
    '--smart-reply-gap': `${GAP / 2}px`,
  } as CSSProperties;

  // Its border is the socket ring. Scaling on hover would lift the ring out of
  // the hole it traces, so hover lightens the hairline instead.
  const orbButton = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onGenerate}
      disabled={busy}
      aria-label={busy ? 'Drafting replies' : 'Draft new replies'}
      title={busy ? undefined : 'Draft new replies'}
      className={`pointer-events-auto flex shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${rimClass} ${
        busy ? '' : 'hover:border-white/25'
      }`}
      style={{ width: SOCKET, height: SOCKET }}
    >
      <ReplyOrb state={busy ? 'thinking' : 'idle'} size={ORB} />
    </button>
  );

  return (
    <div className={className} role="group" aria-label="Suggested replies">
      <div className="relative">
        {notice ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="px-8 text-center text-xs leading-snug text-zinc-500">{notice}</p>
            {orbButton}
          </div>
        ) : (
          <>
            {/* grid-rows-2 rather than a flex column: 1fr rows are EQUAL, so
                the container's centre is the gap's centre, which is what the
                orb below centres itself on. With auto heights a longer first
                suggestion would slide the orb off the seam. */}
            <div className="grid grid-rows-2" style={{ gap: GAP }}>
              {slots.map((s, i) => (
                <button
                  key={s ? `${s.label}-${i}` : `slot-${i}`}
                  type="button"
                  disabled={!s}
                  // Don't steal focus from the textarea — the composer keeps
                  // the on-screen keyboard up while the user picks.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => s && onPick(s.text)}
                  aria-label={s ? `${s.label}: ${s.text}` : 'Drafting a reply'}
                  style={notchVars}
                  className={`group flex min-h-[76px] min-w-0 flex-col justify-center rounded-2xl border px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset ${
                    i === 0 ? 'smart-reply-notch-b pr-9' : 'smart-reply-notch-t'
                  } ${
                    s
                      ? 'bg-white/[0.045] border-white/10 hover:bg-white/[0.085] hover:border-white/20 active:bg-white/[0.11] cursor-pointer'
                      : busy
                        ? 'bg-white/[0.03] border-white/[0.07] cursor-default'
                        : 'bg-transparent border-white/[0.05] cursor-default'
                  }`}
                >
                  {s ? (
                    <>
                      <span className="text-[9px] uppercase tracking-[0.1em] leading-4 text-zinc-500 transition-colors group-hover:text-zinc-300">
                        {s.label}
                      </span>
                      <span className="mt-1 text-[13px] leading-[1.35] text-white line-clamp-2">
                        {s.text}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`block h-2 w-16 rounded-full bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                      />
                      <span className="mt-2.5 block w-full space-y-1.5">
                        <span
                          className={`block h-2.5 w-full rounded bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                        />
                        <span
                          className={`block h-2.5 w-1/2 rounded bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                        />
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* Centred on both axes by one full-size flex row — no percentage
                offsets anywhere in the path, on either platform. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {orbButton}
            </div>
          </>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDismiss}
          aria-label="Hide suggested replies"
          className="absolute right-1 top-1 rounded-full p-1.5 text-zinc-600 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
