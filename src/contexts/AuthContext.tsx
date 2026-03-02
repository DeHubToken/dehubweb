/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Uses Web3Auth Modal SDK v10 with Pimlico AA for social/email/SMS login.
 * AA is used for on-chain transactions; auth signing uses standard ECDSA.
 * Wagmi handles external wallet connections.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@/lib/logger';
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
import { disconnectDmSocket, reconnectDmSocket } from '@/lib/api/dehub/dm-socket';
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

const authLogger = createLogger('Auth');

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
  // Compute badgeBalance: use API value, or fallback to sum of balanceData
  const rawBadgeBalance = safe.badgeBalance;
  const numericRaw = typeof rawBadgeBalance === 'string' ? parseFloat(rawBadgeBalance) : (typeof rawBadgeBalance === 'number' ? rawBadgeBalance : NaN);
  const computedFromBalanceData = safe.balanceData?.reduce((sum, b) => sum + (b.walletBalance || 0) + (b.staked || 0), 0) ?? 0;
  const badgeBalance = (Number.isFinite(numericRaw) && numericRaw > 0) ? numericRaw : computedFromBalanceData;
  console.warn('[normalizeUser] badge resolution', {
    username: safe.username,
    rawBadgeBalance,
    rawType: typeof rawBadgeBalance,
    computedFromBalanceData,
    finalBadgeBalance: badgeBalance,
    balanceDataLength: safe.balanceData?.length ?? 0,
  });
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
    badgeBalance,
    balanceData: safe.balanceData,
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

/**
 * Sign an auth message using the EOA private key directly.
 * Web3Auth with AA wraps personal_sign in ERC-6492 (Safe smart account),
 * which the backend cannot verify via ecrecover. This bypasses the AA
 * wrapper by extracting the raw private key and signing with viem.
 *
 * Returns { address, signature } for the EOA, or null if private key
 * is not available (fallback to the AA-wrapped flow).
 */
