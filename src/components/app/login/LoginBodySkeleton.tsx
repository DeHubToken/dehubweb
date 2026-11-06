/**
 * What the sheet holds in the beat before the sign-in options are ready.
 *
 * Nothing visible, only the space of what replaces it, so the sheet does not
 * change size. A pulsing sketch of the form was tried (Nov 2026) and dropped:
 * on a first open it showed without the headline and clips around it, so it
 * never looked like the sheet people then saw.
 *
 * Lives in the entry bundle with the shell, not in the lazy body chunk: it has
 * to be on screen before that chunk arrives.
 */

const ROW = 'h-12';

export function LoginBodySkeleton({ layout }: { layout?: 'stack' } = {}) {
  if (layout === 'stack') return <div className="h-[250px]" aria-hidden data-login-placeholder />;
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
