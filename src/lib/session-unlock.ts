/**
 * Tell a wallet unlock apart from a sign-in.
 *
 * The same sheet serves both. At login it takes the password because the
 * signature it produces is what creates the session. Mid-session it takes the
 * password because a tip, a mint or going live needed a signature and the
 * vault had auto-locked — the session is already there, and the only thing
 * missing is a key on this device.
 *
 * Getting that backwards is what made an unlock announce "Welcome back!" over
 * a half-finished tip. It is also why this lives in its own file: the answer
 * has to be right for the add-profile flow, where somebody IS signed in and
 * the next wallet to unlock is deliberately a different account's.
 */
export interface MidSessionUnlockInput {
  /** What the login sheet was opened for. */
  intent: 'login' | 'add-profile';
  /** The address this browser is currently signed in as, if any. */
  sessionAddress: string | null;
  /** A DeHub session that is live right now — user, token, and not expired. */
  hasLiveSession: boolean;
  /** Owner EOA of the wallet row the unlocked key belongs to. */
  walletEoa: string | null;
  /** Safe smart account that EOA deploys to. */
  walletSafe: string | null;
}

export function isMidSessionUnlock({
  intent,
  sessionAddress,
  hasLiveSession,
  walletEoa,
  walletSafe,
}: MidSessionUnlockInput): boolean {
  // Adding a profile starts from a live session on purpose, and the wallet
  // being unlocked is the NEW account's. It has to sign in.
  if (intent === 'add-profile') return false;
  if (!hasLiveSession || !sessionAddress) return false;

  // A session signs as its Safe when Pimlico is up and as the owner EOA when
  // it is not, so either match is the same wallet. A key matching neither is
  // not this session's — a second account, or the drift the login path's
  // address guard exists to catch — and it goes the long way round.
  const session = sessionAddress.toLowerCase();
  return [walletEoa, walletSafe].some((address) => !!address && address.toLowerCase() === session);
}
