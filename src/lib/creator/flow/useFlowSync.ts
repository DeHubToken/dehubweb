/**
 * Creator Flow — keep the store and creator_flows in step.
 * ========================================================
 *
 * Signed out, nothing happens: flows live in localStorage and that is the
 * whole guest mode. Once a wallet is in, the DB copy is loaded and merged,
 * then every change is written back — debounced for continuous edits (drags,
 * typing), near-instant after a discrete one (drop, delete, connect), and
 * flushed on pagehide so a resize followed by a reload is not lost.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { canSyncFlows, listFlows, remoteToFlow, saveFlows } from './api';
import { FLOW_SYNC_NOW_EVENT } from './syncBus';

const DEBOUNCE_MS = 1_500;
const IMMEDIATE_MS = 250;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export function useFlowSync(wallet: string | null) {
  const flows = useCreatorFlowStore((s) => s.flows);
  const loadFlowsFromDB = useCreatorFlowStore((s) => s.loadFlowsFromDB);

  const [status, setStatus] = useState<SyncStatus>(wallet ? 'idle' : 'offline');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const immediateRef = useRef(false);
  const savingRef = useRef(false);

  // ── Load from the database once per wallet ───────────────────────────────
  useEffect(() => {
    if (!wallet) {
      setStatus('offline');
      setLoadedFor(null);
      return;
    }
    if (loadedFor === wallet) return;
    let cancelled = false;
    (async () => {
      if (!canSyncFlows()) return;
      try {
        const { flows: rows } = await listFlows();
        if (cancelled) return;
        loadFlowsFromDB(rows.map(remoteToFlow));
        setLoadedFor(wallet);
        const now = new Date();
        setLastSyncedAt(now);
        setStatus('synced');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, loadedFor, loadFlowsFromDB]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!wallet || !canSyncFlows()) return;
    // Never write before the DB copy has been merged in: a save of the local
    // defaults would delete every real flow the wallet has.
    if (loadedFor !== wallet) return;
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }
    dirtyRef.current = false;
    immediateRef.current = false;
    savingRef.current = true;
    setStatus('syncing');
    try {
      const state = useCreatorFlowStore.getState();
      const live = state.flows.map((f) =>
        f.id === state.activeFlowId ? { ...f, nodes: state.nodes, edges: state.edges, nodeCounters: state.nodeCounters } : f,
      );
      // Only flows with content are persisted; empty ones are local placeholders.
      const toSave = live.filter((f) => f.nodes.length > 0);
      await saveFlows(toSave, true);
      const now = new Date();
      setLastSyncedAt(now);
      setStatus('synced');
    } catch {
      dirtyRef.current = true;
      setStatus('error');
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void save(), DEBOUNCE_MS);
      }
    }
  }, [wallet, loadedFor]);

  const syncNow = useCallback((): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return save();
  }, [save]);

  // Debounced write after any change to the flows.
  useEffect(() => {
    if (!wallet || loadedFor !== wallet) return;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), immediateRef.current ? IMMEDIATE_MS : DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flows, wallet, loadedFor, save]);

  // Discrete edits and page teardown flush early.
  useEffect(() => {
    if (!wallet || loadedFor !== wallet) return;
    const onSyncNow = () => {
      immediateRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void save(), IMMEDIATE_MS);
    };
    const flush = () => {
      if (!dirtyRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void save();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener(FLOW_SYNC_NOW_EVENT, onSyncNow);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(FLOW_SYNC_NOW_EVENT, onSyncNow);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [wallet, loadedFor, save]);

  return { status, lastSyncedAt, syncNow };
}
