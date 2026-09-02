/**
 * Creator Flow — tiny event bus between the store and the sync hook.
 * ==================================================================
 * Store actions ask the mounted `useFlowSync` to flush a pending edit right away instead of waiting
 * out the debounce. Standalone so the store and the hook do not import each
 * other.
 *
 * Call `requestFlowSync()` from DISCRETE actions — drop or delete a node,
 * finish a resize, connect an edge. Not from continuous ones (dragging,
 * typing); the debounce exists to coalesce those.
 */
export const FLOW_SYNC_NOW_EVENT = 'creator-flow-sync-now';

export function requestFlowSync(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLOW_SYNC_NOW_EVENT));
}
