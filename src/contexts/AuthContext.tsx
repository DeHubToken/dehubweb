/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Uses Web3Auth Modal SDK v10 in EOA mode for social/email/SMS login
 * (no AA - DeHub backend requires standard ECDSA signatures).
 * Wagmi handles external wallet connections.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAccount, useSignMessage, useDisconnect, useConnect } from 'wagmi';
import { getAccount } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { clearWagmiStorage } from '@/lib/wagmi';
import { getAddress, recoverMessageAddress } from 'viem';
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
  isMobileDevice,
} from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';

// Provider types for the custom login modal
export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'phantom' | 'trust' | 'rabby';

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
  connectWithWallet: (wallet: WalletProvider) => Promise<boolean>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  setRequiresUsername: (value: boolean) => void;
  setWagmiAuthIntent: (value: boolean) => void;
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
 * Normalize signature v value for viem's recoverMessageAddress.
 * Viem accepts only v=0,1,27,28. Web3Auth/Safe may return v=31,32 (Safe) or
 * EIP-155 v (chainId*2+35+recoveryId). Converts to 27 or 28.
 */
function normalizeSignatureV(sig: string): string {
  const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
  if (hex.length !== 130) return sig;
  const r = hex.slice(0, 64);
  const s = hex.slice(64, 128);
  const vRaw = parseInt(hex.slice(128, 130), 16);
  let v = vRaw;
  // viem accepts: 0, 1, 27, 28
  if (v === 0 || v === 1 || v === 27 || v === 28) return sig;
  // Safe uses v+4: 31→27, 32→28
  if (v === 31 || v === 32) v = v - 4;
  // EIP-155: v = chainId*2 + 35 + recoveryId → recoveryId = (v - 35) % 2
  else if (v >= 35) v = 27 + ((v - 35) % 2);
  else {
    console.warn('[Auth] Unknown signature v value:', vRaw, '- trying recoveryId extraction');
    v = 27 + (vRaw % 2); // fallback: use parity
  }
  return '0x' + r + s + v.toString(16).padStart(2, '0');
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
  // Ref to prevent concurrent auth flows (handleWagmiConnect fires multiple times due to deps)
  const wagmiAuthInProgressRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  const setWagmiAuthIntent = useCallback((value: boolean) => {
    console.log('[Auth] Setting wagmiAuthIntent:', value);
    wagmiAuthIntentRef.current = value;
  }, []);


  const openLoginModal = useCallback(() => {
    connectionAbortedRef.current = false;
    setIsLoginModalOpen(true);
    
    // Proactively init/check Web3Auth when modal opens
    initWeb3Auth()
      .then((instance) => setWeb3auth(instance))
      .catch((err) => console.warn('[Auth] Web3Auth init failed on modal open:', err));
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
      // Don't pre-warm Web3Auth on mount for mobile to avoid triggering Chrome's 'Abusive Ads' blocker
      // which often flags background iframes. We'll init it when the user opens the login modal.
      if (!isMobileDevice()) {
        console.log('[Auth] Pre-warming Web3Auth (Desktop)...');
        initWeb3Auth()
          .then((instance) => setWeb3auth(instance))
          .catch((err) => console.warn('Web3Auth pre-init failed:', err));
      }

      // Check if this is a redirect return from Web3Auth (mobile email/SMS login)
      const isRedirectReturn = hasRedirectResult();
      if (isRedirectReturn) {
        console.log('[Auth] Detected Web3Auth redirect result, will process after init');
        setIsLoading(false);
        return;
      }

      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet && !isTokenExpired()) {
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
    };

    init();
  }, []);

  // Wagmi Auto-connect logic
  useEffect(() => {
    const handleWagmiConnect = async () => {
      // Don't interfere if we're processing a redirect (mobile email/SMS login)
      // Don't interfere if we're processing a redirect (mobile email/SMS login)
      if (isProcessingRedirect || hasRedirectResult()) {
        console.log('[Auth] Skipping Wagmi auto-connect during redirect processing');
        return;
      }

      console.log('[Auth] Wagmi connection check:', { isWagmiConnected, wagmiAddress, isConnecting, isLoading, walletAddress });

      // If Wagmi connects (via AppKit or injected) and we are not authed yet
      if (isWagmiConnected && wagmiAddress && !isLoading) {
        // Guard against concurrent auth flows.
        // This effect re-fires when isConnecting changes (e.g. after setIsConnecting(true) inside),
        // which would start a second auth. The ref ensures only one flow runs at a time.
        if (wagmiAuthInProgressRef.current) {
          console.log('[Auth] Auth already in progress, skipping duplicate effect run');
          return;
        }

        // CASE A: Already authed with same address -> Sync state
        if (isAuthenticated && walletAddress?.toLowerCase() === wagmiAddress.toLowerCase()) {
            if (connectionSource !== 'wagmi') {
              console.log('[Auth] Syncing connection source to wagmi');
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
        const hasToken = !!getAuthToken() && !isTokenExpired();
        const isReturningWagmiUser = savedSource === 'wagmi' && hasToken;

        console.log('[Auth] handleWagmiConnect decision:', { 
          hasUserIntent, 
          isReturningWagmiUser, 
          savedSource, 
          hasToken 
        });

        if (!hasUserIntent && !isReturningWagmiUser) {
          // Wagmi auto-reconnected from localStorage but user didn't click "Connect Wallet"
          // and there's no valid DeHub session - silently disconnect to prevent unwanted auth popup
          console.log('[Auth] Wagmi auto-reconnected without user intent, disconnecting silently');

          // Clear source if no token - this prevents Reown from trying to switch network on next load
          if (!hasToken) {
            console.log('[Auth] No valid token found, clearing Wagmi storage');
            localStorage.removeItem('dehub_connection_source');
            clearWagmiStorage();
          }

          wagmiDisconnect();
          return;
        }

        console.log('[Auth] Wagmi connected, starting auth:', wagmiAddress,
          hasUserIntent ? '(user intent)' : '(returning user)');

        wagmiAuthInProgressRef.current = true;
        try {
          setIsConnecting(true);
          setConnectionSource('wagmi');
          localStorage.setItem('dehub_connection_source', 'wagmi');
          // Reset intent only after successful auth, or on error
          await completeDeHubAuthWagmi(wagmiAddress);
          wagmiAuthIntentRef.current = false;
          closeLoginModal();
        } catch (err) {
          console.error('[Auth] Wagmi auth failed:', err);
          wagmiAuthIntentRef.current = false; // Reset on failure too
          setConnectionSource(null);
          localStorage.removeItem('dehub_connection_source');
        } finally {
          wagmiAuthInProgressRef.current = false;
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
      // Find the best connector for in-app browser auto-connect:
      // prefer the generic injected() which picks up the wallet's window.ethereum
      const injectedConnector = connectors.find(c => c.id === 'injected')
        || connectors.find(c => c.id === 'io.metamask')
        || connectors.find(c => c.id === 'metaMaskSDK')
        || connectors.find(c => c.id === 'app.phantom');
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

    // Standard Wallets (MetaMask/Phantom) connected via Wagmi are EOAs.
    // They don't need deployment. We only deploy Smart Accounts for Social Login.
    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;
    
    console.log('[Auth] Requesting signature for address:', authAddress);
    console.log('[Auth] Message:', message);
    toast.info('Please sign the message in your wallet...');

    const signature = await signMessageAsync({ 
      message,
      account: authAddress as `0x${string}`
    });
    
    console.log('[Auth] Wagmi signature received, authenticating with backend...');

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

    if (authResponse.result?.isNewAccount) {
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
   * EOA mode: eth_accounts returns EOA address, personal_sign returns ECDSA.
   */
  const completeDeHubAuthAfterRedirect = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    const toastId = 'auth-redirect';
    console.log('[Auth] [REDIRECT] Starting DeHub authentication sequence...');
    toast.loading('Getting your account...', { id: toastId });

    try {
      const w3a = await getOrInitWeb3Auth();
      const userInfo = await w3a.getUserInfo();
      console.log('[Auth] [REDIRECT] User Info:', userInfo.email || userInfo.name || 'Found');
    } catch (e) {
      console.warn('[Auth] [REDIRECT] getUserInfo failed (ignoring):', e);
    }

    const signingProvider = provider;

    try {
      // Get AA address
      console.log('[Auth] [REDIRECT] Fetching accounts...');
      let accounts: string[] = [];
      for (let i = 0; i < 10; i++) {
        accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
        if (accounts?.length) break;
        console.log(`[Auth] [REDIRECT] No accounts yet, retry ${i+1}/10...`);
        await new Promise(r => setTimeout(r, 50));
      }

      if (!accounts?.length) {
        toast.error('Could not find your wallet address', { id: toastId });
        throw new Error('No accounts available from provider after redirect');
      }
      
      const authAddress = accounts[0].toLowerCase();
      console.log('[Auth] [REDIRECT] Account:', authAddress);


      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      console.log('[Auth] [REDIRECT] Requesting signature...');
      toast.loading('Please sign the message in your wallet...', { id: toastId });

      let signature: string;
      try {
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [message, authAddress],
        }) as string;
      } catch (e) {
        console.warn('[Auth] [REDIRECT] personal_sign failed, trying fallback...', e);
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [authAddress, message],
        }) as string;
      }
      
      // Same as POPUP: send (Smart Account, original signature) so backend builds correct message.
      // Backend verifies via ERC-1271 for Smart Accounts.
      let authAddressForApi = authAddress;
      let sigToRecover = signature;
      const ERC6492_MAGIC_R = '6492649264926492649264926492649264926492649264926492649264926492';
      const isERC6492R = signature.toLowerCase().endsWith(ERC6492_MAGIC_R);
      console.log('[Auth] [REDIRECT] Signature format:', { length: signature.length, isERC6492: isERC6492R });
      if (isERC6492R) {
        const innerSig = extractEoaSignatureFromErc6492(signature);
        if (innerSig) sigToRecover = innerSig;
      }
      if (sigToRecover.length === 132 || sigToRecover.length === 130) {
        try {
          const normalizedSig = normalizeSignatureV(sigToRecover);
          await recoverMessageAddress({ message, signature: normalizedSig as `0x${string}` });
          // Keep original signature for API
          console.log('[Auth] [REDIRECT] Smart Account: sending (SA, orig sig) for ERC-1271');
        } catch (e) {
          console.warn('[Auth] [REDIRECT] Recovery failed:', e);
        }
      }

      console.log('[Auth] [REDIRECT] Signature received, authenticating with backend...');
      toast.loading('Verifying with DeHub...', { id: toastId });

      const BASE_CHAIN_ID = 8453;
      const authResponse = await authenticateWallet(
        authAddressForApi,
        signature,
        timestamp,
        BASE_CHAIN_ID
      );

      const normalizedUser = normalizeUser(authResponse.user, authAddressForApi);

      localStorage.setItem('dehub_wallet', authAddressForApi);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

      setWalletAddress(authAddressForApi);
      setUser(normalizedUser);

    if (authResponse.result?.isNewAccount) {
      setRequiresUsername(true);
    }

    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-images'] });

    toast.success(normalizedUser.username ? 'Welcome back!' : 'Successfully logged in!', { id: 'auth-redirect' });
      console.log('[Auth] ✓ DeHub authentication complete (Redirect Flow)');
    } catch (err: any) {
      console.error('[Auth] [REDIRECT] Sequence failed:', err);
      toast.error(err.message || 'Authentication failed', { id: 'auth-redirect' });
      setIsProcessingRedirect(false);
      setIsLoading(false);
    }
  };

  /**
   * Complete DeHub authentication after Web3Auth connects.
   * EOA mode: eth_accounts returns EOA address, personal_sign returns ECDSA.
   */
  const completeDeHubAuth = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    const isSocial = isSocialLoginConnected();
    const toastId = 'auth-popup';
    console.log('[Auth] [POPUP] Connection type:', isSocial ? 'SOCIAL' : 'EXTERNAL');
    toast.loading('Getting your account...', { id: toastId });

    if (isSocial) {
      try {
        const w3a = await getOrInitWeb3Auth();
        const userInfo = await w3a.getUserInfo();
        console.log('[Auth] [POPUP] User:', userInfo.email || userInfo.name || 'Found');
      } catch (e) {
        console.warn('[Auth] [POPUP] getUserInfo failed:', e);
      }
    }

    const signingProvider = provider;

    try {
      // Get address from provider
      console.log('[Auth] [POPUP] Fetching accounts...');
      let accounts: string[] = [];
      for (let i = 0; i < 10; i++) {
        accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
        if (accounts?.length) break;
        await new Promise(r => setTimeout(r, 50));
      }
      
      if (!accounts?.length) throw new Error('No accounts available for signing');
      const authAddress = accounts[0].toLowerCase();
      console.log('[Auth] [POPUP] Address:', authAddress);


      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      console.log('[Auth] [POPUP] Requesting signature...');
      toast.loading('Please sign the message in your wallet...', { id: toastId });

      let signature: string;
      try {
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [message, authAddress],
        }) as string;
      } catch (e) {
        console.warn('[Auth] [POPUP] personal_sign fallback...', e);
        signature = await signingProvider.request({
          method: 'personal_sign',
          params: [authAddress, message],
        }) as string;
      }

      // Detect signature format for debugging
      const ERC6492_MAGIC = '6492649264926492649264926492649264926492649264926492649264926492';
      const isERC6492 = signature.toLowerCase().endsWith(ERC6492_MAGIC);
      console.log('[Auth] [POPUP] Signature format:', {
        length: signature.length,
        isERC6492,
        preview: signature.slice(0, 20) + '...' + signature.slice(-20),
      });

      // DeHub backend reconstructs message with the address we send: "Your wallet address is {address}".
      // The user signed a message with authAddress (Smart Account). So we MUST send (Smart Account, original signature)
      // so the backend builds the same message. Backend verifies via ERC-1271 for Smart Accounts.
      // Do NOT send recovered EOA — that would make the backend build a different message and verification would fail.
      let authAddressForApi = authAddress;
      if (isSocial) {
        let sigToRecover = signature;
        if (isERC6492) {
          const innerSig = extractEoaSignatureFromErc6492(signature);
          if (innerSig) sigToRecover = innerSig;
        }
        if (sigToRecover.length === 132 || sigToRecover.length === 130) {
          try {
            const normalizedSig = normalizeSignatureV(sigToRecover);
            await recoverMessageAddress({ message, signature: normalizedSig as `0x${string}` });
            // Keep original signature for API; only use normalized for recovery (debug/logging)
            console.log('[Auth] [POPUP] Smart Account: sending (SA, orig sig) for ERC-1271 verification');
          } catch (e) {
            console.warn('[Auth] [POPUP] Recovery failed:', e);
          }
        }
      }

      console.log('[Auth] [POPUP] Signature received, authenticating...');
      toast.loading('Verifying with DeHub...', { id: toastId });

      const BASE_CHAIN_ID = 8453;
      const authResponse = await authenticateWallet(
        authAddressForApi,
        signature,
        timestamp,
        BASE_CHAIN_ID
      );

      const normalizedUser = normalizeUser(authResponse.user, authAddressForApi);

      localStorage.setItem('dehub_wallet', authAddressForApi);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

      setWalletAddress(authAddressForApi);
      setUser(normalizedUser);

      if (authResponse.result?.isNewAccount) {
        setRequiresUsername(true);
      }

      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-images'] });

      toast.success(normalizedUser.username ? 'Welcome back!' : 'Successfully logged in!', { id: 'auth-popup' });
      console.log('[Auth] ✓ DeHub authentication complete (Popup Flow)');
    } catch (err: any) {
      console.error('[Auth] [POPUP] Sequence failed:', err);
      toast.error(err.message || 'Authentication failed', { id: 'auth-popup' });
    }
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

  const connectWithProvider = async (provider: SocialProvider, isRetry = false) => {
    setIsConnecting(true);
    setActiveProvider(provider);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');

    try {
      const socialProvider = mapSocialProvider(provider);
      const authProvider = await connectToSocialProvider(socialProvider);
      
      if (authProvider) {
        await completeDeHubAuth(authProvider);
        closeLoginModal();
      }
    } catch (error: any) {
      console.error(`${provider} login error:`, error);
      
      const errorMessage = error.message || String(error);
      if (!isCancellationError(errorMessage)) {
        // Auto-retry once on first failure (common when app/config not fully loaded)
        if (!isRetry) {
          console.log(`[Auth] First attempt failed, retrying in 2s...`);
          toast.info('Retrying...', { duration: 2000 });
          setConnectionSource(null);
          await forceCleanupWeb3Auth();
          await new Promise(r => setTimeout(r, 2000));
          return connectWithProvider(provider, true);
        }
        toast.error(`Failed to connect with ${provider}. Please try again.`);
      }
      
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      await forceCleanupWeb3Auth();
    } finally {
      setIsConnecting(false);
      setActiveProvider(null);
    }
  };

  const connectWithEmail = async (email: string, isRetry = false) => {
    setIsConnecting(true);
    setActiveProvider('email');
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');

    try {
      const authProvider = await connectToSocialProvider(AUTH_CONNECTION.EMAIL_PASSWORDLESS, email);
      
      if (authProvider) {
        await completeDeHubAuth(authProvider);
        closeLoginModal();
      }
    } catch (error: any) {
      console.error('Email login error:', error);
      const errorMessage = error.message || String(error);
      if (!isCancellationError(errorMessage)) {
        if (!isRetry) {
          console.log('[Auth] Email login first attempt failed, retrying in 2s...');
          toast.info('Retrying...', { duration: 2000 });
          setConnectionSource(null);
          await forceCleanupWeb3Auth();
          await new Promise(r => setTimeout(r, 2000));
          return connectWithEmail(email, true);
        }
        toast.error('Failed to send magic link. Please check your email and try again.');
      }
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      await forceCleanupWeb3Auth();
    } finally {
      setIsConnecting(false);
      setActiveProvider(null);
    }
  };

  const connectWithSMS = async (phone: string, isRetry = false) => {
    setIsConnecting(true);
    setActiveProvider('sms');
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');

    try {
      const authProvider = await connectToSocialProvider(AUTH_CONNECTION.SMS_PASSWORDLESS, phone);
      
      if (authProvider) {
        await completeDeHubAuth(authProvider);
        closeLoginModal();
      }
    } catch (error: any) {
      console.error('SMS login error:', error);
      const errorMessage = error.message || String(error);
      if (!isCancellationError(errorMessage)) {
        if (!isRetry) {
          console.log('[Auth] SMS login first attempt failed, retrying in 2s...');
          toast.info('Retrying...', { duration: 2000 });
          setConnectionSource(null);
          await forceCleanupWeb3Auth();
          await new Promise(r => setTimeout(r, 2000));
          return connectWithSMS(phone, true);
        }
        toast.error('Failed to send verification code. Please check your number and try again.');
      }
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      await forceCleanupWeb3Auth();
    } finally {
      setIsConnecting(false);
      setActiveProvider(null);
    }
  };

  // connectWithWallet is kept for backward compatibility but wallet buttons in LoginModal
  // now use RainbowKit's WalletButton.Custom which calls wagmi connectAsync internally.
  // The handleWagmiConnect effect picks up the connection and completes DeHub auth.
  const connectWithWallet = async (wallet: WalletProvider): Promise<boolean> => {
    console.log('[Auth] connectWithWallet called:', wallet);
    setIsConnecting(true);
    setWagmiAuthIntent(true);
    localStorage.setItem('dehub_connection_source', 'wagmi');

    try {
      console.log('[Auth] Available connectors:', connectors.map(c => ({ id: c.id, name: c.name })));

      const walletMap: Record<string, string[]> = {
        metamask: ['metaMaskSDK', 'io.metamask', 'metaMask'],
        phantom: ['app.phantom', 'phantom'],
        trust: ['trust', 'trustWallet'],
        rabby: ['rabby', 'rabbyWallet'],
      };
      const ids = walletMap[wallet] || [];
      let connector = connectors.find(c =>
        ids.some(id => c.id === id || c.name.toLowerCase().includes(id.toLowerCase()))
      ) || connectors.find(c => c.id === 'injected');

      if (!connector) {
        throw new Error(`Connector for ${wallet} not found`);
      }

      console.log(`[Auth] Connecting with: ${connector.name} (${connector.id})`);
      await connectAsync({ connector });
      return true;
    } catch (err: any) {
      console.error('[Auth] Wallet connection failed:', err);
      setIsConnecting(false);
      setWagmiAuthIntent(false);
      localStorage.removeItem('dehub_connection_source');

      const fullError = (err.message || '').toLowerCase() + ' ' + (err.cause?.message || '').toLowerCase();
      if (fullError.includes('rejected') || fullError.includes('denied')) {
        toast.error('Connection rejected');
      } else {
        const names: Record<string, string> = { metamask: 'MetaMask', phantom: 'Phantom', trust: 'Trust Wallet', rabby: 'Rabby' };
        toast.error(`Failed to connect to ${names[wallet] || wallet}. Please try again.`);
      }
      return false;
    }
  };

  const disconnect = async () => {
    try {
      if (connectionSource === 'web3auth') {
        await disconnectWeb3Auth();
      } else {
        wagmiDisconnect();
      }
      
      clearAuthSession();
      localStorage.removeItem('dehub_user');
      localStorage.removeItem('dehub_wallet');
      localStorage.removeItem('dehub_connection_source');
      clearWagmiStorage();
      
      setWalletAddress(null);
      setUser(null);
      setConnectionSource(null);
      
      queryClient.clear();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const refreshUser = async () => {
    if (!walletAddress) return;
    try {
      const userData = await getAccountInfo(walletAddress);
      const normalizedUser = normalizeUser(userData, walletAddress);
      setUser(normalizedUser);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token || isTokenExpired()) {
      return false;
    }
    return true;
  };

  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const connect = async () => {
    openLoginModal();
  };

  const value = {
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
    setWagmiAuthIntent,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
