import type { LegacyAccountMatch } from './legacy-detect';

const PROVIDER_ALIASES: Record<string, string[]> = {
  email: ['email', 'email_passwordless'],
  email_passwordless: ['email', 'email_passwordless'],
  sms: ['sms', 'sms_passwordless', 'phone'],
  sms_passwordless: ['sms', 'sms_passwordless', 'phone'],
  phone: ['sms', 'sms_passwordless', 'phone'],
};

function normalized(value?: string | null): string | null {
  const result = value?.trim().toLowerCase();
  return result || null;
}

export function legacyAccountsForProvider(
  accounts: LegacyAccountMatch[],
  provider: string,
): LegacyAccountMatch[] {
  const wanted = PROVIDER_ALIASES[normalized(provider) ?? ''] ?? [normalized(provider) ?? ''];
  return accounts.filter((account) => {
    const method = normalized(account.signupMethod);
    return !!method && wanted.includes(method);
  });
}

export function legacyAccountForWallet(
  accounts: LegacyAccountMatch[],
  ownerAddress: string,
  safeAddress: string | null,
): LegacyAccountMatch | undefined {
  const possibleAddresses = new Set(
    [ownerAddress, safeAddress]
      .filter((address): address is string => !!address)
      .map((address) => address.toLowerCase()),
  );
  const matches = accounts.filter((account) =>
    possibleAddresses.has(account.ethAddress.toLowerCase()),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Connect a recovered owner key to the DeHub profile it actually controls.
 *
 * Legacy profiles normally store their Safe smart-account address, while a
 * Web3Auth recovery returns the Safe owner's EOA key. Address matching must
 * therefore accept either form. Provider metadata is only a fallback when the
 * Safe prediction was unavailable; a successful prediction that disagrees
 * with every candidate is proof that the wrong old login was used.
 */
export function matchRecoveredLegacyAccount(
  accounts: LegacyAccountMatch[],
  provider: string | null,
  ownerAddress: string,
  safeAddress: string | null,
): LegacyAccountMatch | undefined {
  const byAddress = legacyAccountForWallet(accounts, ownerAddress, safeAddress);
  if (byAddress) return byAddress;
  if (safeAddress) return undefined;

  const byProvider = provider ? legacyAccountsForProvider(accounts, provider) : [];
  if (byProvider.length === 1) return byProvider[0];
  return accounts.length === 1 ? accounts[0] : undefined;
}

/** The login family an old profile was made with, or null when unrecorded. */
export function oldLoginOf(signupMethod?: string | null): string | null {
  const method = normalized(signupMethod);
  if (!method) return null;
  if (PROVIDER_ALIASES.email.includes(method)) return 'email_passwordless';
  if (PROVIDER_ALIASES.sms.includes(method)) return 'sms_passwordless';
  return method;
}

/**
 * The one old login every found profile was made with. Web3Auth keys are per
 * login, so when there is exactly one, every other option opens a different
 * wallet. Null when profiles disagree or any of them is unrecorded.
 */
export function sharedOldLogin(accounts: LegacyAccountMatch[]): string | null {
  const logins = new Set(accounts.map((account) => oldLoginOf(account.signupMethod)));
  if (logins.size !== 1) return null;
  return [...logins][0];
}
