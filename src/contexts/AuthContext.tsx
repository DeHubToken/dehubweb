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
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  patchUser: (patch: Partial<DeHubUser>) => void;
  refreshSession: () => Promise<boolean>;
  setRequiresUsername: (value: boolean) => void;
  setWagmiAuthIntent: (value: boolean) => void;
  // Login modal state
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
