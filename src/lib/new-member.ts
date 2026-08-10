/**
 * New Member Window
 * =================
 * Whether an account is recent enough to show the temporary "New" badge, so
 * existing members can spot a newcomer and welcome them.
 *
 * Deliberately a pure function of the account's creation date: the badge has to
 * appear and disappear on its own, with nothing to write when the window closes
 * and no job to run.
 */

/** How long an account counts as new. */
export const NEW_MEMBER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

interface NewMemberSource {
  createdAt?: string | null;
  created_at?: string | null;
}

/**
 * Days since the account was created, or null when there is no usable date.
 *
 * An unparseable or missing date returns null rather than 0 — treating "unknown"
 * as "brand new" would badge the entire existing user base the first time the
 * field goes missing from an API response.
 */
export function accountAgeInDays(
  account: NewMemberSource | null | undefined,
  now: number = Date.now(),
): number | null {
  const raw = account?.createdAt ?? account?.created_at;
  if (!raw) return null;

  const created = new Date(raw).getTime();
  if (Number.isNaN(created)) return null;

  // A clock-skewed future date is not evidence of a new account either way;
  // clamp to 0 so it reads as "joined just now" rather than negative.
  return Math.max(0, (now - created) / DAY_MS);
}

/** Whether the account joined inside the new-member window. */
export function isNewMember(
  account: NewMemberSource | null | undefined,
  now: number = Date.now(),
): boolean {
  const age = accountAgeInDays(account, now);
  return age !== null && age < NEW_MEMBER_DAYS;
}

/**
 * Short label for the badge tooltip, e.g. "Joined today" / "Joined 3 days ago".
 * Only meaningful while isNewMember() holds.
 */
export function newMemberLabel(
  account: NewMemberSource | null | undefined,
  now: number = Date.now(),
): string | null {
  const age = accountAgeInDays(account, now);
  if (age === null) return null;

  const days = Math.floor(age);
  if (days <= 0) return 'Joined today';
  if (days === 1) return 'Joined yesterday';
  return `Joined ${days} days ago`;
}
