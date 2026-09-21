/**
 * What the sheet shows in the beat before the sign-in options are ready: the
 * shape of the list, not a spinner.
 *
 * Its job is to be the same height as the thing replacing it. The real list is
 * four to six full-width pills, an "or" divider, the wallet button and the
 * two-up Migrate / Import row — so this is five pills (the median), a divider,
 * a pill and a two-up row. The swap then changes what the rows say and never
 * how tall the sheet is.
 *
 * Lives in the entry bundle with the shell, not in the lazy body chunk: it has
 * to be on screen before that chunk arrives.
 */

const ROW = 'h-12 rounded-xl bg-white/[0.07] border border-white/10 animate-pulse';

export function LoginBodySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={ROW} />
        ))}
      </div>
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-white/10" />
        <div className="h-3 w-6 rounded bg-white/[0.07]" />
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="h-12 rounded-xl border border-white/10 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-12 rounded-xl border border-white/10 animate-pulse" />
        <div className="h-12 rounded-xl border border-white/10 animate-pulse" />
      </div>
    </div>
  );
}

export default LoginBodySkeleton;
