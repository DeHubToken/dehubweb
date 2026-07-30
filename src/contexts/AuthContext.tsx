/**
 * Auth Context — light module
 * ===========================
 * Holds ONLY the context object, its type, and useAuth. The provider
 * implementation lives in ./AuthProvider (loaded inside the lazy
 * WalletProviders chunk).
 *
 * IMPORTANT: keep this file free of runtime imports of wagmi / rainbowkit /
 * wallet SDKs (type-only imports are fine — they are erased at build time).
 * ~180 components import useAuth from here; any heavy runtime import added
 * here lands in the entry bundle and defeats the wallet code split.
 * scripts/check-entry-bundle.mjs fails the build if that happens.
 */

import { createContext, useContext } from 'react';
import type { DeHubUser } from '@/lib/api/dehub';

export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'phantom' | 'trust';

/**
 * Smart-wallet setup phase (social/email logins only):
 *  - 'none'    — no wallet step pending
 *  - 'create'  — Supabase-authed but no wallet row: show create flow
 *  - 'unlock'  — wallet exists: show password unlock
 */
export type WalletPhase = 'none' | 'create' | 'unlock';

export interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isProcessingRedirect: boolean;
  requiresUsername: boolean;
  needsSignature: boolean;
  connectionSource: 'web3auth' | 'wagmi' | null;
  // Smart-wallet (Supabase identity) state
  walletPhase: WalletPhase;
  supabaseUserId: string | null;
  // Legacy connect method (opens login modal)
  connect: () => Promise<void>;
  // Social / email login (Supabase Auth)
  connectWithProvider: (provider: SocialProvider) => Promise<void>;
  connectWithEmail: (email: string) => Promise<void>;
  cancelEmailMagicLink: () => void;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  connectWithSMS: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<void>;
  connectWithWallet: (wallet: WalletProvider) => Promise<boolean>;
  /**
   * Final step of the smart-wallet login: called by the login modal once the
   * wallet key is available (created, imported, or unlocked). Activates the
   * key, derives the Safe smart account, signs the DeHub auth message, and
   * establishes the DeHub session.
   */
  completeSmartWalletLogin: (privKeyHex: string) => Promise<void>;
  /** Decrypt and return the current wallet's raw private key (Settings export). */
  exportPrivateKey: (password: string) => Promise<string>;
  /**
   * Same export, unlocked with biometrics — the only backup path available to
   * a wallet created with biometrics and no password.
   */
  exportPrivateKeyWithBiometrics: () => Promise<string>;
  /** Replace the active wallet with a different old account's key. */
  switchActiveWallet: (secret: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  patchUser: (patch: Partial<DeHubUser>) => void;
  /**
   * Re-establish a usable DeHub session. Pass `force` when reacting to a
   * request the server actually rejected — without it, a token that only looks
   * valid against the local clock short-circuits to `true` and the caller
   * reports a success that never happened.
   */
  refreshSession: (force?: boolean) => Promise<boolean>;
  setRequiresUsername: (value: boolean) => void;
  setWagmiAuthIntent: (value: boolean) => void;
  // Login modal state
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  /**
   * Ask for the wallet password now, for built-in-wallet sessions whose key is
   * no longer in memory. Safe to call from anywhere: it renders synchronously,
   * and falls back to the sign-in sheet only when there is no identity to
   * unlock against.
   *
   * Use this wherever a locked wallet would otherwise be a dead end — an action
   * on the "wallet is locked" toast, the wallet menu, Settings. Do NOT reach for
   * openLoginModal instead: that shows sign-in options to somebody who is
   * already signed in.
   */
  requestWalletUnlock: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
