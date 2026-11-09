import { toast } from 'sonner';
import { X } from 'lucide-react';

interface UndoToastOptions {
  id: string;
  duration: number;
  undoLabel: string;
  closeLabel: string;
  onUndo: () => void;
}

/**
 * "Conversation deleted · Undo · ×" on one centred row, matching the app.
 *
 * The stock toast stacks its action under the text as a full-width pill, which
 * for a three-word message read as a heading, a slab and a stray X. One row in
 * the same glass card keeps it to the two things that matter.
 */
export function showUndoToast(message: string, { id, duration, undoLabel, closeLabel, onUndo }: UndoToastOptions) {
  return toast.custom(
    (toastId) => (
      <div
        data-undo-toast-card
        className="flex w-full items-center gap-2 py-2 pl-4 pr-2 text-white"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{message}</span>
        <button
          type="button"
          onClick={() => {
            onUndo();
            toast.dismiss(toastId);
          }}
          className="h-9 shrink-0 rounded-lg border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white transition-transform active:translate-y-px"
        >
          {undoLabel}
        </button>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={() => toast.dismiss(toastId)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ),
    {
      id,
      duration,
      unstyled: true,
      // The card is the toast element itself, so each theme's toast surface
      // (dark glass, the light themes' white card) paints it like any other.
      classNames: {
        toast: 'w-full rounded-xl border border-white/20 bg-zinc-950/70 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl',
      },
    },
  );
}
