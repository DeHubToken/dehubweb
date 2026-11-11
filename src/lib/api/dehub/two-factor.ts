/**
 * Two-step sign-in (authenticator app codes). The backend owns the secret,
 * the backup codes and every check; the client only carries codes across.
 */
export interface TwoFactorStatusResponse {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesLeft: number;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
}

async function call<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const { apiCall } = await import('./core');
  return apiCall<T>(path, { method: body === undefined ? 'GET' : 'POST', requiresAuth: true, body });
}

export const getTwoFactorStatus = () => call<TwoFactorStatusResponse>('/api/auth/2fa/status');
export const startTwoFactorSetup = () => call<TwoFactorSetupResponse>('/api/auth/2fa/setup', {});
export const enableTwoFactor = (code: string) => call<{ backupCodes: string[] }>('/api/auth/2fa/enable', { code });
export const disableTwoFactor = (code: string) => call<{ ok: true }>('/api/auth/2fa/disable', { code });
export const regenerateTwoFactorCodes = (code: string) => call<{ backupCodes: string[] }>('/api/auth/2fa/backup-codes', { code });
