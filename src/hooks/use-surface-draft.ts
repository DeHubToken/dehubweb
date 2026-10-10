import { useContext } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useDraftState, type DraftSetter } from './use-draft-state';

export function draftIdentity(entity: unknown): string | null {
  if (typeof entity === 'string' || typeof entity === 'number') return String(entity);
  if (Array.isArray(entity)) {
    const parts = entity.map(draftIdentity);
    return parts.every(part => part !== null) ? JSON.stringify(parts) : null;
  }
  if (!entity || typeof entity !== 'object') return null;
  const record = entity as Record<string, unknown>;
  for (const key of ['tokenId', 'id', '_id', 'projectId', 'wallet_address', 'address', 'slug']) {
    if (typeof record[key] === 'string' || typeof record[key] === 'number') return `${key}:${record[key]}`;
  }
  return null;
}

/** Source field plus route/entity identity; never use translated labels or render order. */
export function useSurfaceDraft<T>(field: string, initial: T | (() => T), identity?: string | number | null): [T, DraftSetter<T>] {
  const location = useContext(UNSAFE_LocationContext);
  const place = identity === undefined ? location?.location.pathname ?? '/' : identity;
  return useDraftState(place === null ? null : `field:${JSON.stringify([field, place])}`, initial);
}
