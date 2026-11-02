/** Which reveal the next paid unlock plays: they take turns so each one feels fresh. */
export type UnlockRevealKind = 'coin' | 'confetti' | 'foil';
const ORDER: UnlockRevealKind[] = ['coin', 'confetti', 'foil'];
const KEY = 'dehub.unlockReveal.n';

export function nextUnlockRevealKind(): UnlockRevealKind {
  let n = 0;
  try { n = Number(localStorage.getItem(KEY)) || 0; } catch { /* private mode */ }
  try { localStorage.setItem(KEY, String(n + 1)); } catch { /* private mode */ }
  return ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length];
}

