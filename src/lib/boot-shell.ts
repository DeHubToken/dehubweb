/**
 * Boot shell hand-off.
 *
 * index.html paints a zero-JavaScript welcome card over the whole viewport at
 * parse time, because #root stays empty until the entry chunk plus the boot
 * batch has downloaded, parsed and executed. This is the other half: the call
 * that fades it out once the real panel is on screen.
 *
 * The removal logic itself lives in index.html, NOT here, deliberately. If it
 * lived in the bundle then a failed chunk, a stale deploy or a blocked script
 * would leave the shell covering a working app — a bricked page rather than a
 * slow one. index.html owns both the insert and the removal, plus a 12s
 * backstop timer; this module is a thin, guarded caller of it.
 */
declare global {
  interface Window {
    __dehubDismissBootShell?: () => void;
  }
}

/** Fade out and remove the boot shell. Safe to call when there isn't one. */
export function dismissBootShell(): void {
  try {
    window.__dehubDismissBootShell?.();
  } catch {
    /* the app must never fail because a splash refused to leave */
  }
}
