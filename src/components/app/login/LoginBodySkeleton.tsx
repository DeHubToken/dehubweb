/**
 * What the sheet holds in the beat before the sign-in options are ready.
 *
 * The email-first `stack` layout gets a skeleton drawn to the real form's
 * measured shapes (email box, button, "or continue with" line, the row of
 * option discs), pulsing on the shared beat from ui/skeleton, so the sheet
 * reads as already there and the real form lands on top without anything
 * moving. Total height matches the form (250px), so nothing below jumps.
 *
 * The long list layout only reserves its height; it shows on secondary steps
 * where a sketch would be the wrong shape anyway.
 *
 * Lives in the entry bundle with the shell, not in the lazy body chunk: it has
 * to be on screen before that chunk arrives.
 */
import { Skeleton } from '@/components/ui/skeleton';

const ROW = 'h-12';

function StackSkeleton() {
  return (
    <div className="h-[250px] pt-2.5" aria-hidden data-login-placeholder>
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="mt-2.5 h-14 rounded-2xl" />
      <div className="mt-4 flex h-4 items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <Skeleton className="h-2.5 w-20 rounded-full" />
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="mt-4 flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <Skeleton className="size-12 rounded-2xl" />
            <Skeleton className="h-2.5 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginBodySkeleton({ layout }: { layout?: 'stack' } = {}) {
  if (layout === 'stack') return <StackSkeleton />;
  return (
    <div className="space-y-4 invisible" aria-hidden data-login-placeholder>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={ROW} />
        ))}
      </div>
      <div className="h-7" />
      <div className={ROW} />
      <div className={ROW} />
    </div>
  );
}

export default LoginBodySkeleton;
