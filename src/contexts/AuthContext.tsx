/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Smart accounts are handled automatically by Web3Auth's AccountAbstractionProvider
 * with Pimlico paymaster for gasless transactions.
 * 
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { 
  authenticateWallet, 
  getAccountInfo,
  getAuthToken, 
  clearAuthSession,
  isTokenExpired,
  type DeHubUser 
} from '@/lib/api/dehub';
import { 
  initWeb3Auth, 
  disconnectWeb3Auth,
  resetWeb3AuthState,
  forceCleanupWeb3Auth,
  connectToSocialProvider,
  connectToExternalWallet,
  connectWithModal,
  AUTH_CONNECTION,
  WALLET_CONNECTORS,
  getOrInitWeb3Auth,
} from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';
import type { IProvider } from '@web3auth/modal';

// Provider types for the custom login modal
export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'walletconnect' | 'coinbase' | 'phantom' | 'rabby' | 'trust';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  requiresUsername: boolean;
  needsSignature: boolean;
  web3auth: Web3Auth | null;
  // Legacy connect method (opens default modal)
  connect: () => Promise<void>;
  // New custom UI methods
  connectWithProvider: (provider: SocialProvider) => Promise<void>;
  connectWithEmail: (email: string) => Promise<void>;
  connectWithSMS: (phone: string) => Promise<void>;
  connectWithWallet: (wallet: WalletProvider) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setRequiresUsername: (value: boolean) => void;
  // Login modal state
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(userData: Partial<DeHubUser>, fallbackAddress: string): DeHubUser {
  return {
    address: userData.address || fallbackAddress,
    username: userData.username || null,
    displayName: userData.displayName || null,
    avatarImageUrl: userData.avatarImageUrl || null,
    coverImageUrl: userData.coverImageUrl || null,
    aboutMe: userData.aboutMe || null,
    followers: typeof userData.followers === 'number' ? userData.followers : 0,
    likes: typeof userData.likes === 'number' ? userData.likes : 0,
    uploads: userData.uploads ?? 0,
    sentTips: userData.sentTips ?? 0,
    receivedTips: userData.receivedTips ?? 0,
    customs: userData.customs || {},
    online: userData.online ?? true,
    createdAt: userData.createdAt,
    lastLoginTimestamp: userData.lastLoginTimestamp,
  };
}

// Map custom provider names to Web3Auth AUTH_CONNECTION
function mapSocialProvider(provider: SocialProvider): typeof AUTH_CONNECTION[keyof typeof AUTH_CONNECTION] {
  switch (provider) {
    case 'google': return AUTH_CONNECTION.GOOGLE;
    case 'twitter': return AUTH_CONNECTION.TWITTER;
    case 'telegram': return AUTH_CONNECTION.TELEGRAM;
    case 'apple': return AUTH_CONNECTION.APPLE;
    case 'discord': return AUTH_CONNECTION.DISCORD;
    case 'github': return AUTH_CONNECTION.GITHUB;
    default: return AUTH_CONNECTION.GOOGLE;
  }
}

