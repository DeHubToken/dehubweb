/**
 * Token launch waitlist ("Notify me" while Buy Tokens is closed).
 * dehub-stream-backend src/token-launch. The email itself never comes back,
 * only a masked copy such as ja***@gmail.com.
 *
 * @module lib/api/dehub/token-launch
 */
import { apiCall } from './core';

export interface TokenLaunchStatus {
  joined: boolean;
  /** Masked email the signup went to. */
  email?: string | null;
  /** Masked email on the account, when it has one. Null means type one. */
  accountEmail: string | null;
}

export interface TokenLaunchJoin {
  joined: true;
  already: boolean;
  email: string;
}

export const TOKEN_LAUNCH_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidLaunchEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length >= 6 && email.length <= 254 && TOKEN_LAUNCH_EMAIL.test(email);
}

export function getTokenLaunchStatus(): Promise<TokenLaunchStatus> {
  return apiCall<TokenLaunchStatus>('/api/token-launch/notify');
}

export function joinTokenLaunch(input: { email?: string; useAccountEmail?: boolean; locale?: string }): Promise<TokenLaunchJoin> {
  return apiCall<TokenLaunchJoin>('/api/token-launch/notify', {
    method: 'POST',
    body: { ...input, source: 'web' },
  });
}
