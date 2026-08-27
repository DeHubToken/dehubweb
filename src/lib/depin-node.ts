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
  emitDepinStored,
  onDepinAssign,
  onDepinChallenge,
  onDepinConnectError,
  onDepinDisconnect,
  onDepinRegistered,
  type DepinAssignData,
  type DepinChallengeData,
} from '@/lib/api/dehub/depin-socket';

export type DepinNodeStatus = 'idle' | 'connecting' | 'online' | 'unsupported' | 'rejected';

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
  const [socketReady, setSocketReady] = useState(false);

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

      // No node id and no byte count: the server knows both already, and a
      // client-supplied size would be a lever on this node's own rewards.
      emitDepinStored({ assetKey: assign.assetKey, sha256 });
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

      // `ranges` are INCLUSIVE of both ends, matching the HTTP Range header
      // the server hashes the canonical copy with. `Blob.slice` is exclusive
      // of its end, so the +1 is required — without it this node hashes one
      // byte less than the server for every range, no challenge can ever
      // pass, and every replica gets marked lost and reassigned in a loop.
      const parts = await Promise.all(
        challenge.ranges.map((r) => file.slice(r.start, r.end + 1).arrayBuffer()),
      );
      const total = parts.reduce((n, p) => n + p.byteLength, 0);
      const joined = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        joined.set(new Uint8Array(part), offset);
        offset += part.byteLength;
      }

      const hash = await sha256Hex(joined.buffer);
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
    setSocketReady(false);
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

    // Registration is implicit in connecting: the server reads this node's
    // wallet out of the signed session on the handshake. There is no
    // register message to send, and nothing here tells the server who we
    // are — a client-supplied address would let anyone claim any wallet.
    //
    // `socketReady` is what lets the listener effect below run. The listeners
    // can only bind to a socket that already exists, so flipping `optedIn`
    // alone is not enough — that ran the effect before this line had created
    // anything, every subscription silently no-opped, and the node waited on
    // a `depin:registered` nothing was listening for.
    await connectDepinSocket();
    setSocketReady(true);
  }, [walletAddress, getRootDir]);

  useEffect(() => {
    if (!socketReady) return;

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

    // A handshake the server refuses arrives as a disconnect with no prior
    // `depin:registered`. Treat that as rejected rather than leaving the UI
    // claiming it is still connecting.
    const onDropped = () => {
      if (nodeIdRef.current) return; // already registered; an ordinary drop
      setStatus('rejected');
    };
    const unsubDisconnect = onDepinDisconnect(onDropped);
    const unsubConnectError = onDepinConnectError(onDropped);

    return () => {
      unsubRegistered();
      unsubAssign();
      unsubChallenge();
      unsubDisconnect();
      unsubConnectError();
    };
  }, [socketReady, handleAssign, handleChallenge]);

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
