/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Uses Web3Auth No-Modal SDK for direct private key access and
 * standard ECDSA signatures required by the DeHub backend.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing any Web3Auth modal.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  authenticateWallet,
  getAccountInfo,
  getAuthToken,
  clearAuthSession,
  isTokenExpired,
  type DeHubUser
} from '@/lib/api/dehub';
import { Wallet } from 'ethers';
import {
  initWeb3Auth,
  disconnectWeb3Auth,
  resetWeb3AuthState,
  forceCleanupWeb3Auth,
  connectToSocialProvider,
  connectToExternalWallet,
  hasRedirectResult,
  isSocialLoginConnected,
  AUTH_CONNECTION,
  isMobileDevice,
  WALLET_ADAPTERS,
  getOrInitWeb3Auth,
} from '@/lib/web3auth';
import type { Web3AuthNoModal } from '@web3auth/no-modal';
import type { IProvider } from '@web3auth/base';

// Provider types for the custom login modal
export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'walletconnect' | 'coinbase' | 'phantom' | 'rabby' | 'trust';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isProcessingRedirect: boolean;
  requiresUsername: boolean;
  needsSignature: boolean;
  web3auth: Web3AuthNoModal | null;
  // Legacy connect method (opens default modal)
  connect: () => Promise<void>;
  // New custom UI methods
  connectWithProvider: (provider: SocialProvider) => Promise<void>;
  connectWithEmail: (email: string) => Promise<void>;
  connectWithSMS: (phone: string) => Promise<void>;
  connectWithWallet: (wallet: WalletProvider) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  setRequiresUsername: (value: boolean) => void;
  // Login modal state
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(userData: Partial<DeHubUser> | null | undefined, fallbackAddress: string): DeHubUser {
  const safe = userData ?? {};
  return {
    address: safe.address || fallbackAddress,
    username: safe.username || null,
    displayName: safe.displayName || null,
    avatarImageUrl: safe.avatarImageUrl || null,
    coverImageUrl: safe.coverImageUrl || null,
    aboutMe: safe.aboutMe || null,
    followers: typeof safe.followers === 'number' ? safe.followers : 0,
    likes: typeof safe.likes === 'number' ? safe.likes : 0,
    uploads: safe.uploads ?? 0,
    sentTips: safe.sentTips ?? 0,
    receivedTips: safe.receivedTips ?? 0,
    customs: safe.customs || {},
    online: safe.online ?? true,
    createdAt: safe.createdAt,
    lastLoginTimestamp: safe.lastLoginTimestamp,
  };
}

// Map custom provider names to Web3Auth AUTH_CONNECTION
function mapSocialProvider(provider: SocialProvider): typeof AUTH_CONNECTION[keyof typeof AUTH_CONNECTION] {
  switch (provider) {
    case 'google': return AUTH_CONNECTION.GOOGLE;
    case 'twitter': return AUTH_CONNECTION.TWITTER;
    case 'apple': return AUTH_CONNECTION.APPLE;
    case 'discord': return AUTH_CONNECTION.DISCORD;
    case 'telegram': return AUTH_CONNECTION.TELEGRAM;
    case 'github': return AUTH_CONNECTION.GITHUB;
    default: return AUTH_CONNECTION.GOOGLE;
  }
}

