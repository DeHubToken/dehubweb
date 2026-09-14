/**
 * Reduce an untrusted `?next=` value to a path that is definitely on our own
 * origin, falling back to /app when it isn't.
 *
 * Resolving against the real origin instead of pattern-matching the string is
 * the whole point. The obvious check — `next.startsWith("/") &&
 * !next.startsWith("//")` — lets `/\evil.com` straight through: it starts with
 * a single slash, so both tests pass, but browsers normalise backslashes to
 * forward slashes and navigate to the protocol-relative `//evil.com`, i.e.
 * off-site. react-router 6 has no fix for that (the open-redirect via
 * backslash in Link/useNavigate is patched only in v7), so the guard has to
 * live here.
 *
 * Handing the string to the URL parser delegates to the same normalisation the
 * browser will apply, which is what makes it cover the variants a string test
 * keeps missing — `//evil.com`, `/\evil.com`, `\\evil.com`, `https:/evil.com`,
 * and percent-encoded spellings of each.
 *
 * Lives here rather than in one page because every auth landing route has the
 * same problem: they all take a return path from a URL somebody else wrote.
 */
export function sameOriginPath(next: string | null | undefined): string {
  if (!next) return '/app';
  try {
    const resolved = new URL(next, window.location.origin);
    if (resolved.origin !== window.location.origin) return '/app';
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    // Unparseable even against a base — not something we should navigate to.
    return '/app';
  }
}
