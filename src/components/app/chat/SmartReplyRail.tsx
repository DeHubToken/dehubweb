import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { ReplyOrb } from './ReplyOrb';
import type { SmartReplySuggestion } from '@/hooks/use-smart-replies';

/**
 * Two drafted replies joined into one rail, with the orb seated in a circular
 * cut-out at their centre seam. The same rail on every surface — phone, tablet
 * and desktop — so the feature reads as one thing wherever it is met.
 *
 * GEOMETRY IS SHARED WITH MOBILE. dehub-mobile's components/DM/SmartReplyTray
 * is the React Native twin: same socket, same notch radius, same card rhythm.
 * Change one, change the other.
 *
 * Three sizes and nothing else. The cut-out, the hairline that traces it and
 * the orb that sits in it are all derived from these, because the last three
 * attempts at this rail each sized one of the three by hand and the socket
 * drifted off the orb every time.
 */
const ORB = 44;
/** Orb box plus its seating ring — the diameter of the cut-out. */
const SOCKET = 52;
/** Cut-out radius: the socket is a full circle centred on the rail's bottom
 *  edge, so only its top half is carved out of the cards. */
const NOTCH = SOCKET / 2;
/** Card padding under the text. Must clear the notch — the mask erases card
 *  CONTENT inside the arc, not just the fill, so text closer than this to the
 *  bottom edge is silently eaten at the seam. */
const CARD_PAD_BOTTOM = 'pb-7';

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
  // suggestion, and a lone card in a two-column rail leaves the cut-out under
  // its outer edge — which is precisely what "the orb isn't centred" looks
  // like on the devices where it happens.
  const slots: (SmartReplySuggestion | null)[] =
    status === 'ready' ? [suggestions[0] ?? null, suggestions[1] ?? null] : [null, null];

  // The rim wears whatever hairline the cards currently wear, so the socket
  // never reads brighter than the surface it is carved from.
  const rimClass = notice
    ? 'border-white/[0.05]'
    : busy
      ? 'border-white/[0.07]'
      : 'border-white/10';

  const notchVar = { '--smart-reply-notch': `${NOTCH}px` } as CSSProperties;

  return (
    <div className={className} role="group" aria-label="Suggested replies">
      <div className="relative">
        {notice ? (
          <div className="smart-reply-rail" style={notchVar}>
            <div
              className={`min-h-[108px] flex items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 pt-3 ${CARD_PAD_BOTTOM} text-center`}
            >
              <p className="text-xs leading-snug text-zinc-500">{notice}</p>
            </div>
          </div>
        ) : (
          <div className="smart-reply-rail grid grid-cols-2" style={notchVar}>
            {slots.map((s, i) => (
              <button
                key={s ? `${s.label}-${i}` : `slot-${i}`}
                type="button"
                disabled={!s}
                // Don't steal focus from the textarea — the composer keeps the
                // on-screen keyboard up while the user picks.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => s && onPick(s.text)}
                aria-label={s ? `${s.label}: ${s.text}` : 'Drafting a reply'}
                className={`group min-w-0 min-h-[108px] flex flex-col border p-3 ${CARD_PAD_BOTTOM} text-left transition-[background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset ${
                  i === 0 ? 'rounded-l-2xl pr-2.5' : '-ml-px rounded-r-2xl pl-2.5 pr-8'
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
                    <span className="mt-1.5 text-[13px] leading-[1.35] text-white line-clamp-3">
                      {s.text}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={`block h-2 w-16 rounded-full bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                    />
                    <span className="mt-3 block w-full space-y-1.5">
                      <span
                        className={`block h-2.5 w-full rounded bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                      />
                      <span
                        className={`block h-2.5 w-2/3 rounded bg-white/[0.07] ${busy ? 'animate-pulse' : ''}`}
                      />
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Hairline tracing the cut-out. The mask erases the cards' own border
            along the arc, so the rim is a separate element — and it is centred
            by the same full-width flex row as the orb below, never by its own
            percentage offset, so the two cannot land on different axes. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
        >
          <span
            className={`block rounded-t-full border border-b-0 ${rimClass}`}
            style={{ width: SOCKET, height: NOTCH }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onGenerate}
            disabled={busy}
            aria-label={busy ? 'Drafting replies' : 'Draft new replies'}
            title={busy ? undefined : 'Draft new replies'}
            className="pointer-events-auto flex items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:hover:scale-100"
            style={{ width: SOCKET, height: SOCKET }}
          >
            <ReplyOrb state={busy ? 'thinking' : 'idle'} size={ORB} />
          </button>
        </div>

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