// Map wallet providers to Web3Auth adapters
function mapWalletProvider(wallet: WalletProvider): string {
  const mobile = isMobileDevice();
  const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum;

  // On mobile in-app browsers, window.ethereum is injected.
  // In this case we should use the MetaMask adapter directly.
  if (mobile && hasInjected && wallet !== 'walletconnect' && wallet !== 'coinbase') {
    return WALLET_ADAPTERS.METAMASK;
  }

  switch (wallet) {
    case 'metamask':
    case 'rabby':
    case 'trust':
    case 'phantom':
      // On mobile without injected provider, we rely on deep links from the Modal.
      // But if this is called, fallback to MetaMask adapter (which handles extension detection).
      // Note: WALLET_CONNECT_V2 is disabled on mobile in web3auth.ts to avoid ad-blocker issues.
      return WALLET_ADAPTERS.METAMASK;
    case 'walletconnect':
      return WALLET_ADAPTERS.WALLET_CONNECT_V2;
    case 'coinbase':
      return WALLET_ADAPTERS.COINBASE;
    default:
      return WALLET_ADAPTERS.METAMASK;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(false);
  const [requiresUsername, setRequiresUsername] = useState(false);
  const [needsSignature, setNeedsSignature] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3AuthNoModal | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Ref to track if connection should be aborted when modal is closed
  const connectionAbortedRef = useRef(false);
  // Ref to track if redirect has been processed to prevent double processing
  const redirectProcessedRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  const openLoginModal = useCallback(() => {
    connectionAbortedRef.current = false;
    setIsLoginModalOpen(true);
  }, []);
  
  const closeLoginModal = useCallback(() => {
    connectionAbortedRef.current = true;
    setIsLoginModalOpen(false);

    // Only reset Web3Auth if user closed modal mid-connection (not after successful auth)
    if (isConnecting && !walletAddress) {
      console.log('[Auth] Force closing modal mid-connection - resetting Web3Auth state');
      setIsConnecting(false);
      setTimeout(() => {
        resetWeb3AuthState();
      }, 100);
    }
  }, [isConnecting, walletAddress]);

  // Check for existing session on mount
  useEffect(() => {
    const init = async () => {
      // Check if this is a redirect return from Web3Auth (mobile email/SMS login)
      const isRedirectReturn = hasRedirectResult();
      if (isRedirectReturn) {
        console.log('[Auth] Detected Web3Auth redirect result, will process after init');
        // Don't restore session from cache if we're processing a redirect
        // The redirect flow will create a fresh session
        setIsLoading(false);
        return;
      }

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

  // Handle Web3Auth redirect result (mobile email/SMS login)
  useEffect(() => {
    const processRedirect = async () => {
      // Only process once and only if redirect params present
      if (redirectProcessedRef.current || !hasRedirectResult()) {
        return;
      }
      
      redirectProcessedRef.current = true;
      console.log('[Auth] Processing Web3Auth redirect result...');
      setIsProcessingRedirect(true);

      try {
        // Initialize Web3Auth - this will automatically process the redirect params
        const web3authInstance = await initWeb3Auth();
        setWeb3auth(web3authInstance);
        
        console.log('[Auth] Web3Auth initialized after redirect, status:', web3authInstance.status);
        console.log('[Auth] Web3Auth connected:', web3authInstance.connected);

        // If Web3Auth is connected after processing redirect, complete DeHub auth
        if (web3authInstance.connected && web3authInstance.provider) {
          console.log('[Auth] Completing DeHub auth after redirect...');
          await completeDeHubAuthAfterRedirect(web3authInstance.provider);
        } else {
          console.warn('[Auth] Web3Auth not connected after redirect processing');
          toast.error('Login failed. Please try again.');
        }

        // Clear URL parameters to prevent reprocessing on refresh
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('[Auth] Redirect result processing failed:', error);
        toast.error('Login failed. Please try again.');
        // Clear params even on error to prevent infinite loop
        window.history.replaceState({}, '', window.location.pathname);
      } finally {
        setIsProcessingRedirect(false);
        setIsLoading(false);
      }
    };

    processRedirect();
  }, []);

  /**
   * Complete DeHub auth specifically after redirect flow
   * Uses personal_sign with the provider - works for both social logins (AA) and external wallets
   */
  const completeDeHubAuthAfterRedirect = async (provider: IProvider) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    // Log Web3Auth user info for diagnostics (verifier + verifierId determine the key)
    try {
      const w3aInstance = await getOrInitWeb3Auth();
      const userInfo = await w3aInstance.getUserInfo();
      console.log('[Auth] [DIAG-REDIRECT] Web3Auth userInfo:', JSON.stringify({
        email: userInfo.email,
        verifier: userInfo.verifier,
        verifierId: userInfo.verifierId,
        typeOfLogin: userInfo.typeOfLogin,
        aggregateVerifier: userInfo.aggregateVerifier,
      }));
    } catch (e) {
      console.warn('[Auth] [DIAG-REDIRECT] getUserInfo failed:', e);
    }

    // Redirect flow is always from social login (email/SMS)
    // Get private key and sign with ethers for standard ECDSA signature
    console.log('[Auth] Redirect - Getting private key for direct signing...');
    const privateKey = await provider.request({ method: 'eth_private_key' }) as string;
    const wallet = new Wallet(privateKey);
    const authAddress = wallet.address.toLowerCase();

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    console.log('[Auth] Redirect - Signing with ethers.Wallet for address:', authAddress);
    const signature = await wallet.signMessage(message);

    console.log('[Auth] Redirect auth - Address:', authAddress);
    console.log('[Auth] Signature length:', signature?.length);

    const BASE_CHAIN_ID = 8453;
    const authResponse = await authenticateWallet(
      authAddress,
      signature,
      timestamp,
      BASE_CHAIN_ID
    );

    const normalizedUser = normalizeUser(authResponse.user, authAddress);

    localStorage.setItem('dehub_wallet', authAddress);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

    setWalletAddress(authAddress);
    setUser(normalizedUser);

    if (!normalizedUser.username) {
      setRequiresUsername(true);
    }
    
    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
    
    toast.success(normalizedUser.username ? 'Welcome back!' : 'Successfully logged in!');
    console.log('[Auth] ✓ DeHub authentication complete (redirect flow)');
  };

  /**
   * Complete DeHub authentication after Web3Auth connects
   * Uses personal_sign with the provider - works for both social logins (AA) and external wallets
   */
  const completeDeHubAuth = async (provider: IProvider) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    let authAddress: string;
    let signature: string;

    // Check if this is a social login (embedded wallet)
    const isSocial = isSocialLoginConnected();
    console.log('[Auth] Is social login:', isSocial);

    // Log Web3Auth user info for diagnostics (verifier + verifierId determine the key)
    if (isSocial) {
      try {
        const w3aInstance = await getOrInitWeb3Auth();
        const userInfo = await w3aInstance.getUserInfo();
        console.log('[Auth] [DIAG-POPUP] Web3Auth userInfo:', JSON.stringify({
          email: userInfo.email,
          verifier: userInfo.verifier,
          verifierId: userInfo.verifierId,
          typeOfLogin: userInfo.typeOfLogin,
          aggregateVerifier: userInfo.aggregateVerifier,
        }));
      } catch (e) {
        console.warn('[Auth] [DIAG-POPUP] getUserInfo failed:', e);
      }
    }

    if (isSocial) {
      // Social login: get private key and sign with ethers for standard ECDSA signature
      // This bypasses Web3Auth wallet services which would transform the signature
      console.log('[Auth] Getting private key for direct signing...');
      const privateKey = await provider.request({ method: 'eth_private_key' }) as string;
      const wallet = new Wallet(privateKey);
      authAddress = wallet.address.toLowerCase();

      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      console.log('[Auth] Signing with ethers.Wallet for address:', authAddress);
      signature = await wallet.signMessage(message);
    } else {
      // External wallet: use provider signing
      const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available from provider');
      }
      authAddress = accounts[0].toLowerCase();

      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      console.log('[Auth] Signing with external wallet for address:', authAddress);
      try {
        signature = await provider.request({
          method: 'personal_sign',
          params: [message, authAddress],
        }) as string;
      } catch {
        // Fallback: some providers expect [address, message] order
        signature = await provider.request({
          method: 'personal_sign',
          params: [authAddress, message],
        }) as string;
      }
    }

    console.log('[Auth] Using address for auth:', authAddress);
    console.log('[Auth] Signature length:', signature?.length);

    const BASE_CHAIN_ID = 8453;
    const authResponse = await authenticateWallet(
      authAddress,
      signature,
      timestamp,
      BASE_CHAIN_ID
    );

    const normalizedUser = normalizeUser(authResponse.user, authAddress);

    localStorage.setItem('dehub_wallet', authAddress);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

    setWalletAddress(authAddress);
    setUser(normalizedUser);

    if (!normalizedUser.username) {
      setRequiresUsername(true);
    }
    
    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
    
    toast.success(normalizedUser.username ? 'Welcome back!' : 'Successfully logged in!');
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
      userFriendlyMessage = 'Redirecting to login page...';
    } else if (errorMessage.includes('bundler') || errorMessage.includes('paymaster')) {
      userFriendlyMessage = 'Account setup failed. Please try again.';
    } else if (errorMessage.includes('Invalid auth connection') || errorMessage.includes('invalid auth connection')) {
      userFriendlyMessage = 'This login method is not configured. Please try a different option.';
    } else if (errorMessage.includes('smart account') || errorMessage.includes('Smart Account') || errorMessage.includes('aa_')) {
      userFriendlyMessage = 'Smart account setup failed. Please try again or use an external wallet.';
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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

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

  /**
   * Seamlessly refresh the session by requesting a new signature
   * from the still-connected Web3Auth provider.
   * Returns true if refresh succeeded, false if full sign-in is needed.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    console.log('[Auth] Attempting seamless session refresh...');
    
    try {
      const web3authInstance = await getOrInitWeb3Auth();
      
      // Check if still connected to wallet
      if (!web3authInstance.connected || !web3authInstance.provider) {
        console.log('[Auth] Not connected, cannot refresh - need full sign in');
        return false;
      }
      
      console.log('[Auth] Web3Auth still connected, requesting new signature...');
      
      // Re-run the signature flow with existing provider
      await completeDeHubAuth(web3authInstance.provider);
      
      console.log('[Auth] ✓ Session refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Auth] Session refresh failed:', error);
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        walletAddress,
        isAuthenticated,
        isLoading,
        isConnecting,
        isProcessingRedirect,
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
        refreshSession,
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
