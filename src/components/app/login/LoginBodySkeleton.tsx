/**
 * What the sheet holds in the beat before the sign-in options are ready:
 * nothing visible, just their space.
 *
 * It used to sketch the list as grey pulsing pills, which read as an old,
 * broken login screen flashing before the real one. Now it only reserves the
 * height of what replaces it, so the sheet does not change size: the full list
 * (five pills, the "or" divider, the wallet pill and the two-up row), or for
 * the email-first `stack` layout its email box, button and icon row.
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
