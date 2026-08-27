/**
 * DePin browser node
 * ===================
 * Turns the open `/depin` tab into a lightweight, best-effort storage node
 * that holds a second independent copy of a handful of DeHub media objects.
 * This is explicitly a "lightweight" tier: it contributes only while the tab
 * stays open, uses the Origin Private File System (OPFS) for storage, and
 * makes no promise of 24/7 uptime. There is no service worker and nothing
 * runs once the page is closed.
 *
 * Lifecycle is entirely owned by `useDepinNode()` — see that hook for the
 * public surface components should use. Everything below it is plumbing:
 * OPFS reads/writes, SHA-256 hashing and the `/depin` socket protocol.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectDepinSocket,
  disconnectDepinSocket,
  emitDepinChallengeResponse,
  emitDepinRegister,
  emitDepinStored,
  onDepinAssign,
  onDepinChallenge,
  onDepinRegistered,
  type DepinAssignData,
  type DepinChallengeData,
} from '@/lib/api/dehub/depin-socket';

export type DepinNodeStatus = 'idle' | 'connecting' | 'online' | 'unsupported';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** OPFS file names must avoid path separators and other filesystem-unsafe characters. */
function sanitizeAssetKey(assetKey: string): string {
  return assetKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'asset';
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

/** Feature detection: OPFS support is patchy, notably on Safari. */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof (navigator.storage as StorageManager & { getDirectory?: unknown }).getDirectory === 'function' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseDepinNode {
  status: DepinNodeStatus;
  storedBytes: number;
  nodeId: string | null;
  optedIn: boolean;
  optIn: () => Promise<void>;
  optOut: () => void;
}

/**
 * Owns the node's lifecycle while the DePin page is mounted and the user has
 * opted in. Call `optIn()` from a "Become a node" button once a wallet is
 * connected; everything else (registration, asset downloads, challenge
 * responses, cleanup on unmount) is handled internally.
 */
export function useDepinNode(walletAddress: string | null | undefined): UseDepinNode {
  const [status, setStatus] = useState<DepinNodeStatus>('idle');
  const [storedBytes, setStoredBytes] = useState(0);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState(false);

  const rootDirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const nodeIdRef = useRef<string | null>(null);

  const getRootDir = useCallback(async (): Promise<FileSystemDirectoryHandle> => {
    if (rootDirRef.current) return rootDirRef.current;
    const root = await navigator.storage.getDirectory();
    rootDirRef.current = root;
    return root;
  }, []);

  const handleAssign = useCallback(async (assign: DepinAssignData) => {
    try {
      const res = await fetch(assign.url);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      const sha256 = assign.sha256 || (await sha256Hex(buf));

      const dir = await getRootDir();
      const fileHandle = await dir.getFileHandle(sanitizeAssetKey(assign.assetKey), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buf);
      await writable.close();

      setStoredBytes((prev) => prev + buf.byteLength);

      if (nodeIdRef.current) {
        emitDepinStored({ assetKey: assign.assetKey, nodeId: nodeIdRef.current, sha256 });
      }
    } catch (err) {
      // A failed download/store is not fatal — the server's verify-cron will
      // notice this node never confirmed the asset and reassign it elsewhere.
      console.warn('[DePin] Failed to store assigned asset:', assign.assetKey, err);
    }
  }, [getRootDir]);

  const handleChallenge = useCallback(async (challenge: DepinChallengeData) => {
    try {
      const dir = await getRootDir();
      const fileHandle = await dir.getFileHandle(sanitizeAssetKey(challenge.assetKey));
      const file = await fileHandle.getFile();
      const slice = file.slice(challenge.byteStart, challenge.byteEnd);
      const buf = await slice.arrayBuffer();
      const hash = await sha256Hex(buf);
      emitDepinChallengeResponse({ assetKey: challenge.assetKey, hash });
    } catch (err) {
      // File missing (evicted, quota pressure) or unreadable — tell the server
      // rather than letting the challenge silently time out. The server's
      // verify-cron marks the asset lost and reassigns it to another node.
      console.warn('[DePin] Could not answer challenge, reporting loss:', challenge.assetKey, err);
      emitDepinChallengeResponse({ assetKey: challenge.assetKey, lost: true });
    }
  }, [getRootDir]);

  const optOut = useCallback(() => {
    disconnectDepinSocket();
    rootDirRef.current = null;
    nodeIdRef.current = null;
    setNodeId(null);
    setOptedIn(false);
    setStatus('idle');
  }, []);

  const optIn = useCallback(async () => {
    if (!walletAddress) return;
    if (!isOpfsSupported()) {
      setStatus('unsupported');
      return;
    }

    setStatus('connecting');
    setOptedIn(true);

    // Best-effort — some browsers deny persistence silently, and that's fine
    // for a tab-lifetime, best-effort tier.
    try {
      await navigator.storage.persist?.();
    } catch {
      /* ignore */
    }

    try {
      await getRootDir();
    } catch (err) {
      console.warn('[DePin] OPFS root unavailable:', err);
      setStatus('unsupported');
      setOptedIn(false);
      return;
    }

    const socket = connectDepinSocket(walletAddress);

    socket.on('connect', () => {
      emitDepinRegister({ walletAddress });
    });
    if (socket.connected) {
      emitDepinRegister({ walletAddress });
    }
  }, [walletAddress, getRootDir]);

  useEffect(() => {
    if (!optedIn) return;

    const unsubRegistered = onDepinRegistered((data) => {
      nodeIdRef.current = data.nodeId;
      setNodeId(data.nodeId);
      setStatus('online');
    });
    const unsubAssign = onDepinAssign((assign) => {
      void handleAssign(assign);
    });
    const unsubChallenge = onDepinChallenge((challenge) => {
      void handleChallenge(challenge);
    });

    return () => {
      unsubRegistered();
      unsubAssign();
      unsubChallenge();
    };
  }, [optedIn, handleAssign, handleChallenge]);

  // Clean up the socket and any pending work when the page unmounts, or the
  // wallet disconnects out from under an opted-in node.
  useEffect(() => {
    return () => {
      disconnectDepinSocket();
    };
  }, []);

  useEffect(() => {
    if (optedIn && !walletAddress) {
      optOut();
    }
  }, [optedIn, walletAddress, optOut]);

  return { status, storedBytes, nodeId, optedIn, optIn, optOut };
}