// Map wallet providers to Web3Auth connectors
// Note: Phantom, Rabby, Trust all use the same injected provider (window.ethereum)
// The browser's active wallet extension will respond to connection requests
function mapWalletProvider(wallet: WalletProvider): typeof WALLET_CONNECTORS[keyof typeof WALLET_CONNECTORS] {
  switch (wallet) {
    case 'metamask': 
    case 'phantom':
    case 'rabby':
    case 'trust':
      return WALLET_CONNECTORS.METAMASK; // All injected wallets use the same connector
    case 'walletconnect': return WALLET_CONNECTORS.WALLET_CONNECT_V2;
    case 'coinbase': return WALLET_CONNECTORS.COINBASE;
    default: return WALLET_CONNECTORS.METAMASK;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [requiresUsername, setRequiresUsername] = useState(false);
  const [needsSignature, setNeedsSignature] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Ref to track if connection should be aborted when modal is closed
  const connectionAbortedRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  const openLoginModal = useCallback(() => {
    connectionAbortedRef.current = false;
    setIsLoginModalOpen(true);
  }, []);
  
  const closeLoginModal = useCallback(() => {
    connectionAbortedRef.current = true;
    setIsConnecting(false);
    setIsLoginModalOpen(false);
    
    // If we were connecting, reset Web3Auth to clear stuck iframes
    if (isConnecting) {
      console.log('[Auth] Force closing modal - resetting Web3Auth state');
      setTimeout(() => {
        resetWeb3AuthState();
      }, 100);
    }
  }, [isConnecting]);

  // Check for existing session on mount
  useEffect(() => {
    const init = async () => {
      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet && !isTokenExpired()) {
          // Session restoration
          try {
            console.log('Restoring session, fetching account info...');
            const userData = await getAccountInfo(savedWallet);
            const normalizedUser = normalizeUser(userData, savedWallet);
            
            setUser(normalizedUser);
            setWalletAddress(savedWallet);
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            
            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error) {
            console.error('Session restoration failed:', error);
            clearAuthSession();
            localStorage.removeItem('dehub_user');
          }
        } else if (token && isTokenExpired()) {
          console.log('Token expired, clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }

      // Pre-initialize Web3Auth in background
      initWeb3Auth()
        .then((instance) => setWeb3auth(instance))
        .catch((err) => console.warn('Web3Auth pre-init failed:', err));
    };

    init();
  }, []);

  /**
   * Complete DeHub authentication after Web3Auth connects
   * Detects EOA vs smart account and uses appropriate signing method
   */
  const completeDeHubAuth = async (provider: IProvider) => {
    // Get address using eth_accounts
    const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available');
    }
    
    const address = accounts[0];
    const normalizedAddress = address.toLowerCase();
    
    // Detect if this is social login (embedded wallet) or external wallet (EOA)
    let isEmbeddedWallet = false;
    const web3authInstance = await getOrInitWeb3Auth();
    
    try {
      const userInfo = await web3authInstance.getUserInfo();
      console.log('[Auth] Full userInfo:', JSON.stringify(userInfo, null, 2));
      
      const info = userInfo as Record<string, unknown>;
      isEmbeddedWallet = !!(info && (
        info.email || 
        info.name || 
        info.verifier || 
        info.typeOfLogin ||
        info.idToken
      ));
    } catch (e) {
      console.log('[Auth] getUserInfo threw (likely external wallet):', e);
      isEmbeddedWallet = false;
    }
    
    console.log('[Auth] Wallet address:', normalizedAddress);
    console.log('[Auth] Is embedded wallet (social login):', isEmbeddedWallet);

    // Create sign message for DeHub auth
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${normalizedAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    let signature: string;
    
    if (!isEmbeddedWallet) {
      // EOA path: use personal_sign with injected provider
      console.log('[Auth] Using EOA signing path');
      try {
        signature = await provider.request({
          method: 'personal_sign',
          params: [message, address],
        }) as string;
      } catch {
        // Fallback: some providers expect [address, message]
        signature = await provider.request({
          method: 'personal_sign',
          params: [address, message],
        }) as string;
      }
    } else {
      // Smart account path (social login): use Web3Auth provider directly
      console.log('[Auth] Using smart account signing path');
      signature = await provider.request({
        method: 'personal_sign',
        params: [message, normalizedAddress],
      }) as string;
    }
    
    console.log('[Auth] Signature obtained, length:', signature?.length);

    const BASE_CHAIN_ID = 8453;

    const authResponse = await authenticateWallet(
      normalizedAddress,
      signature,
      timestamp,
      BASE_CHAIN_ID
    );

    const normalizedUser = normalizeUser(authResponse.user, normalizedAddress);

    localStorage.setItem('dehub_wallet', normalizedAddress);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

    setWalletAddress(normalizedAddress);
    setUser(normalizedUser);

    if (!normalizedUser.username) {
      setRequiresUsername(true);
    }
    
    console.log('[Auth] ✓ DeHub authentication complete');
  };

  /**
   * Check if error is a user cancellation (covers many Web3Auth error variants)
   */
  const isCancellationError = (errorMessage: string): boolean => {
    const lowerMessage = errorMessage.toLowerCase();
    return (
      lowerMessage.includes('user rejected') ||
      lowerMessage.includes('user denied') ||
      lowerMessage.includes('user closed') ||
      lowerMessage.includes('cancelled') ||
      lowerMessage.includes('canceled') ||
      lowerMessage.includes('popup_closed') ||
      lowerMessage.includes('popup closed') ||
      lowerMessage.includes('closed by user') ||
      lowerMessage.includes('window closed') ||
      lowerMessage.includes('aborted') ||
      lowerMessage.includes('user cancelled') ||
      lowerMessage.includes('modal closed') ||
      lowerMessage.includes('login cancelled')
    );
  };

  /**
   * Handle errors during connection - does NOT throw, just shows toast
   */
  const handleConnectionError = (error: unknown) => {
    console.error('[Auth] Connection failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    let userFriendlyMessage = 'Connection failed. Please try again.';
    
    if (isCancellationError(errorMessage)) {
      userFriendlyMessage = 'Log in was cancelled';
    } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
      userFriendlyMessage = 'Please switch to Base network and try again';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      userFriendlyMessage = 'Connection timed out. Please try again.';
    } else if (errorMessage.includes('popup') || errorMessage.includes('blocked')) {
      userFriendlyMessage = 'Popup was blocked. Please allow popups and try again.';
    } else if (errorMessage.includes('bundler') || errorMessage.includes('paymaster')) {
      userFriendlyMessage = 'Account setup failed. Please try again.';
    }
    
    toast.error(userFriendlyMessage);
    // NOTE: Removed throw - throwing here prevents finally block from resetting isConnecting
  };

  /**
   * Connect with a social provider (Google, X, Telegram, Apple, etc.)
   */
  const connectWithProvider = useCallback(async (provider: SocialProvider) => {
    console.log(`[Auth] connectWithProvider(${provider}) called`);
    connectionAbortedRef.current = false;
    setIsConnecting(true);

    try {
      const authConnection = mapSocialProvider(provider);
      const web3authProvider = await connectToSocialProvider(authConnection);
      
      // Check if user closed modal during connection
      if (connectionAbortedRef.current) {
        console.log('[Auth] Connection aborted by user');
        return;
      }
      
      if (!web3authProvider) {
        throw new Error('Failed to connect - no provider returned');
      }

      await completeDeHubAuth(web3authProvider);
      setNeedsSignature(false);
      closeLoginModal();
      
      console.log(`[Auth] ✓ ${provider} connection complete!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      
      // Always force cleanup after any error to ensure clean state for retry
      try {
        await forceCleanupWeb3Auth();
      } catch (e) {
        console.warn('[Auth] Cleanup after error failed:', e);
      }
      
      if (isCancellationError(errorMessage)) {
        toast.error('Log in was cancelled');
        return;
      }
      
      handleConnectionError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [closeLoginModal]);

  /**
   * Connect with email (passwordless)
   */
  const connectWithEmail = useCallback(async (email: string) => {
    console.log('[Auth] connectWithEmail() called');
    setIsConnecting(true);

    try {
      const web3authProvider = await connectToSocialProvider(
        AUTH_CONNECTION.EMAIL_PASSWORDLESS,
        email
      );
      
      if (!web3authProvider) {
        throw new Error('Failed to connect - no provider returned');
      }

      await completeDeHubAuth(web3authProvider);
      setNeedsSignature(false);
      closeLoginModal();
      
      console.log('[Auth] ✓ Email connection complete!');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      
      try {
        await forceCleanupWeb3Auth();
      } catch (e) {
        console.warn('[Auth] Cleanup after error failed:', e);
      }
      
      if (isCancellationError(errorMessage)) {
        toast.error('Log in was cancelled');
        return;
      }
      
      handleConnectionError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [closeLoginModal]);

  /**
   * Connect with SMS (passwordless)
   */
  const connectWithSMS = useCallback(async (phone: string) => {
    console.log('[Auth] connectWithSMS() called');
    setIsConnecting(true);

    try {
      const web3authProvider = await connectToSocialProvider(
        AUTH_CONNECTION.SMS_PASSWORDLESS,
        phone
      );
      
      if (!web3authProvider) {
        throw new Error('Failed to connect - no provider returned');
      }

      await completeDeHubAuth(web3authProvider);
      setNeedsSignature(false);
      closeLoginModal();
      
      console.log('[Auth] ✓ SMS connection complete!');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      
      try {
        await forceCleanupWeb3Auth();
      } catch (e) {
        console.warn('[Auth] Cleanup after error failed:', e);
      }
      
      if (isCancellationError(errorMessage)) {
        toast.error('Log in was cancelled');
        return;
      }
      
      handleConnectionError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [closeLoginModal]);

  /**
   * Connect with an external wallet (MetaMask, WalletConnect, Coinbase)
   */
  const connectWithWallet = useCallback(async (wallet: WalletProvider) => {
    console.log(`[Auth] connectWithWallet(${wallet}) called`);
    setIsConnecting(true);

    try {
      const walletConnector = mapWalletProvider(wallet);
      const web3authProvider = await connectToExternalWallet(walletConnector);
      
      if (!web3authProvider) {
        throw new Error('Failed to connect - no provider returned');
      }

      await completeDeHubAuth(web3authProvider);
      setNeedsSignature(false);
      closeLoginModal();
      
      console.log(`[Auth] ✓ ${wallet} connection complete!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      
      try {
        await forceCleanupWeb3Auth();
      } catch (e) {
        console.warn('[Auth] Cleanup after error failed:', e);
      }
      
      if (isCancellationError(errorMessage)) {
        toast.error('Log in was cancelled');
        return;
      }
      
      handleConnectionError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [closeLoginModal]);

  /**
   * Legacy connect method - opens default Web3Auth modal
   * Kept for backwards compatibility
   */
  const connect = useCallback(async () => {
    console.log('[Auth] connect() called - opening custom login modal');
    openLoginModal();
  }, [openLoginModal]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWeb3Auth();
    } catch (error) {
      console.error('Web3Auth disconnect error:', error);
    }
    
    clearAuthSession();
    localStorage.removeItem('dehub_user');
    setUser(null);
    setWalletAddress(null);
    setRequiresUsername(false);
    setNeedsSignature(false);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!walletAddress) return;

    if (isTokenExpired()) {
      console.log('Token expired during refresh, clearing session');
      await disconnect();
      return;
    }

    try {
      const userData = await getAccountInfo(walletAddress);
      const normalizedUser = normalizeUser(userData, walletAddress);
      
      setUser(normalizedUser);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [walletAddress, disconnect]);

  return (
    <AuthContext.Provider
      value={{
        user,
        walletAddress,
        isAuthenticated,
        isLoading,
        isConnecting,
        requiresUsername,
        needsSignature,
        web3auth,
        connect,
        connectWithProvider,
        connectWithEmail,
        connectWithSMS,
        connectWithWallet,
        disconnect,
        refreshUser,
        setRequiresUsername,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
