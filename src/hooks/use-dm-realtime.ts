/**
 * Global hook for DM realtime updates.
 * Messages now go through DeHub API directly (/api/dm/tnx) instead of Supabase,
 * so realtime is handled via polling in useMessages (5s) and useConversations (20s).
 * This hook is kept as a no-op for compatibility.
 */
export function useDMRealtime() {
    // Polling is configured in use-messages.ts:
    // - useMessages: refetchInterval 5s (active chat)
    // - useConversations: refetchInterval 20s (conversation list)
}