async function signWithEoaDirectly(
  provider: any,
  timestamp: number,
  displayedDate: Date,
): Promise<{ address: string; signature: string } | null> {
  try {
    // Web3Auth v10 with AA does NOT expose eth_private_key on any provider.
    // Instead, we find the underlying EOA provider and call personal_sign on it.
    // The EOA provider produces a standard ECDSA signature (132 chars),
    // unlike the AA provider which wraps it in ERC-6492 (2242 chars).

    let eoaProvider: any = null;

    // 1. Try AA provider's state.eoaProvider (primary path)
    try {
      const w3a = await getOrInitWeb3Auth();
      const aaProvider = (w3a as any).aaProvider || (w3a as any).accountAbstractionProvider;
      if (aaProvider?.state?.eoaProvider) {
        eoaProvider = aaProvider.state.eoaProvider;
        console.log('[Auth] EOA direct sign: found eoaProvider via Web3Auth AA provider state');
      }
      // 2. Try commonJRPCProvider (the EOA provider before AA wrapping)
      if (!eoaProvider) {
        const commonProvider = (w3a as any).commonJRPCProvider;
        if (commonProvider) {
          eoaProvider = commonProvider;
          console.log('[Auth] EOA direct sign: found commonJRPCProvider on Web3Auth instance');
        }
      }
    } catch (e) {
      console.warn('[Auth] EOA direct sign: could not access Web3Auth internals:', e);
    }

    // 3. Try the passed provider's own state.eoaProvider
    if (!eoaProvider && provider?.state?.eoaProvider) {
      eoaProvider = provider.state.eoaProvider;
      console.log('[Auth] EOA direct sign: found eoaProvider in passed provider state');
    }

    if (!eoaProvider) {
      console.warn('[Auth] EOA direct sign: no EOA provider found, cannot produce standard ECDSA signature');
      return null;
    }

    // Get the EOA address from the EOA provider
    let accounts: string[];
    try {
      accounts = await eoaProvider.request({ method: 'eth_accounts' }) as string[];
    } catch {
      try {
        accounts = await eoaProvider.request({ method: 'eth_requestAccounts' }) as string[];
      } catch (e2) {
        console.warn('[Auth] EOA direct sign: could not get accounts from EOA provider:', e2);
        return null;
      }
    }

    if (!accounts || accounts.length === 0) {
      console.warn('[Auth] EOA direct sign: EOA provider returned no accounts');
      return null;
    }

    const eoaAddress = accounts[0].toLowerCase();
    console.log('[Auth] EOA direct sign: EOA address:', eoaAddress);

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${eoaAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    // Call personal_sign on the EOA provider (NOT the AA provider)
    // This produces a standard ECDSA signature the backend can verify
    const signature = await eoaProvider.request({
      method: 'personal_sign',
      params: [
        `0x${Buffer.from(message, 'utf8').toString('hex')}`,
        eoaAddress,
      ],
    }) as string;

    console.log('[Auth] EOA direct sign: signature produced, length:', signature.length);

    if (signature.length > 200) {
      console.warn('[Auth] EOA direct sign: signature is suspiciously long (' + signature.length + ' chars), may still be ERC-6492 wrapped');
    }

    return { address: eoaAddress, signature };
  } catch (e) {
    console.warn('[Auth] EOA direct sign failed, falling back to provider signing:', e);
    return null;
  }
}
/**
 * Sign auth message using the provider's personal_sign (original flow).
 * Used for external wallets and as fallback when EOA direct sign is unavailable.
 */
async function signWithProvider(
  provider: any,
  displayedDate: Date,
  flowLabel: string,
): Promise<{ address: string; signature: string }> {
  console.log(`[Auth] [${flowLabel}] Fetching accounts...`);
  let accounts: string[] = [];
  for (let i = 0; i < 10; i++) {
    accounts = await provider.request({ method: 'eth_accounts' }) as string[];
    if (accounts?.length) break;
    await new Promise(r => setTimeout(r, 50));
  }
  if (!accounts?.length) throw new Error('No accounts available for signing');
  const address = accounts[0].toLowerCase();
  console.log(`[Auth] [${flowLabel}] Address:`, address);

  const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;

  console.log(`[Auth] [${flowLabel}] Requesting signature...`);
  let signature: string;
  try {
    signature = await provider.request({
      method: 'personal_sign',
      params: [message, address],
    }) as string;
  } catch (e) {
    console.warn(`[Auth] [${flowLabel}] personal_sign fallback...`, e);
    signature = await provider.request({
      method: 'personal_sign',
      params: [address, message],
    }) as string;
  }

  console.log(`[Auth] [${flowLabel}] Signature format:`, {
    length: signature.length,
    preview: signature.slice(0, 20) + '...' + signature.slice(-20),
  });

  return { address, signature };
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
  // State mirror of wagmiAuthIntentRef — allows handleWagmiConnect effect to re-fire when
  // user clicks "Connect Wallet" even if wagmi is already connected (ref changes don't trigger effects).
  const [wagmiAuthIntentState, setWagmiAuthIntentState] = useState(false);
  // Ref to prevent concurrent auth flows (handleWagmiConnect fires multiple times due to deps)
  const wagmiAuthInProgressRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  const setWagmiAuthIntent = useCallback((value: boolean) => {
    console.log('[Auth] Setting wagmiAuthIntent:', value);
    wagmiAuthIntentRef.current = value;
    setWagmiAuthIntentState(value);
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
  }, [isConnecting, walletAddress, connectionSource]);

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

  // Reconnect DM socket when user logs in (ensures fresh connection with new token/address)
  useEffect(() => {
    if (user && walletAddress && getAuthToken()) {
      reconnectDmSocket();
    }
  }, [user, walletAddress]);

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

        // CASE B: Already authed with DIFFERENT address
        if (walletAddress && walletAddress.toLowerCase() !== wagmiAddress.toLowerCase()) {
            const savedSrc = localStorage.getItem('dehub_connection_source');
            // If active session is Web3Auth (social/email/SMS), Smart Account address will ALWAYS
            // differ from any external wallet. Just silently disconnect Wagmi — don't wipe the session.
            if (connectionSource === 'web3auth' || savedSrc === 'web3auth') {
              console.log('[Auth] Address mismatch but Web3Auth session active - silently disconnecting Wagmi');
              clearWagmiStorage();
              wagmiDisconnect();
              return;
            }
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
          // and there's no valid DeHub session. Keep wagmi connected so user can click
          // "Connect Wallet" and go straight to signature without a fresh connection.
          console.log('[Auth] Wagmi auto-reconnected without user intent, keeping connection alive');
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
          setWagmiAuthIntent(false);
          closeLoginModal();
        } catch (err) {
          console.error('[Auth] Wagmi auth failed:', err);
          setWagmiAuthIntent(false); // Reset on failure too
          setConnectionSource(null);
          localStorage.removeItem('dehub_connection_source');
        } finally {
          wagmiAuthInProgressRef.current = false;
          setIsConnecting(false);
        }
      }
    };

    handleWagmiConnect();
  }, [isWagmiConnected, wagmiAddress, isAuthenticated, isConnecting, isLoading, walletAddress, connectionSource, isProcessingRedirect, wagmiAuthIntentState]);


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

      setWagmiAuthIntent(true);
      try {
        await connectAsync({ connector: injectedConnector });
        // wagmi useEffect will pick up the connection and start DeHub auth
      } catch (err) {
        console.warn('[Auth] In-app browser auto-connect failed:', err);
        setWagmiAuthIntent(false);
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

    let signature: string;
    try {
      signature = await signMessageAsync({ 
        message,
        account: address as `0x${string}`,
      });
    } catch (signError: any) {
      console.error('[Auth] signMessageAsync failed:', signError);
      const userRejected = signError?.code === 4001 || signError?.message?.includes('rejected');
      toast.error(userRejected ? 'Signature rejected. Please try again.' : 'Wallet signature failed. Please try again.');
      throw signError;
    }
    
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
    authLogger.info('Login success', { method: 'wagmi', address: authAddress, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
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
      let authAddressForApi: string;
      let signature: string;

      // Social login redirect: use AA provider directly for Smart Account address + ERC-1271 signature.
      // Backend verifies via ERC-1271 (same as mobile app flow).
      const result = await signWithProvider(signingProvider, displayedDate, 'REDIRECT');
      authAddressForApi = result.address;
      signature = result.signature;
      console.log('[Auth] [REDIRECT] Using AA provider signature for Smart Account:', authAddressForApi);

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
      authLogger.info('Login success', { method: 'redirect', address: authAddressForApi, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
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
    toast.loading('Setting up your account...', { id: toastId });

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
      let authAddressForApi: string;
      let signature: string;

      // For social logins (Web3Auth AA), use the AA provider directly.
      // eth_accounts returns the Smart Account address (matches mobile app).
      // personal_sign produces an ERC-1271 compatible signature.
      // Backend verifies via ERC-1271 for Smart Accounts (same as mobile app flow).
      // DO NOT use signWithEoaDirectly here — it returns the EOA address which maps
      // to a different DeHub account (@chadman) instead of the Smart Account account (@early).
      if (isSocial) {
        const result = await signWithProvider(signingProvider, displayedDate, 'POPUP');
        authAddressForApi = result.address;
        signature = result.signature;
        console.log('[Auth] [POPUP] Using AA provider signature for Smart Account:', authAddressForApi);
      } else {
        // External wallet — standard provider signing
        const result = await signWithProvider(signingProvider, displayedDate, 'POPUP');
        authAddressForApi = result.address;
        signature = result.signature;
      }

      console.log('[Auth] [POPUP] Signature received, authenticating...');
      toast.loading('Almost there...', { id: toastId });

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
      authLogger.info('Login success', { method: 'popup', address: authAddressForApi, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
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

    // Show immediate feedback before popup opens
    toast.loading(`Connecting to ${provider === 'google' ? 'Google' : provider === 'twitter' ? 'X' : provider}...`, { id: 'auth-popup' });

    try {
      const socialProvider = mapSocialProvider(provider);
      const authProvider = await connectToSocialProvider(socialProvider);
      
      if (authProvider) {
        await completeDeHubAuth(authProvider);
        closeLoginModal();
      }
    } catch (error: any) {
      toast.dismiss('auth-popup');
      console.error(`${provider} login error:`, error);
      
      const errorMessage = error.message || String(error);
      if (!isCancellationError(errorMessage)) {
        // Log to backend for debugging
        authLogger.error(`Social login failed: ${provider}`, {
          provider,
          errorMessage,
          isRetry,
          userAgent: navigator.userAgent,
        }, error);

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
        authLogger.error('Email login failed', {
          provider: 'email_passwordless',
          errorMessage,
          isRetry,
          userAgent: navigator.userAgent,
        }, error);

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
        authLogger.error('SMS login failed', {
          provider: 'sms_passwordless',
          errorMessage,
          isRetry,
          userAgent: navigator.userAgent,
        }, error);

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

      disconnectDmSocket();
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
    // If token is still valid, no refresh needed
    const token = getAuthToken();
    if (token && !isTokenExpired()) return true;

    // For wagmi users: if wagmi is still connected, re-sign silently
    const savedSource = localStorage.getItem('dehub_connection_source');
    if ((connectionSource === 'wagmi' || savedSource === 'wagmi') && isWagmiConnected && wagmiAddress) {
      try {
        console.log('[Auth] Attempting silent wagmi re-auth for', wagmiAddress);
        setConnectionSource('wagmi');
        localStorage.setItem('dehub_connection_source', 'wagmi');
        await completeDeHubAuthWagmi(wagmiAddress);
        return true;
      } catch (e) {
        console.warn('[Auth] Silent wagmi re-auth failed:', e);
        return false;
      }
    }

    // For Web3Auth users: if Web3Auth is still connected, re-sign
    if (connectionSource === 'web3auth' || savedSource === 'web3auth') {
      try {
        const w3a = await getOrInitWeb3Auth();
        if (w3a.connected && w3a.provider) {
          console.log('[Auth] Attempting silent Web3Auth re-auth');
          await completeDeHubAuth(w3a.provider);
          return true;
        }
      } catch (e) {
        console.warn('[Auth] Silent Web3Auth re-auth failed:', e);
        return false;
      }
    }

    return false;
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
