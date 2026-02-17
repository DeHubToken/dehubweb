/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Uses Web3Auth Modal SDK v10 with Pimlico Account Abstraction for
 * social/email/SMS login, and Wagmi for external wallet connections.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAccount, useSignMessage, useDisconnect, useConnect } from 'wagmi';
import { clearWagmiStorage } from '@/lib/wagmi';
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
  hasRedirectResult,
  isSocialLoginConnected,
  setLastConnectedConnector,
  AUTH_CONNECTION,
  WALLET_CONNECTORS,
  getOrInitWeb3Auth,
  getEoaPrivateKey,
} from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';

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
  web3auth: Web3Auth | null;
  connectionSource: 'web3auth' | 'wagmi' | null;
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

/**
 * Extract the raw ECDSA signature from an ERC-6492 wrapped signature.
 *
 * ERC-6492 format: abi.encode(factory, factoryCalldata, innerSig) + magicBytes
 * The innerSig for Safe single-owner is 65 bytes: r(32) + s(32) + v(1)
 * Safe uses v+4 for eth_sign type signatures (v=31→27, v=32→28).
 *
 * Returns the standard 65-byte ECDSA signature (0x + r + s + v) or null if
 * the signature is not ERC-6492 or cannot be parsed.
 */
function extractEoaSignatureFromErc6492(sig: string): string | null {
  const MAGIC = '6492649264926492649264926492649264926492649264926492649264926492';

  const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
  if (!hex.toLowerCase().endsWith(MAGIC.toLowerCase())) {
    return null; // Not an ERC-6492 signature
  }

  try {
    // Remove magic bytes (last 64 hex chars = 32 bytes)
    const withoutMagic = hex.slice(0, -64);

    // ABI decode: (address factory, bytes factoryCalldata, bytes innerSig)
    // Slot 2 (bytes 128-192): offset to innerSig data
    const sigOffset = parseInt(withoutMagic.slice(128, 192), 16) * 2; // convert byte offset to hex char offset

    // At offset: 32-byte length prefix, then actual signature bytes
    const sigLength = parseInt(withoutMagic.slice(sigOffset, sigOffset + 64), 16);
    const sigData = withoutMagic.slice(sigOffset + 64, sigOffset + 64 + sigLength * 2);

    if (sigLength !== 65) {
      console.warn('[Auth] ERC-6492 inner sig is not 65 bytes, length:', sigLength);
      return null;
    }

    // r(32 bytes) + s(32 bytes) + v(1 byte)
    const r = sigData.slice(0, 64);
    const s = sigData.slice(64, 128);
    const v = parseInt(sigData.slice(128, 130), 16);

    // Safe uses v+4 for eth_sign type signatures. Normalize to standard v.
    let normalizedV = v;
    if (v > 30) {
      normalizedV = v - 4; // 31→27, 32→28
    }

    console.log('[Auth] ERC-6492 inner sig extracted: v_raw=', v, 'v_normalized=', normalizedV);
    return '0x' + r + s + normalizedV.toString(16).padStart(2, '0');
  } catch (e) {
    console.warn('[Auth] Failed to parse ERC-6492 signature:', e);
    return null;
  }
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(false);
  const [requiresUsername, setRequiresUsername] = useState(false);
  const [needsSignature, setNeedsSignature] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [connectionSource, setConnectionSource] = useState<'web3auth' | 'wagmi' | null>(
    (localStorage.getItem('dehub_connection_source') as 'web3auth' | 'wagmi' | null) || null
  );

  // Wagmi hooks
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { connectAsync, connectors } = useConnect();
  
  // Ref to track if connection should be aborted when modal is closed
  const connectionAbortedRef = useRef(false);
  // Ref to track if redirect has been processed to prevent double processing
  const redirectProcessedRef = useRef(false);
  // Ref to track if user explicitly clicked "Connect Wallet" (prevents auto-auth on page load)
  const wagmiAuthIntentRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  // Persist connection source
  useEffect(() => {
    if (connectionSource) {
      localStorage.setItem('dehub_connection_source', connectionSource);
    } else {
      localStorage.removeItem('dehub_connection_source');
    }
  }, [connectionSource]);


  const openLoginModal = useCallback(() => {
    connectionAbortedRef.current = false;
    setIsLoginModalOpen(true);
  }, []);
  
  const closeLoginModal = useCallback(() => {
    connectionAbortedRef.current = true;
    setIsLoginModalOpen(false);

    // Only reset Web3Auth if user closed modal mid-connection (not after successful auth)
    if (isConnecting && !walletAddress && connectionSource === 'web3auth') {
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

  // Wagmi Auto-connect logic
  useEffect(() => {
    const handleWagmiConnect = async () => {
      // Don't interfere if we're processing a redirect (mobile email/SMS login)
      if (isProcessingRedirect || hasRedirectResult()) {
        console.log('[Auth] Skipping Wagmi auto-connect during redirect processing');
        return;
      }

      // If Wagmi connects (via AppKit or injected) and we are not authed yet
      if (isWagmiConnected && wagmiAddress && !isConnecting && !isLoading) {

        // CASE A: Already authed with same address -> Sync state
        if (isAuthenticated && walletAddress && walletAddress.toLowerCase() === wagmiAddress.toLowerCase()) {
           if (connectionSource !== 'wagmi') {
             setConnectionSource('wagmi');
           }
           return;
        }

        // CASE B: Already authed with DIFFERENT address -> Disconnect old session
        if (walletAddress && walletAddress.toLowerCase() !== wagmiAddress.toLowerCase()) {
           console.log('[Auth] Address mismatch (Wagmi vs Session), requiring re-auth');
           clearAuthSession();
           localStorage.removeItem('dehub_user');
           setWalletAddress(null);
           setUser(null);
        }

        // CASE C: Not authed -> Only start auth if user explicitly clicked "Connect Wallet"
        // OR if they are a returning wagmi user (connectionSource was 'wagmi' in localStorage)
        const savedSource = localStorage.getItem('dehub_connection_source');
        const hasUserIntent = wagmiAuthIntentRef.current;
        const isReturningWagmiUser = savedSource === 'wagmi' && !!getAuthToken() && !isTokenExpired();

        if (!hasUserIntent && !isReturningWagmiUser) {
          // Wagmi auto-reconnected from localStorage but user didn't click "Connect Wallet"
          // and there's no valid DeHub session - silently disconnect to prevent unwanted auth popup
          console.log('[Auth] Wagmi auto-reconnected without user intent, disconnecting silently');
          wagmiDisconnect();
          return;
        }

        console.log('[Auth] Wagmi connected, starting auth:', wagmiAddress,
          hasUserIntent ? '(user intent)' : '(returning user)');

        try {
          setIsConnecting(true);
          setConnectionSource('wagmi');
          wagmiAuthIntentRef.current = false; // Reset intent after use
          await completeDeHubAuthWagmi(wagmiAddress);
          closeLoginModal();
        } catch (err) {
          console.error('[Auth] Wagmi auth failed:', err);
          setConnectionSource(null);
        } finally {
          setIsConnecting(false);
        }
      }
    };

    handleWagmiConnect();
  }, [isWagmiConnected, wagmiAddress, isAuthenticated, isConnecting, isLoading, walletAddress, connectionSource, isProcessingRedirect]);


  // Handle Web3Auth redirect result (mobile email/SMS login)
  useEffect(() => {
    const processRedirect = async () => {
      const hasRedirect = hasRedirectResult();
      console.log('[Auth] [REDIRECT] Check redirect params:', {
        hasRedirect,
        alreadyProcessed: redirectProcessedRef.current,
        url: window.location.href.substring(0, 200),
        hash: window.location.hash ? 'present' : 'empty',
        search: window.location.search ? 'present' : 'empty',
      });

      // Only process once and only if redirect params present
      if (redirectProcessedRef.current || !hasRedirect) {
        return;
      }

      redirectProcessedRef.current = true;
      console.log('[Auth] [REDIRECT] Processing Web3Auth redirect result...');
      setIsProcessingRedirect(true);

      try {
        // Initialize Web3Auth - this will automatically process the redirect params
        const web3authInstance = await initWeb3Auth();
        setWeb3auth(web3authInstance);

        console.log('[Auth] [REDIRECT] Web3Auth initialized, status:', web3authInstance.status, 'connected:', web3authInstance.connected);

        // If Web3Auth is connected after processing redirect, complete DeHub auth
        if (web3authInstance.connected && web3authInstance.provider) {
          console.log('[Auth] [REDIRECT] Completing DeHub auth after redirect...');
          // Mark as social login since redirect is always from email/SMS
          setLastConnectedConnector(WALLET_CONNECTORS.AUTH);
          await completeDeHubAuthAfterRedirect(web3authInstance.provider);
          closeLoginModal();
        } else {
          console.warn('[Auth] [REDIRECT] Web3Auth not connected after redirect processing. Status:', web3authInstance.status);
          toast.error('Login failed. Please try again.');
        }

        // Clear URL parameters to prevent reprocessing on refresh
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('[Auth] [REDIRECT] Processing failed:', error);
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

  // Auto-connect in wallet in-app browsers (Trust Wallet, MetaMask mobile, etc.)
  // When user opens our dApp via deep link, window.ethereum is injected by the wallet.
  // Runs IMMEDIATELY on mount - doesn't wait for Web3Auth init or isLoading.
  useEffect(() => {
    const autoConnectInAppBrowser = async () => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum;
      const alreadyAttempted = sessionStorage.getItem('dehub_wallet_auto_connect_attempted');
      // Check existing session synchronously (no API call)
      const hasExistingSession = !!getAuthToken() && !isTokenExpired();

      // Don't auto-connect if we're returning from a Web3Auth redirect (email/SMS login)
      if (!isMobile || !hasInjected || hasExistingSession || alreadyAttempted || hasRedirectResult()) {
        return;
      }

      // Mark as attempted to prevent retry loops
      sessionStorage.setItem('dehub_wallet_auto_connect_attempted', 'true');

      console.log('[Auth] Mobile in-app browser detected, auto-connecting immediately...');
      const injectedConnector = connectors.find(c => c.id === 'injected');
      if (!injectedConnector) return;

      wagmiAuthIntentRef.current = true;
      try {
        await connectAsync({ connector: injectedConnector });
        // wagmi useEffect will pick up the connection and start DeHub auth
      } catch (err) {
        console.warn('[Auth] In-app browser auto-connect failed:', err);
        wagmiAuthIntentRef.current = false;
      }
    };

    autoConnectInAppBrowser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONCE on mount - no deps to avoid re-runs

  /**
   * Complete DeHub auth using Wagmi (Sign Message)
   */
  const completeDeHubAuthWagmi = async (address: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const authAddress = address.toLowerCase();

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;
    
    toast.info('Please sign the message in your wallet...');
    
    const signature = await signMessageAsync({ 
      message,
      account: authAddress as `0x${string}`
    });
    
    console.log('[Auth] Wagmi signature received');

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
    console.log('[Auth] ✓ DeHub authentication complete (Wagmi)');
  };

  /**
   * Complete DeHub auth specifically after redirect flow.
   * Same non-AA private key approach as popup flow.
   */
  const completeDeHubAuthAfterRedirect = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    try {
      const w3a = await getOrInitWeb3Auth();
      const userInfo = await w3a.getUserInfo();
      console.log('[Auth] [DIAG-REDIRECT] Web3Auth userInfo:', JSON.stringify({
        email: userInfo.email,
      }));
    } catch (e) {
      console.warn('[Auth] [DIAG-REDIRECT] getUserInfo failed:', e);
    }

    const signingProvider = provider;

    // Get EOA address
    await new Promise(r => setTimeout(r, 500));
    let accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
    if (!accounts?.length) {
      await new Promise(r => setTimeout(r, 1500));
      accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
    }
    if (!accounts?.length) throw new Error('No accounts available from provider after redirect');
    const authAddress = accounts[0].toLowerCase();
    console.log('[Auth] [REDIRECT] Address from eth_accounts:', authAddress);

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    // Use non-AA instance to get private key and sign directly
    console.log('[Auth] [REDIRECT] Getting raw private key via non-AA instance...');
    let signature: string;
    try {
      const privateKey = await getEoaPrivateKey();
      const { Wallet } = await import('ethers');
      const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
      signature = await wallet.signMessage(message);
      console.log('[Auth] [REDIRECT] Standard EOA signature produced, length:', signature?.length);
    } catch (e) {
      console.warn('[Auth] [REDIRECT] Private key export failed, falling back to personal_sign:', e);
      signature = await signingProvider.request({
        method: 'personal_sign',
        params: [message, authAddress],
      }) as string;
    }
    console.log('[Auth] [REDIRECT] Signature length:', signature?.length);

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
   * Complete DeHub authentication after Web3Auth connects.
   *
   * For social logins with AA:
   * - The provider's personal_sign produces ERC-6492 (Smart Account) signatures
   *   because the wallet-services iframe wraps signing with AA internally
   * - eth_accounts returns the EOA signer address
   * - The AA iframe blocks eth_private_key
   * - Fix: Create a temporary non-AA Web3Auth instance that picks up the same
   *   session, then export the raw EOA private key and sign with ethers directly.
   *   This produces a standard ECDSA signature matching the EOA address.
   */
  const completeDeHubAuth = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    const isSocial = isSocialLoginConnected();
    console.log('[Auth] Connection type:', isSocial ? 'SOCIAL (AA)' : 'EXTERNAL');

    if (isSocial) {
      try {
        const w3a = await getOrInitWeb3Auth();
        const userInfo = await w3a.getUserInfo();
        console.log('[Auth] [DIAG-POPUP] Web3Auth userInfo:', JSON.stringify({
          email: userInfo.email,
        }));
      } catch (e) {
        console.warn('[Auth] [DIAG-POPUP] getUserInfo failed:', e);
      }
    }

    const signingProvider = provider;

    // Get EOA address
    let authAddress: string;
    let accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
    if (!accounts || accounts.length === 0) {
      await new Promise(r => setTimeout(r, 1000));
      accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
    }
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available for signing');
    }
    authAddress = accounts[0].toLowerCase();
    console.log('[Auth] Address from eth_accounts:', authAddress);

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    console.log('[Auth] Signing login message for address:', authAddress);

    let signature: string;

    if (isSocial) {
      // The AA-enabled provider wraps personal_sign with ERC-6492.
      // Create a temporary non-AA Web3Auth instance to export the raw private key,
      // then sign directly with ethers for a standard ECDSA signature.
      console.log('[Auth] Social login: getting raw private key via non-AA instance...');
      try {
        const privateKey = await getEoaPrivateKey();
        const { Wallet } = await import('ethers');
        const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
        signature = await wallet.signMessage(message);
        console.log('[Auth] Standard EOA signature produced, length:', signature?.length);
      } catch (e) {
        console.warn('[Auth] Non-AA private key export failed, falling back to personal_sign:', e);
        // Last resort: use the AA-wrapped personal_sign
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [message, authAddress],
        }) as string;
      }
    } else {
      // External wallets: use personal_sign directly
      try {
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [message, authAddress],
        }) as string;
      } catch (e) {
        console.warn('[Auth] personal_sign failed, trying fallback param order...', e);
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [authAddress, message],
        }) as string;
      }
    }

    console.log('[Auth] Signature received, length:', signature?.length);

    const BASE_CHAIN_ID = 8453;
    console.log(`[Auth] Authenticating with backend for address ${authAddress}...`);

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

      setConnectionSource('web3auth');
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

      setConnectionSource('web3auth');
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

      setConnectionSource('web3auth');
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
  }, []);

  /**
   * Connect with an external wallet using wagmi connectors directly
   */
  const connectWithWallet = useCallback(async (wallet: WalletProvider) => {
    console.log(`[Auth] connectWithWallet(${wallet}) called`);

    // Determine which connector to use:
    // - 'walletconnect' → WalletConnect (QR code on desktop, deep links on mobile)
    // - anything else → injected (browser extensions, in-app browsers)
    let connector;
    if (wallet === 'walletconnect') {
      connector = connectors.find(c => c.id === 'walletConnect');
      if (!connector) {
        toast.error('WalletConnect not available. Please try another option.');
        return;
      }
    } else {
      connector = connectors.find(c => c.id === 'injected');
      if (!connector) {
        toast.error('No wallet detected. Please install a wallet extension.');
        return;
      }
    }

    // Set intent flag so the wagmi auto-connect effect knows this was user-initiated
    wagmiAuthIntentRef.current = true;

    try {
      // Don't set isConnecting here - the wagmi auto-connect useEffect will set it
      // when it detects the connection and starts the auth flow.
      // Setting it here would block the useEffect (it checks !isConnecting).
      console.log(`[Auth] Connecting via ${connector.id} connector...`);
      await connectAsync({ connector });
      // Auth flow continues in the useEffect hook monitoring wagmi state
    } catch (error: unknown) {
      wagmiAuthIntentRef.current = false;
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Auth] Wallet connection failed:', msg);

      if (msg.includes('not found') || msg.includes('not installed')) {
        toast.error('Wallet not found. Please install a wallet extension.');
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        toast.error('Connection was cancelled.');
      } else {
        toast.error('Failed to connect wallet. Please try again.');
      }
    }
  }, [connectors, connectAsync]);

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
      if (connectionSource === 'wagmi') {
        wagmiDisconnect();
      } else {
        await disconnectWeb3Auth();
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }

    // Always clear wagmi storage to prevent auto-reconnect on next page load
    clearWagmiStorage();

    clearAuthSession();
    localStorage.removeItem('dehub_user');
    sessionStorage.removeItem('dehub_wallet_auto_connect_attempted');
    setConnectionSource(null);
    setUser(null);
    setWalletAddress(null);
    setRequiresUsername(false);
    setNeedsSignature(false);
    closeLoginModal();
  }, [connectionSource, wagmiDisconnect, closeLoginModal]);

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
    console.log('[Auth] Attempting seamless session refresh with source:', connectionSource);
    
    if (connectionSource === 'wagmi') {
       if (isWagmiConnected && wagmiAddress) {
         try {
           await completeDeHubAuthWagmi(wagmiAddress);
           return true; 
         } catch(e) {
           console.error('[Auth] Wagmi session refresh failed:', e);
           return false;
         }
       }
       return false;
    }

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
  }, [connectionSource, isWagmiConnected, wagmiAddress]);

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
        connectionSource,
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
