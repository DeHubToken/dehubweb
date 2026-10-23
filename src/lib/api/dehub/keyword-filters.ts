/**
 * Keyword filters API
 * ===================
 * A viewer's private list of words and phrases (dehub-stream-backend
 * models/KeywordFilter). The server only keeps the list; posts are matched
 * here, in `@/lib/keyword-filters`, so a warned post can still be opened.
 *
 * @module lib/api/dehub/keyword-filters
 */
import { apiCall } from './core';

export type FilterAction = 'warn' | 'hide';
export type FilterContext = 'home' | 'public' | 'notifications' | 'thread' | 'profile';

export const FILTER_CONTEXTS: FilterContext[] = ['home', 'public', 'notifications', 'thread', 'profile'];

export interface KeywordFilter {
  id: string;
  phrase: string;
  wholeWord: boolean;
  action: FilterAction;
  contexts: FilterContext[];
  /** ISO time it stops applying; null keeps it until removed. */
  expiresAt: string | null;
  createdAt: string | null;
}

export type KeywordFilterInput = {
  phrase?: string;
  wholeWord?: boolean;
  action?: FilterAction;
  contexts?: FilterContext[];
  /** Seconds from now; null for no expiry. Absent leaves an edit's expiry alone. */
  expiresIn?: number | null;
};

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || 'Request failed');
  return (response?.result ?? response) as T;
}

export async function getKeywordFilters(): Promise<KeywordFilter[]> {
  const list = unwrap<KeywordFilter[]>(await apiCall<any>('/api/keyword-filters', { requiresAuth: true }));
  return Array.isArray(list) ? list : [];
}

/** Adds a filter, or updates the one already on that phrase. */
export async function createKeywordFilter(input: KeywordFilterInput): Promise<KeywordFilter> {
  return unwrap(await apiCall<any>('/api/keyword-filters', { method: 'POST', body: input, requiresAuth: true }));
}

export async function updateKeywordFilter(id: string, input: KeywordFilterInput): Promise<KeywordFilter> {
  return unwrap(
    await apiCall<any>(`/api/keyword-filters/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, requiresAuth: true }),
  );
}

export async function deleteKeywordFilter(id: string): Promise<void> {
  unwrap(await apiCall<any>(`/api/keyword-filters/${encodeURIComponent(id)}`, { method: 'DELETE', requiresAuth: true }));
}
