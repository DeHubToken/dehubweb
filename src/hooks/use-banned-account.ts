/**
 * Is the signed-in account banned?
 * ================================
 * A DeHub ban is read-only, not locked-out. The account keeps its sign-in, its
 * feed, its conversations, its notifications and everything else it can see,
 * until the person asks for the account to be deleted. What it loses is
 * writing: posting, commenting, reacting, following, messaging.
 *
 * The API enforces that on its own — every write answers `403` with
 * `code: 'ACCOUNT_BANNED'` — so this hook exists for the other half: saying so
 * before somebody types a post that was never going to send.
 *
 * `isBanned` arrives on the login response and again on `/account_info`, so it
 * survives a reload. A ban applied mid-session shows up on the next profile
 * refresh; until then the refusal itself carries the explanation.
 *
 * @module hooks/use-banned-account
 */
import { useAuth } from '@/contexts/AuthContext';

export interface BannedAccountState {
  /** The signed-in account is banned. False while signed out. */
  isBanned: boolean;
  /** The moderator's reason, when one was given. */
  bannedReason: string | null;
}

export function useBannedAccount(): BannedAccountState {
  const { user } = useAuth();
  return {
    isBanned: Boolean(user?.isBanned),
    bannedReason: user?.bannedReason || null,
  };
}

/** True when an API error was a refusal because the account is banned. */
export function isAccountBannedError(error: unknown): boolean {
  const e = error as { errorCode?: string } | null | undefined;
  return e?.errorCode === 'ACCOUNT_BANNED';
}
