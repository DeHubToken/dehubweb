import { apiCall } from './core';

/**
 * App tokens: DHB held as a balance on DeHub instead of on a chain. Everyone
 * opened with the DHB they held and staked at launch; after that only in-app
 * moves change it. Sending one never touches a chain.
 */

export interface AppTokensConfig {
  enabled: boolean;
  symbol: string;
  deposits: boolean;
}

export interface AppTokenPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface AppTokenEntry {
  kind: 'opening' | 'send' | 'receive' | 'spend' | 'refund' | 'deposit' | 'adjust';
  /** Signed decimal string: "-12.5" left, "12.5" arrived. */
  amount: string;
  purpose?: string;
  note?: string;
  counterparty?: AppTokenPerson;
  at: string;
}

export interface AppTokensAccount {
  symbol: string;
  balance: string;
  entries: AppTokenEntry[];
}

export function getAppTokensConfig(): Promise<AppTokensConfig> {
  return apiCall<AppTokensConfig>('/api/app-tokens/config');
}

export function getMyAppTokens(): Promise<AppTokensAccount> {
  return apiCall<AppTokensAccount>('/api/app-tokens/me', { requiresAuth: true });
}

export function findAppTokenRecipient(to: string): Promise<AppTokenPerson> {
  return apiCall<AppTokenPerson>('/api/app-tokens/recipient', { params: { to }, requiresAuth: true });
}

/**
 * `key` is made once per send attempt and reused on a retry, so a retried
 * request can never send twice.
 */
export function sendAppTokens(input: {
  to: string; amount: string; key: string; purpose?: string; ref?: string; note?: string;
}): Promise<{ ok: true; balance: string; to: AppTokenPerson }> {
  return apiCall('/api/app-tokens/send', { method: 'POST', body: input, requiresAuth: true });
}

export function newAppTokenKey(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
