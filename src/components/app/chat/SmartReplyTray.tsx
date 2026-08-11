import { X } from 'lucide-react';
import { ReplyOrb } from './ReplyOrb';
import type { SmartReplySuggestion } from '@/hooks/use-smart-replies';

interface SmartReplyTrayProps {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  suggestions: SmartReplySuggestion[];
  error: string | null;
  /** Tap the orb — first draft, then redraft. */
  onGenerate: () => void;
  /** Card tapped: the text goes into the composer, unsent. */
  onPick: (text: string) => void;
  onDismiss: () => void;
}

/**
 * Two drafted replies over the composer, with the orb straddling their bottom
 * edge — the same stack as the phone reference, flipped above the input
 * because neither an on-screen keyboard (native) nor a virtual one (mobile
 * web) will rent us the space below it.
 *
 * Cards carry white-alpha glass only. A `bg-zinc-*` or `bg-black` fill here
 * would be caught by the Osaka/Jungle `#app-root` slab nets, which carry an id
 * and outrank anything this file can declare — see the note on
 * [data-post-overlay-backdrop] in index.css.
 */
export function SmartReplyTray({
  status,
  suggestions,
  error,
  onGenerate,
  onPick,
  onDismiss,
}: SmartReplyTrayProps) {
  const busy = status === 'loading';

  return (
    <div className="px-3 pt-2 pb-1 border-t border-white/[0.07]">
      <div className="flex items-center justify-between px-0.5 pb-1.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          Suggested replies
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide suggested replies"
          className="p-0.5 -mr-0.5 text-zinc-500 hover:text-white transition-colors rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {status === 'error' || status === 'empty' ? (
        <div className="min-h-[56px] flex items-center justify-center text-center px-4">
          <p className="text-xs text-zinc-500">
            {status === 'empty'
              ? "Nothing to reply to yet — you sent the last message."
              : error || 'Could not draft replies'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(busy || suggestions.length === 0
            ? [null, null]
            : suggestions.slice(0, 2)
          ).map((s, i) => (
            <button
              key={s ? `${s.label}-${i}` : `skeleton-${i}`}
              type="button"
              disabled={!s}
              // Don't steal focus from the textarea — the composer keeps the
              // on-screen keyboard up while the user picks.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => s && onPick(s.text)}
              aria-label={s ? `${s.label}: ${s.text}` : 'Drafting a reply'}
              className={`group min-h-[92px] rounded-2xl border p-2.5 text-left flex flex-col justify-between transition-colors ${
                s
                  ? 'bg-white/[0.045] border-white/10 hover:bg-white/[0.09] hover:border-white/20'
                  : 'bg-white/[0.03] border-white/[0.07] cursor-default'
              }`}
            >
              {s ? (
                <>
                  <span className="self-start rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[10px] leading-4 text-zinc-300 group-hover:text-white transition-colors">
                    {s.label}
                  </span>
                  <span className="mt-2 text-[13px] leading-snug text-white line-clamp-3">
                    {s.text}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-4 w-20 rounded-full bg-white/[0.07] animate-pulse" />
                  <span className="mt-2 space-y-1.5">
                    <span className="block h-2.5 w-full rounded bg-white/[0.07] animate-pulse" />
                    <span className="block h-2.5 w-2/3 rounded bg-white/[0.07] animate-pulse" />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Orb hangs off the bottom edge of the card row, centred on the seam. */}
      <div className="flex justify-center -mt-4 relative z-10">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onGenerate}
          disabled={busy}
          aria-label={busy ? 'Drafting replies' : 'Draft new replies'}
          className="rounded-full p-1 transition-transform hover:scale-105 active:scale-95 disabled:hover:scale-100"
        >
          <ReplyOrb state={busy ? 'thinking' : 'idle'} size={44} />
        </button>
      </div>
    </div>
  );
}
