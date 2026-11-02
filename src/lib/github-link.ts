/**
 * Verified GitHub on profiles.
 *
 * The link is never typed: the owner signs in to GitHub and the backend
 * (dehub-stream-backend src/github-link) stores the account GitHub vouched
 * for. One GitHub account can only sit on one DeHub profile.
 */
import { apiCall } from '@/lib/api/dehub/core';

export interface GithubLinkStatus {
  available: boolean;
  connected: boolean;
  login: string | null;
  verifiedAt: string | null;
}

/** The outcomes the backend sends back in `?github=` after GitHub's sign-in. */
export type GithubLinkResult = 'connected' | 'taken' | 'cancelled' | 'failed';

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** A GitHub login as the API sent it, or undefined when it is not one. */
export function verifiedGithubLogin(raw: unknown): string | undefined {
  return typeof raw === 'string' && LOGIN.test(raw) ? raw : undefined;
}

export const githubProfileUrl = (login: string) => `https://github.com/${login}`;

function unwrap<T>(body: T | { result: T }): T {
  return body && typeof body === 'object' && 'result' in (body as object) ? (body as { result: T }).result : (body as T);
}

export const githubLink = {
  async status(): Promise<GithubLinkStatus> {
    return unwrap(await apiCall<GithubLinkStatus | { result: GithubLinkStatus }>('/api/github-link', { requiresAuth: true }));
  },
  /** GitHub's sign-in page. Coming back lands on Settings with `?github=<result>`. */
  async connect(): Promise<string> {
    return unwrap(await apiCall<{ url: string } | { result: { url: string } }>('/api/github-link/connect', {
      method: 'POST', requiresAuth: true, body: { origin: window.location.origin },
    })).url;
  },
  async disconnect(): Promise<GithubLinkStatus> {
    return unwrap(await apiCall<GithubLinkStatus | { result: GithubLinkStatus }>('/api/github-link', {
      method: 'DELETE', requiresAuth: true,
    }));
  },
};
