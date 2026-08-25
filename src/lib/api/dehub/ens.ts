/**
 * Verified ENS handles
 * ====================
 * Client for `/api/ens/*` on the DeHub API.
 *
 * An account can prove it holds a `.eth` name and be reached at
 * `dehub.io/mal.eth`. It is an alias, not a rename: `username` is untouched by
 * everything in this file.
 *
 * Two things to know before touching the claim flow:
 *
 * - **The signing wallet is usually not the logged-in wallet.** The signature
 *   has to come from the address the name resolves to, which for most people
 *   is a different wallet from the one they browse DeHub with. The UI has to
 *   say so, or the user signs with the wrong account and gets a 401 they
 *   cannot interpret.
 * - **Nothing here is a lookup the client can shortcut.** Resolution and
 *   normalisation both happen server-side against Ethereum mainnet; a name
 *   typed in the box is not a name until `preview()` says what it resolves to.
 *
 * The bare origin is the base here, so every path carries `/api`.
 */

import { apiCall } from './core';

export interface EnsPreview {
  /** Canonical, ENSIP-15 normalised form — not necessarily what was typed. */
  name: string;
  /** The address the name currently points at, lowercased. */
  ensAddress: string;
  /** True when some DeHub account already wears it. */
  held: boolean;
  heldByUsername: string | null;
}

export interface EnsChallenge {
  name: string;
  ensAddress: string;
  /** Send this back with the signature — the server rebuilds the message from it. */
  issuedAt: number;
  expiresInSeconds: number;
  /** The exact text to sign. Never reconstruct it on the client. */
  message: string;
}

export interface EnsLink {
  name: string;
  ensAddress: string;
  verifiedAt: string;
  url: string;
}

interface Envelope<T> {
  status: boolean;
  result: T;
  error?: string;
  code?: string;
}

/** What the API called this failure, for messages worth wording differently. */
export class EnsApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'EnsApiError';
  }
}

function unwrap<T>(res: Envelope<T>): T {
  if (!res?.status) throw new EnsApiError(res?.error || 'Something went wrong', res?.code);
  return res.result;
}

/** What a name resolves to, and whether it is free. Public — no auth needed. */
export async function previewEnsName(name: string): Promise<EnsPreview> {
  return unwrap(
    await apiCall<Envelope<EnsPreview>>('/api/ens/preview', { params: { name } }),
  );
}

/**
 * A name to pre-fill, read off the logged-in wallet's reverse record.
 *
 * Usually null — the reverse record is a separate transaction most holders
 * never send — so the claim box must work perfectly without it.
 */
export async function suggestEnsName(): Promise<string | null> {
  const result = await apiCall<Envelope<{ name: string | null }>>('/api/ens/suggest', {
    requiresAuth: true,
  });
  return unwrap(result).name;
}

/** The exact text to put in front of the wallet that holds the name. */
export async function requestEnsChallenge(name: string): Promise<EnsChallenge> {
  return unwrap(
    await apiCall<Envelope<EnsChallenge>>('/api/ens/challenge', {
      method: 'POST',
      body: { name },
      requiresAuth: true,
    }),
  );
}

/** Hand back the signature and take the name. */
export async function linkEnsName(params: {
  name: string;
  issuedAt: number;
  signature: string;
}): Promise<EnsLink> {
  return unwrap(
    await apiCall<Envelope<EnsLink>>('/api/ens/link', {
      method: 'POST',
      body: { ...params },
      requiresAuth: true,
    }),
  );
}

/** The name this account currently wears, or null. */
export async function getMyEnsLink(): Promise<EnsLink | null> {
  const result = await apiCall<Envelope<EnsLink | null>>('/api/ens/link', {
    requiresAuth: true,
  });
  return unwrap(result);
}

/** Drop it. The username is untouched — it was never replaced. */
export async function unlinkEnsName(): Promise<void> {
  await apiCall<Envelope<{ unlinked: boolean }>>('/api/ens/link', {
    method: 'DELETE',
    requiresAuth: true,
  });
}
