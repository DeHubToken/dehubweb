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

/** A "Sign in with DeHub" app a developer registered from their account (dehub.io/apps/dev). */
export interface DeveloperSignInApp {
  clientId: string;
  name: string;
  website: string | null;
  redirectUris: string[];
  scopes: string[];
  users: number;
  createdAt: string | null;
  /** Only on create and on rotate: shown once, never stored in the clear. */
  clientSecret?: string;
}

export async function listDeveloperApps(): Promise<DeveloperSignInApp[]> {
  return unwrap<DeveloperSignInApp[]>(await apiCall('/api/mastodon/developer-apps', { requiresAuth: true }));
}

export async function createDeveloperApp(input: { name: string; website?: string; redirectUris: string[] }): Promise<DeveloperSignInApp> {
  return unwrap<DeveloperSignInApp>(await apiCall('/api/mastodon/developer-apps', { method: 'POST', body: input, requiresAuth: true }));
}

export async function rotateDeveloperSecret(clientId: string): Promise<{ clientId: string; clientSecret: string }> {
  return unwrap(await apiCall(`/api/mastodon/developer-apps/${encodeURIComponent(clientId)}/secret`, { method: 'POST', requiresAuth: true }));
}

export async function deleteDeveloperApp(clientId: string): Promise<void> {
  unwrap(await apiCall(`/api/mastodon/developer-apps/${encodeURIComponent(clientId)}`, { method: 'DELETE', requiresAuth: true }));
}
