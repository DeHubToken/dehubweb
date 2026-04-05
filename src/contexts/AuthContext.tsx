/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Uses Web3Auth Modal SDK v10 with Pimlico AA for social/email/SMS login.
 * Social logins sign via Smart Account (EIP-1271) and send the SA address to backend.
 * External wallets (Wagmi) sign with standard ECDSA and send EOA address to backend.
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


import {
  authenticateWallet,
  getAccountInfo,
  getAuthToken,
  getRefreshToken,
  clearAuthSession,
  isTokenExpired,
  apiCall,
  refreshAccessToken,
  logoutFromServer,
  type DeHubUser,
  type Web3AuthMeta,
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
  isWalletInAppBrowser,
} from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';

const authLogger = createLogger('Auth');

// Provider types for the custom login modal
export type SocialProvider = 'google' | 'twitter' | 'telegram' | 'apple' | 'discord' | 'github';
export type WalletProvider = 'metamask' | 'phantom' | 'trust';

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
  patchUser: (patch: Partial<DeHubUser>) => void;
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
    avatarImageUrl: safe.avatarImageUrl || safe.avatarUrl || safe.avatar_url || null,
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
 * Build web3AuthMeta from Web3Auth userInfo for the auth request.
 */
async function getWeb3AuthMeta(): Promise<Web3AuthMeta | undefined> {
  try {
    const w3a = await getOrInitWeb3Auth();
    const info: any = await w3a.getUserInfo();
    if (!info) return undefined;
    return {
      typeOfLogin: info.typeOfLogin,
      verifier: info.verifier,
      verifierId: info.verifierId,
      email: info.email,
      name: info.name,
      profileImage: info.profileImage,
    };
  } catch (e) {
    console.warn('[Auth] Could not get Web3Auth user info for meta:', e);
    return undefined;
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

  // Hydrate user/wallet immediately from localStorage to prevent zombie state on mobile refresh.
  // Without this, the UI renders with null user while the async init makes network calls.
  // If those calls fail (common on flaky mobile connections), the session is cleared
  // even though the token is valid, leaving the user visually "signed in" but unable to interact.
  const [user, setUser] = useState<DeHubUser | null>(() => {
    try {
      const cached = localStorage.getItem('dehub_user');
      if (cached) return JSON.parse(cached) as DeHubUser;
    } catch {}
    return null;
  });
  const [walletAddress, setWalletAddress] = useState<string | null>(
    () => localStorage.getItem('dehub_wallet')
  );
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
  // Ref to prevent repeated silent-reconnect attempts within one session
  const wagmiSilentReconnectAttemptedRef = useRef(false);

  // User is "authenticated" if they have a valid access token OR a refresh token
  // (refresh token means we can silently get a new access token without wallet interaction)
  const isAuthenticated = !!user && !!walletAddress && (
    (!!getAuthToken() && !isTokenExpired()) || !!getRefreshToken()
  );

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
      // Exception: returning Web3Auth users on mobile need it for session refresh.
      const savedConnectionSource = localStorage.getItem('dehub_connection_source');
      const hasValidSession = getAuthToken() && !isTokenExpired();
      // Delay Web3Auth pre-warm until browser is idle (or 5s max) so it doesn't compete
      // with LCP resources. auth.web3auth.io loads ~1.7MB of assets on init.
      const schedulePreWarm = (cb: () => void, timeout: number) => {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(cb, { timeout });
        } else {
          setTimeout(cb, timeout);
        }
      };

      if (!isMobileDevice()) {
        schedulePreWarm(() => {
          console.log('[Auth] Pre-warming Web3Auth (Desktop, idle)...');
          initWeb3Auth()
            .then((instance) => setWeb3auth(instance))
            .catch((err) => console.warn('Web3Auth pre-init failed:', err));
        }, 5000);
      } else if (savedConnectionSource === 'web3auth' && hasValidSession) {
        schedulePreWarm(() => {
          console.log('[Auth] Pre-warming Web3Auth (Mobile - returning social login user)...');
          initWeb3Auth()
            .then((instance) => setWeb3auth(instance))
            .catch((err) => console.warn('Web3Auth mobile pre-init failed:', err));
        }, 5000);
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
            
            // Validate token server-side by making an authenticated API call.
            // getAccountInfo is a public endpoint that succeeds even with invalid tokens.
            // This call will throw AuthenticationError (401) if the token is actually invalid.
            try {
              await apiCall('/api/notification/unread-count', { requiresAuth: true });
            } catch (tokenValidationError: any) {
              // If the token is rejected server-side, clear the zombie session
              if (tokenValidationError?.name === 'AuthenticationError' || 
                  tokenValidationError?.message?.includes('Session expired') ||
                  tokenValidationError?.message?.includes('Authentication required')) {
                console.warn('[Auth] Token invalid server-side, clearing zombie session');
                clearAuthSession();
                localStorage.removeItem('dehub_user');
                setUser(null);
                setWalletAddress(null);
                setIsLoading(false);
                return;
              }
              // Non-auth errors (network etc.) — proceed with session anyway
              console.warn('[Auth] Token validation call failed (non-auth), proceeding:', tokenValidationError?.message);
            }
            
            const normalizedUser = normalizeUser(userData, savedWallet);
            
            setUser(normalizedUser);
            setWalletAddress(savedWallet);
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            
            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error: any) {
            // Distinguish auth errors from network errors.
            // Auth errors (401, token invalid) → clear the session.
            // Network errors (timeout, DNS, offline) → keep the cached session
            // so mobile users aren't logged out by flaky connections.
            const isAuthError = error?.name === 'AuthenticationError' ||
              error?.message?.includes('Session expired') ||
              error?.message?.includes('Authentication required');
            
            if (isAuthError) {
              console.error('[Auth] Session restoration failed (auth error), clearing:', error?.message);
              clearAuthSession();
              localStorage.removeItem('dehub_user');
              setUser(null);
              setWalletAddress(null);
            } else {
              // Network error — keep cached user from localStorage hydration.
              // The token is still valid client-side, user can interact.
              console.warn('[Auth] Session restoration failed (network), keeping cached session:', error?.message);
              // user + walletAddress are already hydrated from localStorage initializers
            }
          }
        } else if (token && isTokenExpired()) {
          // Token expired — try refresh token before logging user out
          console.log('[Auth] Token expired on mount, attempting silent refresh...');
          const refreshed = await refreshAccessToken();
          if (refreshed && savedWallet) {
            console.log('[Auth] ✓ Silent refresh on mount succeeded, restoring session');
            try {
              const userData = await getAccountInfo(savedWallet);
              const normalizedUser = normalizeUser(userData, savedWallet);
              setUser(normalizedUser);
              setWalletAddress(savedWallet);
              localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
              if (!normalizedUser.username) setRequiresUsername(true);
            } catch {
              // If account fetch fails, at least keep the cached user
              const cachedUser = localStorage.getItem('dehub_user');
              if (cachedUser) {
                try {
                  const parsed = JSON.parse(cachedUser);
                  setUser(parsed);
                  setWalletAddress(savedWallet);
                } catch { /* ignore */ }
              }
            }
          } else {
            console.log('[Auth] Refresh failed, clearing expired session');
            clearAuthSession();
            localStorage.removeItem('dehub_user');
            setUser(null);
            setWalletAddress(null);
          }
        } else if (!token) {
          // No token at all — clear any stale hydrated state
          setUser(null);
          setWalletAddress(null);
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

  // ── Proactive Token Refresh Timer ──
  // Checks every 60s if the access token is about to expire or already expired.
  // Refreshes silently using the refresh token — user never sees a 401.
  useEffect(() => {
    if (!user || !walletAddress) return;

    const tryProactiveRefresh = async () => {
      // Support both new (dehub_token_expires_at) and legacy (dehub_token_timestamp + 24h) storage
      let timeUntilExpiry: number;
      const expiresAtStr = localStorage.getItem('dehub_token_expires_at');
      if (expiresAtStr) {
        timeUntilExpiry = parseInt(expiresAtStr, 10) - Date.now();
      } else {
        const timestampStr = localStorage.getItem('dehub_token_timestamp');
        if (!timestampStr) return; // No token info at all
        const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
        timeUntilExpiry = parseInt(timestampStr, 10) + TOKEN_EXPIRY_MS - Date.now();
      }

      // Refresh if token expires within 5 minutes OR has already expired
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('[Auth] Proactive refresh — token expires in', Math.round(timeUntilExpiry / 1000), 's');
        const result = await refreshAccessToken();
        if (result) {
          console.log('[Auth] ✓ Proactive token refresh succeeded');
        } else {
          console.warn('[Auth] Proactive refresh failed — will retry or fall back on next 401');
        }
      }
    };

    // Run immediately on mount (catches already-expired tokens when tab returns from background)
    tryProactiveRefresh();

    const intervalId = setInterval(tryProactiveRefresh, 60 * 1000);

    // Also refresh when user comes back to the tab after being away
    const handleVisibilityChange = () => {
      if (!document.hidden) tryProactiveRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
      // Trust Wallet injects isTrust/isTrustWallet on window.ethereum even when the user
      // enables "Desktop Mode" in its in-app browser (which changes the UA to desktop).
      // Coinbase Wallet desktop extension ALSO sets isCoinbaseWallet, so we deliberately
      // do NOT include it here to avoid triggering auto-connect for desktop extension users.
      const eth = (window as any).ethereum;
      const isWalletInAppBrowser = hasInjected && (!!eth?.isTrust || !!eth?.isTrustWallet);
      const alreadyAttempted = sessionStorage.getItem('dehub_wallet_auto_connect_attempted');
      // Check existing session synchronously (no API call)
      const hasExistingSession = !!getAuthToken() && !isTokenExpired();

      // Don't auto-connect if we're returning from a Web3Auth redirect (email/SMS login)
      if (!(isMobile || isWalletInAppBrowser) || !hasInjected || hasExistingSession || alreadyAttempted || hasRedirectResult()) {
        return;
      }

      // Mark as attempted to prevent retry loops
      sessionStorage.setItem('dehub_wallet_auto_connect_attempted', 'true');

      console.log('[Auth] Mobile/wallet in-app browser detected, auto-connecting immediately...');
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
      } catch (err: any) {
        const isAlreadyConnected =
          err?.name === 'ConnectorAlreadyConnectedError' ||
          err?.message?.toLowerCase().includes('already connected');
        if (isAlreadyConnected) {
          // Connector is already connected (returning user / page reload).
          // wagmiAuthIntent is still true → handleWagmiConnect will fire and complete DeHub auth.
          console.log('[Auth] In-app browser: connector already connected, DeHub auth will proceed');
        } else {
          console.warn('[Auth] In-app browser auto-connect failed:', err);
          setWagmiAuthIntent(false);
        }
      }
    };

    autoConnectInAppBrowser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONCE on mount - no deps to avoid re-runs

  // Silent wagmi reconnect for wallet in-app browsers (Trust Wallet, MetaMask mobile).
  // Handles the case where the user has a valid DeHub session (wagmi source) but the
  // wagmi/WalletConnect connection dropped — e.g. Trust Wallet browser got stuck on a
  // gas error, user closed and reopened the app. autoConnectInAppBrowser skips when
  // hasExistingSession=true, so without this effect posting would fail with "No wallet connected".
  useEffect(() => {
    if (!isAuthenticated || connectionSource !== 'wagmi' || isLoading || isConnecting) return;
    if (isWagmiConnected) return; // Wagmi is fine — nothing to do

    const eth = (window as any).ethereum;
    const isInWalletBrowser = isMobileDevice() || !!eth?.isTrust || !!eth?.isTrustWallet;
    if (!isInWalletBrowser || !eth) return;

    if (wagmiSilentReconnectAttemptedRef.current) return;
    wagmiSilentReconnectAttemptedRef.current = true;

    const injectedConnector = connectors.find(c => c.id === 'injected');
    if (!injectedConnector) return;

    console.log('[Auth] Stale wagmi detected — silently reconnecting for existing session...');
    connectAsync({ connector: injectedConnector }).catch((err: any) => {
      const isAlreadyConnected =
        err?.name === 'ConnectorAlreadyConnectedError' ||
        err?.message?.toLowerCase().includes('already connected');
      if (isAlreadyConnected) {
        // Already connected — handleWagmiConnect CASE A will sync the state
        return;
      }
      // Reconnect genuinely failed — wallet is not available.
      // Log the user out so they land in a clean state instead of being
      // stuck "logged in" but unable to sign or send transactions.
      console.warn('[Auth] Silent wagmi reconnect failed, logging out:', err);
      toast.info('Your wallet connection was lost. Please log in again.');
      disconnect();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, connectionSource, isWagmiConnected, isLoading, isConnecting]);

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

    // Address guard: prevent silent account switch during session refresh
    if (walletAddress && walletAddress.toLowerCase() !== authAddress.toLowerCase()) {
      console.error('[Auth] Address mismatch during refresh!', { expected: walletAddress, got: authAddress });
      throw new Error('Wallet address changed during session refresh. Please sign in again.');
    }

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
      sessionStorage.setItem('dehub_is_new_account', 'true');
    } else {
      sessionStorage.removeItem('dehub_is_new_account');
    }

    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-images'] });

    toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!');
    console.log('[Auth] ✓ DeHub authentication complete (Wagmi)');
    authLogger.info('Login success', { method: 'wagmi', address: authAddress, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
  };


  /**
   * Complete DeHub auth specifically after redirect flow (mobile email/SMS).
   * Uses Smart Account address + EIP-1271 signature for social logins.
   */
  const completeDeHubAuthAfterRedirect = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    const toastId = 'auth-redirect';
    console.log('[Auth] [REDIRECT] Starting DeHub authentication sequence...');
    toast.loading('Getting your account...', { id: toastId });

    // Gather web3AuthMeta for the auth request
    const web3AuthMeta = await getWeb3AuthMeta();

    try {
      const BASE_CHAIN_ID = 8453;

      // Smart Account only (no EOA fallback)
      let smartAccountAddress: string | null = null;
      try {
        const w3a = await getOrInitWeb3Auth();
        const aaProvider = (w3a as any).aaProvider || (w3a as any).accountAbstractionProvider;
        if (aaProvider) {
          const aaAccts = await aaProvider.request({ method: 'eth_accounts' }) as string[];
          smartAccountAddress = aaAccts[0]?.toLowerCase() || null;
        }
      } catch (e) {
        console.warn('[Auth] [REDIRECT] Could not get Smart Account address:', e);
      }

      if (smartAccountAddress) {
        let saResult: { address: string; signature: string } | null = null;
        try {
          const w3a = await getOrInitWeb3Auth();
          const aaProvider = (w3a as any).aaProvider || (w3a as any).accountAbstractionProvider;
          if (aaProvider) {
            const aaSign = await signWithProvider(aaProvider, displayedDate, 'REDIRECT-SA');
            if (aaSign.address.toLowerCase() === smartAccountAddress.toLowerCase()) {
              saResult = aaSign;
              console.log('[Auth] [REDIRECT] Using AA provider sig for Smart Account, length:', aaSign.signature.length);
            }
          }
        } catch (e) {
          console.warn('[Auth] [REDIRECT] AA provider sign failed:', e);
        }
        if (saResult) {
          // Address guard: prevent silent account switch during session refresh
          if (walletAddress && walletAddress.toLowerCase() !== saResult.address.toLowerCase()) {
            console.error('[Auth] [REDIRECT] Address mismatch during refresh!', { expected: walletAddress, got: saResult.address });
            throw new Error('Wallet address changed during session refresh. Please sign in again.');
          }
          console.log('[Auth] [REDIRECT] Trying Smart Account address:', smartAccountAddress);
          const saAuthResponse = await authenticateWallet(saResult.address, saResult.signature, timestamp, BASE_CHAIN_ID, web3AuthMeta);
          const normalizedUser = normalizeUser(saAuthResponse.user, saResult.address);
          localStorage.setItem('dehub_wallet', saResult.address);
          localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
          setWalletAddress(saResult.address);
          setUser(normalizedUser);
          if (saAuthResponse.result?.isNewAccount) { setRequiresUsername(true); sessionStorage.setItem('dehub_is_new_account', 'true'); } else { sessionStorage.removeItem('dehub_is_new_account'); }
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
          toast.success(saAuthResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!', { id: toastId });
          console.log('[Auth] ✓ DeHub authentication complete via Smart Account (Redirect Flow)');
          authLogger.info('Login success', { method: 'redirect-sa', address: saResult.address, username: normalizedUser.username, isNewAccount: !!saAuthResponse.result?.isNewAccount });
          return;
        }
      }
      if (smartAccountAddress) {
        throw new Error('Smart Account authentication failed.');
      }
      throw new Error('No Smart Account address available.');
    } catch (err: any) {
      console.error('[Auth] [REDIRECT] Sequence failed:', err);
      toast.error(err.message || 'Authentication failed', { id: 'auth-redirect' });
      setIsProcessingRedirect(false);
      setIsLoading(false);
    }
  };

  /**
   * Complete DeHub authentication after Web3Auth connects.
   * Social logins: Smart Account address + EIP-1271 signature.
   * External wallets (non-social): EOA address + standard ECDSA.
   */
  const completeDeHubAuth = async (provider: any) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);

    const isSocial = isSocialLoginConnected();
    const toastId = 'auth-popup';
    console.log('[Auth] [POPUP] Connection type:', isSocial ? 'SOCIAL' : 'EXTERNAL');
    

    // Gather web3AuthMeta for social logins
    const web3AuthMeta = isSocial ? await getWeb3AuthMeta() : undefined;

    const signingProvider = provider;

    try {
      let authAddressForApi: string;
      let signature: string;

      const BASE_CHAIN_ID = 8453;

      // For social logins: Smart Account only (no EOA fallback).
      if (isSocial) {
        // Get Smart Account (AA) address — this is what the mobile app uses
        let smartAccountAddress: string | null = null;
        try {
          const w3a = await getOrInitWeb3Auth();
          const aaProvider = (w3a as any).aaProvider || (w3a as any).accountAbstractionProvider;
          if (aaProvider) {
            const aaAccts = await aaProvider.request({ method: 'eth_accounts' }) as string[];
            smartAccountAddress = aaAccts[0]?.toLowerCase() || null;
          }
        } catch (e) {
          console.warn('[Auth] [POPUP] Could not get Smart Account address:', e);
        }

        // Smart Account only — use AA provider directly regardless of signature format.
        // ERC-6492 sigs (undeployed Safe) are sent as-is; backend handles verification.
        if (smartAccountAddress) {
          let saResult: { address: string; signature: string } | null = null;
          try {
            const w3a = await getOrInitWeb3Auth();
            const aaProvider = (w3a as any).aaProvider || (w3a as any).accountAbstractionProvider;
            if (aaProvider) {
              const aaSign = await signWithProvider(aaProvider, displayedDate, 'POPUP-SA');
              if (aaSign.address.toLowerCase() === smartAccountAddress.toLowerCase()) {
                saResult = aaSign;
                console.log('[Auth] [POPUP] Using AA provider sig for Smart Account, length:', aaSign.signature.length);
              }
            }
          } catch (e) {
            console.warn('[Auth] [POPUP] AA provider sign failed:', e);
          }
          if (saResult) {
            // Address guard: prevent silent account switch during session refresh
            if (walletAddress && walletAddress.toLowerCase() !== saResult.address.toLowerCase()) {
              console.error('[Auth] [POPUP] Address mismatch during refresh!', { expected: walletAddress, got: saResult.address });
              throw new Error('Wallet address changed during session refresh. Please sign in again.');
            }
            console.log('[Auth] [POPUP] Trying Smart Account address:', smartAccountAddress);
            toast.loading('Signing in...', { id: toastId });
            const saAuthResponse = await authenticateWallet(saResult.address, saResult.signature, timestamp, BASE_CHAIN_ID, web3AuthMeta);
            const normalizedUser = normalizeUser(saAuthResponse.user, saResult.address);
            localStorage.setItem('dehub_wallet', saResult.address);
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            setWalletAddress(saResult.address);
            setUser(normalizedUser);
            if (saAuthResponse.result?.isNewAccount) { setRequiresUsername(true); sessionStorage.setItem('dehub_is_new_account', 'true'); } else { sessionStorage.removeItem('dehub_is_new_account'); }
            queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
            queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
            queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
            toast.success(saAuthResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!', { id: toastId });
            console.log('[Auth] ✓ DeHub authentication complete via Smart Account (Popup Flow)');
            authLogger.info('Login success', { method: 'popup-sa', address: saResult.address, username: normalizedUser.username, isNewAccount: !!saAuthResponse.result?.isNewAccount });
            return;
          }
        }
        if (smartAccountAddress) {
          throw new Error('Smart Account authentication failed.');
        }
        throw new Error('No Smart Account address available.');
      } else {
        // External wallet — standard provider signing
        const result = await signWithProvider(signingProvider, displayedDate, 'POPUP');
        authAddressForApi = result.address;
        signature = result.signature;
      }

      console.log('[Auth] [POPUP] Signature received, authenticating...');

      // Address guard: prevent silent account switch during session refresh
      if (walletAddress && walletAddress.toLowerCase() !== authAddressForApi.toLowerCase()) {
        console.error('[Auth] [POPUP] Address mismatch during refresh!', { expected: walletAddress, got: authAddressForApi });
        throw new Error('Wallet address changed during session refresh. Please sign in again.');
      }

      toast.loading('Almost there...', { id: toastId });

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
        sessionStorage.setItem('dehub_is_new_account', 'true');
      } else {
        sessionStorage.removeItem('dehub_is_new_account');
      }

      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-images'] });

      toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!', { id: 'auth-popup' });
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
        toast.error('Failed to send verification code. Please check your email and try again.');
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
      };
      const ids = walletMap[wallet] || [];
      let connector = connectors.find(c =>
        ids.some(id => c.id === id || c.name.toLowerCase().includes(id.toLowerCase()))
      );

      // Only fall back to the generic injected connector when we are actually inside
      // a wallet's in-app browser (e.g. Trust Wallet DApp browser, MetaMask mobile).
      // On desktop the injected connector is whatever extension the user has installed
      // (could be Phantom, MetaMask, etc.) — using it as a fallback for an explicitly
      // chosen wallet (e.g. Trust Wallet) would open the wrong wallet.
      if (!connector && isWalletInAppBrowser()) {
        connector = connectors.find(c => c.id === 'injected');
      }

      if (!connector) {
        throw new Error(`Connector for ${wallet} not found`);
      }

      // Always disconnect the target connector first to clear any stale
      // internal state from previous sessions (the connector can think it's
      // still connected even after wagmi global state says disconnected).
      try {
        await connector.disconnect();
      } catch { /* ignore if not connected */ }
      await new Promise(r => setTimeout(r, 100));

      console.log(`[Auth] Connecting with: ${connector.name} (${connector.id})`);
      try {
        await connectAsync({ connector });
      } catch (retryErr: any) {
        if (retryErr?.name === 'ConnectorAlreadyConnectedError') {
          console.log('[Auth] ConnectorAlreadyConnectedError — forcing full disconnect and retrying');
          wagmiDisconnect();
          clearWagmiStorage();
          await new Promise(r => setTimeout(r, 200));
          await connectAsync({ connector });
        } else {
          throw retryErr;
        }
      }
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
        const names: Record<string, string> = { metamask: 'MetaMask', phantom: 'Phantom', trust: 'Trust Wallet' };
        toast.error(`Failed to connect to ${names[wallet] || wallet}. Please try again.`);
      }
      return false;
    }
  };

  const disconnect = async () => {
    // Best-effort server-side token revocation (fire-and-forget)
    logoutFromServer().catch(() => {});

    // Clean up local state FIRST for immediate UI feedback
    clearAuthSession();
    localStorage.removeItem('dehub_user');
    localStorage.removeItem('dehub_wallet');
    localStorage.removeItem('dehub_connection_source');

    setWalletAddress(null);
    setUser(null);
    setConnectionSource(null);
    setIsConnecting(false);
    setIsLoading(false);
    wagmiAuthInProgressRef.current = false;
    setWagmiAuthIntent(false);

    disconnectDmSocket();
    queryClient.clear();

    // Provider-level disconnect AFTER local cleanup (non-blocking)
    try {
      if (connectionSource === 'web3auth') {
        await disconnectWeb3Auth();
        // Only nuke wagmi storage for web3auth sessions — wagmi wasn't the auth source
        clearWagmiStorage();
      } else {
        // For wagmi-based sessions, use wagmi's own disconnect which properly
        // resets connector state so MetaMask etc. can reconnect without a page refresh.
        wagmiDisconnect();
      }
    } catch (error) {
      console.error('Disconnect provider error (non-blocking):', error);
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

  const patchUser = (patch: Partial<DeHubUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const patched = { ...prev, ...patch };
      localStorage.setItem('dehub_user', JSON.stringify(patched));
      return patched;
    });
  };

  const refreshSession = async (): Promise<boolean> => {
    const token = getAuthToken();
    if (token && !isTokenExpired()) return true;

    // ── Step 1: Try refresh token (no wallet interaction needed) ──
    const rt = getRefreshToken();
    if (rt) {
      console.log('[Auth] Attempting token refresh via refresh token...');
      const result = await refreshAccessToken();
      if (result) {
        console.log('[Auth] ✓ Token refreshed successfully');
        return true;
      }
      console.warn('[Auth] Refresh token failed, falling back to wallet re-sign');
    }

    // ── Step 2: Fallback — wallet re-sign (requires user interaction) ──
    // Capture current wallet before refresh to detect silent swaps
    const walletBefore = walletAddress || localStorage.getItem('dehub_wallet');

    // For wagmi users: if wagmi is still connected, re-sign silently
    const savedSource = localStorage.getItem('dehub_connection_source');
    if ((connectionSource === 'wagmi' || savedSource === 'wagmi') && isWagmiConnected && wagmiAddress) {
      try {
        console.log('[Auth] Attempting silent wagmi re-auth for', wagmiAddress);
        setConnectionSource('wagmi');
        localStorage.setItem('dehub_connection_source', 'wagmi');
        await completeDeHubAuthWagmi(wagmiAddress);
        // Safety net: verify wallet didn't change
        const walletAfter = localStorage.getItem('dehub_wallet');
        if (walletBefore && walletAfter && walletBefore.toLowerCase() !== walletAfter.toLowerCase()) {
          console.error('[Auth] CRITICAL: Wallet changed during refresh!', { before: walletBefore, after: walletAfter });
          await disconnect();
          return false;
        }
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
          // Safety net: verify wallet didn't change
          const walletAfter = localStorage.getItem('dehub_wallet');
          if (walletBefore && walletAfter && walletBefore.toLowerCase() !== walletAfter.toLowerCase()) {
            console.error('[Auth] CRITICAL: Wallet changed during refresh!', { before: walletBefore, after: walletAfter });
            await disconnect();
            return false;
          }
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
    patchUser,
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
