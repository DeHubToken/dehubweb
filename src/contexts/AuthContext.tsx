/**
 * Auth Context — light module
 * ===========================
 * Holds ONLY the context object, its type, and useAuth. The provider
 * implementation lives in ./AuthProvider (loaded inside the lazy
 * WalletProviders chunk).
 *
 * IMPORTANT: keep this file free of runtime imports of wagmi / web3auth /
 * rainbowkit (type-only imports are fine — they are erased at build time).
 * ~180 components import useAuth from here; any heavy runtime import added
 * here lands in the entry bundle and defeats the wallet code split.
 * scripts/check-entry-bundle.mjs fails the build if that happens.
 */

import { createContext, useContext } from 'react';
import type { DeHubUser } from '@/lib/api/dehub';
import type { Web3Auth } from '@web3auth/modal';

export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'phantom' | 'trust';

export interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isProcessingRedirect: boolean;
  requiresUsername: boolean;
  needsSignature: boolean;
  web3auth: Web3Auth | null;
  connectionSource: 'web3auth' | 'wagmi' | null;
  // Legacy connect method (opens default modal)
  connect: () => Promise<void>;
  // New custom UI methods
  connectWithProvider: (provider: SocialProvider) => Promise<void>;
  connectWithEmail: (email: string) => Promise<void>;
  connectWithSMS: (phone: string) => Promise<void>;
  connectWithWallet: (wallet: WalletProvider) => Promise<boolean>;
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
