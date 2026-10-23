/**
 * Mastodon apps API
 * =================
 * Mastodon apps (Ivory, Ice Cubes, Tusky, Elk…) sign in to DeHub with OAuth
 * (dehub-stream-backend src/mastodon). The approval step is our page,
 * /oauth/authorize; these are the calls it and Settings → Connected apps make.
 *
 * @module lib/api/dehub/mastodon-apps
 */
import { apiCall } from './core';

export interface AuthorizeRequest {
  name: string;
  website: string | null;
  scopes: string[];
  redirectUri: string;
  outOfBand: boolean;
}

export interface ConnectedApp {
  clientId: string;
  name: string;
  website: string | null;
  scopes: string[];
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** The OAuth parameters an app sends to /oauth/authorize, passed on as they came. */
export const AUTHORIZE_PARAMS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
] as const;

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || 'Request failed');
  return (response?.result ?? response) as T;
}

/** What the app is and what it asks for — or an error when the link is not one we would honour. */
export async function describeAuthorizeRequest(params: Record<string, string>): Promise<AuthorizeRequest> {
  return apiCall<AuthorizeRequest>('/api/mastodon/oauth/request', { params });
}

/** The signed-in person allows the app: where to send them back, and the code for apps without a redirect. */
export async function approveAuthorizeRequest(params: Record<string, string>): Promise<{ redirectTo: string; code: string }> {
  return apiCall<{ redirectTo: string; code: string }>('/api/mastodon/oauth/approve', {
    method: 'POST',
    body: params,
    requiresAuth: true,
  });
}

export async function listConnectedApps(): Promise<ConnectedApp[]> {
  return unwrap<ConnectedApp[]>(await apiCall('/api/mastodon/authorizations', { requiresAuth: true }));
}

export async function removeConnectedApp(clientId: string): Promise<void> {
  unwrap(await apiCall(`/api/mastodon/authorizations/${encodeURIComponent(clientId)}`, { method: 'DELETE', requiresAuth: true }));
}
