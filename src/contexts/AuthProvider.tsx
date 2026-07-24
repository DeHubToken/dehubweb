/**
 * Auth Provider (heavy implementation — loaded via the WalletProviders chunk)
 * ============
 * Two login paths, both ending in a signed message to the DeHub backend:
 *
 * 1. Social / email (self-custody smart wallet — replaces Web3Auth):
 *    Supabase Auth (email OTP / OAuth) establishes identity, then the user's
 *    client-side encrypted wallet (lib/wallet-core) is created or unlocked.
 *    The derived ETH key powers a Safe Smart Account via Pimlico
 *    (lib/smart-wallet) and signs the DeHub auth message (EIP-1271/6492).
 *    connectionSource stays 'web3auth' for backward compatibility — dozens of
 *    consumers branch on that string; it now means "smart-wallet session".
 *
 * 2. External wallets (Wagmi): standard ECDSA signing with the EOA address —
 *    unchanged.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAccount, useSignMessage, useDisconnect, useConnect } from 'wagmi';
import { wagmiConfig, clearWagmiStorage } from '@/lib/wagmi';

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
import { clearEngagementCaches } from '@/lib/clear-engagement-caches';
import { supabase } from '@/integrations/supabase/client';
import {
  activateWalletKey,
  restoreWalletSession,
  isWalletUnlocked,
  lockWallet,
  setupAAProvider,
  setAAProvider,
  clearAAProvider,
  getAAProvider,
} from '@/lib/smart-wallet';
import { fetchWallet, clearWalletCache } from '@/lib/wallet-core/store';
import { isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { AuthContext, type SocialProvider, type WalletProvider, type WalletPhase } from './AuthContext';

const authLogger = createLogger('Auth');

// Set before a Supabase OAuth redirect / email OTP so that, when the session
// lands (possibly after a full page reload), we know to resume the wallet
// login flow instead of ignoring a stray Supabase session.
const SUPA_LOGIN_PENDING_KEY = 'dehub_supa_login_pending';

// Warm DNS for WalletConnect back-ends the instant the user shows login intent.
let walletOriginsWarmed = false;
function warmWalletOrigins() {
  if (walletOriginsWarmed || typeof document === 'undefined') return;
  walletOriginsWarmed = true;
  for (const href of [
    'https://api.web3modal.org',
    'https://pulse.walletconnect.org',
  ]) {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = href;
    document.head.appendChild(link);
  }
}

function normalizeUser(userData: Partial<DeHubUser> | null | undefined, fallbackAddress: string): DeHubUser {
  const safe = userData ?? {};
  // Compute badgeBalance: use API value, or fallback to sum of balanceData
  const rawBadgeBalance = safe.badgeBalance;
  const numericRaw = typeof rawBadgeBalance === 'string' ? parseFloat(rawBadgeBalance) : (typeof rawBadgeBalance === 'number' ? rawBadgeBalance : NaN);
  const computedFromBalanceData = safe.balanceData?.reduce((sum, b) => sum + (b.walletBalance || 0) + (b.staked || 0), 0) ?? 0;
  const badgeBalance = (Number.isFinite(numericRaw) && numericRaw > 0) ? numericRaw : computedFromBalanceData;
  return {
    _id: safe._id || safe.id || undefined,
    id: safe.id || safe._id || undefined,
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

// Map our provider names to Supabase OAuth provider ids
function mapSocialProvider(provider: SocialProvider): string | null {
  switch (provider) {
    case 'google': return 'google';
    case 'twitter': return 'twitter';
    case 'apple': return 'apple';
    case 'discord': return 'discord';
    case 'github': return 'github';
    case 'telegram': return null; // not supported by Supabase Auth
    default: return null;
  }
}

/** Build auth meta (shown on the DeHub profile) from the Supabase user. */
async function getSupabaseAuthMeta(): Promise<Web3AuthMeta | undefined> {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    if (!u) return undefined;
    const md = (u.user_metadata ?? {}) as Record<string, unknown>;
    return {
      typeOfLogin: (u.app_metadata?.provider as string) || 'email',
      verifier: 'dehub-supabase',
      verifierId: u.id,
      email: u.email ?? (md.email as string | undefined),
      name: (md.full_name as string) ?? (md.name as string) ?? undefined,
      profileImage: (md.avatar_url as string) ?? (md.picture as string) ?? undefined,
    };
  } catch (e) {
    console.warn('[Auth] Could not build Supabase auth meta:', e);
    return undefined;
  }
}

/**
 * Sign auth message using the provider's personal_sign.
 * Used for both the smart-wallet AA provider and external-wallet fallbacks.
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

  const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;

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

  return { address, signature };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Hydrate user/wallet immediately from localStorage to prevent zombie state on mobile refresh.
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
  const [needsSignature] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [walletPhase, setWalletPhase] = useState<WalletPhase>('none');
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [connectionSource, setConnectionSource] = useState<'web3auth' | 'wagmi' | null>(
    (localStorage.getItem('dehub_connection_source') as 'web3auth' | 'wagmi' | null) || null
  );

  // Clear cached engagement state whenever the active wallet changes.
  const prevWalletRef = useRef<string | null>(walletAddress);
  useEffect(() => {
    const prev = prevWalletRef.current;
    const curr = walletAddress;
    if (prev !== curr && (prev || curr)) {
      clearEngagementCaches();
      queryClient.removeQueries({ queryKey: ['single-post'] });
      queryClient.removeQueries({ queryKey: ['unified-feed'] });
      queryClient.removeQueries({ queryKey: ['dehub-feed'] });
      queryClient.removeQueries({ queryKey: ['profile-content'] });
    }
    prevWalletRef.current = curr;
  }, [walletAddress, queryClient]);

  // When a silent token refresh revives an ALREADY-expired session, refetch
  // per-user-flag queries (isLiked/isSaved were cached anonymously).
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e as CustomEvent<{ wasExpired?: boolean }>).detail?.wasExpired) return;
      for (const key of ['unified-feed', 'dehub-feed', 'profile-content', 'single-post', 'bookmarks']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    window.addEventListener('dehub:token-refreshed', handler);
    return () => window.removeEventListener('dehub:token-refreshed', handler);
  }, [queryClient]);

  // Wagmi hooks
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { connectAsync, connectors } = useConnect();

  const connectionAbortedRef = useRef(false);
  const wagmiAuthIntentRef = useRef(false);
  const [wagmiAuthIntentState, setWagmiAuthIntentState] = useState(false);
  const wagmiAuthInProgressRef = useRef(false);
  const wagmiSilentReconnectAttemptedRef = useRef(false);
  // Guards double-processing of a landed Supabase session (OAuth return fires
  // both INITIAL_SESSION and SIGNED_IN).
  const supaLoginHandledRef = useRef(false);

  const isAuthenticated = !!user && !!walletAddress && (
    isLoading ||
    (!!getAuthToken() && !isTokenExpired()) ||
    !!getRefreshToken()
  );

  const setWagmiAuthIntent = useCallback((value: boolean) => {
    wagmiAuthIntentRef.current = value;
    // Force a genuine state change even when re-setting the same boolean —
    // handleWagmiConnect relies on this update to re-fire (React bails out of
    // same-value setState). The effect only reads wagmiAuthIntentRef.current.
    setWagmiAuthIntentState(prev => (prev === value ? !prev : value));
  }, []);

  const openLoginModal = useCallback(() => {
    connectionAbortedRef.current = false;
    warmWalletOrigins();
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    connectionAbortedRef.current = true;
    setIsLoginModalOpen(false);
    if (isConnecting && !walletAddress) {
      setIsConnecting(false);
    }
  }, [isConnecting, walletAddress]);

  /**
   * After a Supabase session exists: look up the wallet row and route the
   * login modal to the create or unlock step.
   */
  const proceedToWalletPhase = useCallback(async (userId: string) => {
    setSupabaseUserId(userId);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');
    try {
      const existing = await fetchWallet(userId);
      setWalletPhase(existing ? 'unlock' : 'create');
    } catch (e) {
      console.warn('[Auth] Wallet lookup failed, defaulting to create check on retry:', e);
      // Network hiccup — let the modal retry; default to unlock so we never
      // overwrite an existing wallet by accident.
      setWalletPhase('unlock');
    }
    openLoginModal();
  }, [openLoginModal]);

  // Check for existing DeHub session on mount
  useEffect(() => {
    const init = async () => {
      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet && !isTokenExpired()) {
          try {
            // Run profile fetch + token validation in parallel
            const [userDataResult, tokenResult] = await Promise.allSettled([
              getAccountInfo(savedWallet),
              apiCall('/api/notification/unread-count', { requiresAuth: true }),
            ]);

            if (tokenResult.status === 'rejected') {
              const tokenValidationError = tokenResult.reason as any;
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
              console.warn('[Auth] Token validation call failed (non-auth), proceeding:', tokenValidationError?.message);
            }

            if (userDataResult.status === 'rejected') throw userDataResult.reason;
            const userData = userDataResult.value;

            const normalizedUser = normalizeUser(userData, savedWallet);
            setUser(normalizedUser);
            setWalletAddress(savedWallet);
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error: any) {
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
              // Network error — keep cached session so mobile users aren't
              // logged out by flaky connections.
              console.warn('[Auth] Session restoration failed (network), keeping cached session:', error?.message);
            }
          }
        } else if (token && isTokenExpired()) {
          console.log('[Auth] Token expired on mount, attempting silent refresh...');
          const refreshed = await refreshAccessToken();
          if (refreshed && savedWallet) {
            try {
              const userData = await getAccountInfo(savedWallet);
              const normalizedUser = normalizeUser(userData, savedWallet);
              setUser(normalizedUser);
              setWalletAddress(savedWallet);
              localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
              if (!normalizedUser.username) setRequiresUsername(true);
            } catch {
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
            clearAuthSession();
            localStorage.removeItem('dehub_user');
            setUser(null);
            setWalletAddress(null);
          }
        } else if (!token) {
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

  // Resume a pending smart-wallet login when the Supabase session lands
  // (OAuth redirect return, or email OTP verified in another effect tick).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) return;
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      if (supaLoginHandledRef.current) return;
      if (!localStorage.getItem(SUPA_LOGIN_PENDING_KEY)) return;
      // Already fully logged in? Nothing to resume.
      if (getAuthToken() && !isTokenExpired() && localStorage.getItem('dehub_wallet')) {
        localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
        return;
      }
      supaLoginHandledRef.current = true;
      setIsProcessingRedirect(true);
      // Defer so this runs outside the auth-state callback (supabase-js
      // deadlocks if you call its own APIs synchronously inside the callback).
      setTimeout(() => {
        proceedToWalletPhase(session.user.id).finally(() => {
          setIsProcessingRedirect(false);
          supaLoginHandledRef.current = false;
        });
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [proceedToWalletPhase]);

  // Mid-session unlock requests (e.g. a tip attempted in a fresh tab where the
  // key session is gone). Fired by aa-utils when no signing provider exists.
  useEffect(() => {
    const handler = async () => {
      if (localStorage.getItem('dehub_connection_source') !== 'web3auth') return;
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) {
        openLoginModal();
        return;
      }
      setSupabaseUserId(uid);
      setWalletPhase('unlock');
      openLoginModal();
    };
    window.addEventListener('dehub:wallet-unlock-required', handler);
    return () => window.removeEventListener('dehub:wallet-unlock-required', handler);
  }, [openLoginModal]);

  // Reconnect DM socket when user logs in
  useEffect(() => {
    if (user && walletAddress && getAuthToken()) {
      reconnectDmSocket();
    }
  }, [user, walletAddress]);

  // On page restore, the AA provider is gone even though the tab key session
  // may be valid. Re-setup in the background so tips/txs work immediately.
  useEffect(() => {
    if (!user || connectionSource !== 'web3auth') return;
    if (getAAProvider()) return;
    if (!isWalletUnlocked()) return; // locked — unlock happens on demand

    restoreWalletSession().then(async (provider) => {
      if (!provider) return;
      try {
        const aaProvider = await setupAAProvider();
        if (aaProvider) {
          setAAProvider(aaProvider);
          console.log('[Auth] ✓ AA provider restored on session restore');
        }
      } catch (e) {
        console.warn('[Auth] Could not restore AA provider on session restore:', e);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, connectionSource]);

  // ── Proactive Token Refresh Timer ──
  useEffect(() => {
    if (!user || !walletAddress) return;

    const tryProactiveRefresh = async () => {
      let timeUntilExpiry: number;
      const expiresAtStr = localStorage.getItem('dehub_token_expires_at');
      if (expiresAtStr) {
        timeUntilExpiry = parseInt(expiresAtStr, 10) - Date.now();
      } else {
        const timestampStr = localStorage.getItem('dehub_token_timestamp');
        if (!timestampStr) return;
        const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
        timeUntilExpiry = parseInt(timestampStr, 10) + TOKEN_EXPIRY_MS - Date.now();
      }

      if (timeUntilExpiry < 5 * 60 * 1000) {
        const result = await refreshAccessToken();
        if (result) {
          console.log('[Auth] ✓ Proactive token refresh succeeded');
        } else if (timeUntilExpiry < 0) {
          console.warn('[Auth] Token expired and refresh failed — clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
          setUser(null);
          setWalletAddress(null);
        } else {
          console.warn('[Auth] Proactive refresh failed — will retry or fall back on next 401');
        }
      }
    };

    tryProactiveRefresh();
    const intervalId = setInterval(tryProactiveRefresh, 60 * 1000);
    const handleVisibilityChange = () => {
      if (!document.hidden) tryProactiveRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, walletAddress]);

  // Wagmi Auto-connect logic (external wallets — unchanged)
  useEffect(() => {
    const handleWagmiConnect = async () => {
      if (isProcessingRedirect) {
        return;
      }

      // While a smart-wallet login is in progress, the browser wallet may
      // auto-reconnect from extension storage. Drop wagmi for this window.
      if (isConnecting && connectionSource === 'web3auth') {
        if (isWagmiConnected && wagmiAddress) {
          clearWagmiStorage();
          await wagmiDisconnect();
        }
        return;
      }

      if (isWagmiConnected && wagmiAddress && !isLoading) {
        if (wagmiAuthInProgressRef.current) {
          return;
        }

        // CASE A: Already authed with same address -> Sync state
        if (isAuthenticated && walletAddress?.toLowerCase() === wagmiAddress.toLowerCase()) {
            if (connectionSource !== 'wagmi') {
              setConnectionSource('wagmi');
            }
            return;
        }

        // CASE B: Already authed with DIFFERENT address
        if (walletAddress && walletAddress.toLowerCase() !== wagmiAddress.toLowerCase()) {
            const savedSrc = localStorage.getItem('dehub_connection_source');
            // Smart-wallet sessions: SA address always differs from any external
            // wallet. Silently disconnect Wagmi — don't wipe the session.
            if (connectionSource === 'web3auth' || savedSrc === 'web3auth') {
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

        // CASE C: Not authed -> Only start auth on explicit intent or returning wagmi user
        const savedSource = localStorage.getItem('dehub_connection_source');
        const hasUserIntent = wagmiAuthIntentRef.current;
        const hasToken = !!getAuthToken() && !isTokenExpired();
        const isReturningWagmiUser = savedSource === 'wagmi' && hasToken;

        if (!hasUserIntent && !isReturningWagmiUser) {
          return;
        }

        wagmiAuthInProgressRef.current = true;
        try {
          setIsConnecting(true);
          setConnectionSource('wagmi');
          localStorage.setItem('dehub_connection_source', 'wagmi');
          await completeDeHubAuthWagmi(wagmiAddress);
          setWagmiAuthIntent(false);
          closeLoginModal();
        } catch (err) {
          console.error('[Auth] Wagmi auth failed:', err);
          setWagmiAuthIntent(false);
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

  // Auto-connect in wallet in-app browsers (Trust Wallet, MetaMask mobile, etc.)
  useEffect(() => {
    const autoConnectInAppBrowser = async () => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum;
      const eth = (window as any).ethereum;
      const inWalletBrowser = isMobile && hasInjected && (!!eth?.isTrust || !!eth?.isTrustWallet);
      const alreadyAttempted = sessionStorage.getItem('dehub_wallet_auto_connect_attempted');
      const hasExistingSession = !!getAuthToken() && !isTokenExpired();

      if (!(isMobile || inWalletBrowser) || !hasInjected || hasExistingSession || alreadyAttempted) {
        return;
      }

      sessionStorage.setItem('dehub_wallet_auto_connect_attempted', 'true');

      const injectedConnector = connectors.find(c => c.id === 'injected')
        || connectors.find(c => c.id === 'io.metamask')
        || connectors.find(c => c.id === 'metaMaskSDK')
        || connectors.find(c => c.id === 'app.phantom');
      if (!injectedConnector) return;

      setWagmiAuthIntent(true);
      try {
        await connectAsync({ connector: injectedConnector });
      } catch (err: any) {
        const isAlreadyConnected =
          err?.name === 'ConnectorAlreadyConnectedError' ||
          err?.message?.toLowerCase().includes('already connected');
        if (!isAlreadyConnected) {
          console.warn('[Auth] In-app browser auto-connect failed:', err);
          setWagmiAuthIntent(false);
        }
      }
    };

    autoConnectInAppBrowser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent wagmi reconnect for wallet in-app browsers
  useEffect(() => {
    if (!isAuthenticated || connectionSource !== 'wagmi' || isLoading || isConnecting) return;
    if (isWagmiConnected) return;

    const eth = (window as any).ethereum;
    const isInWalletBrowser = isMobileDevice();
    if (!isInWalletBrowser || !eth) return;

    if (wagmiSilentReconnectAttemptedRef.current) return;
    wagmiSilentReconnectAttemptedRef.current = true;

    const injectedConnector = connectors.find(c => c.id === 'injected');
    if (!injectedConnector) return;

    connectAsync({ connector: injectedConnector }).catch((err: any) => {
      const isAlreadyConnected =
        err?.name === 'ConnectorAlreadyConnectedError' ||
        err?.message?.toLowerCase().includes('already connected');
      if (isAlreadyConnected) {
        return;
      }
      console.warn('[Auth] Silent wagmi reconnect failed, logging out:', err);
      toast.info('Your wallet connection was lost. Please log in again.');
      disconnect();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, connectionSource, isWagmiConnected, isLoading, isConnecting]);

  /**
   * Complete DeHub auth using Wagmi (Sign Message) — unchanged.
   */
  const completeDeHubAuthWagmi = async (address: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const authAddress = address.toLowerCase();

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

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

    if (walletAddress && walletAddress.toLowerCase() !== authAddress.toLowerCase()) {
      throw new Error('Wallet address changed during session refresh. Please sign in again.');
    }

    const BASE_CHAIN_ID = 8453;
    const authResponse = await authenticateWallet(authAddress, signature, timestamp, BASE_CHAIN_ID);

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
    queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });

    toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!');
    authLogger.info('Login success', { method: 'wagmi', address: authAddress, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
  };

  /**
   * Sign the DeHub auth message with the active smart-wallet session and
   * establish the DeHub backend session. Prefers the Safe Smart Account
   * (sponsored gas, same address as the old Web3Auth flow for the same key);
   * falls back to the EOA if Pimlico is unavailable.
   */
  const signAndAuthenticateSmartWallet = async (toastId: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const BASE_CHAIN_ID = 8453;

    const eoaProvider = await restoreWalletSession();
    if (!eoaProvider) throw new Error('Wallet is locked. Please unlock it first.');

    let aaProvider: any = null;
    try {
      aaProvider = await setupAAProvider();
      if (aaProvider) setAAProvider(aaProvider);
    } catch (e) {
      console.warn('[Auth] AA setup failed, falling back to EOA:', e);
    }

    const signingProvider = aaProvider ?? eoaProvider;
    const flow = aaProvider ? 'SMART-SA' : 'SMART-EOA';
    const { address, signature } = await signWithProvider(signingProvider, displayedDate, flow);

    // Address guard: prevent silent account switch during session refresh
    if (walletAddress && walletAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Wallet address changed during session refresh. Please sign in again.');
    }

    const meta = await getSupabaseAuthMeta();
    toast.loading('Signing in...', { id: toastId });
    const authResponse = await authenticateWallet(address, signature, timestamp, BASE_CHAIN_ID, meta);

    const normalizedUser = normalizeUser(authResponse.user, address);
    localStorage.setItem('dehub_wallet', address);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
    localStorage.setItem('dehub_connection_source', 'web3auth');
    setConnectionSource('web3auth');
    setWalletAddress(address);
    setUser(normalizedUser);

    if (authResponse.result?.isNewAccount) {
      setRequiresUsername(true);
      sessionStorage.setItem('dehub_is_new_account', 'true');
    } else {
      sessionStorage.removeItem('dehub_is_new_account');
    }

    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });

    toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!', { id: toastId });
    authLogger.info('Login success', { method: flow.toLowerCase(), address, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
  };

  /**
   * Final step of the smart-wallet login flow — called by the login modal
   * after the wallet was created/unlocked and the private key is available.
   */
  const completeSmartWalletLogin = async (privKeyHex: string) => {
    const toastId = 'auth-smart-wallet';
    setIsConnecting(true);
    try {
      await activateWalletKey(privKeyHex);
      await signAndAuthenticateSmartWallet(toastId);
      setWalletPhase('none');
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      closeLoginModal();
    } catch (err: any) {
      console.error('[Auth] Smart-wallet login failed:', err);
      toast.error(err?.message || 'Authentication failed', { id: toastId });
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Social login via Supabase OAuth (full-page redirect).
   */
  const connectWithProvider = async (provider: SocialProvider) => {
    const supaProvider = mapSocialProvider(provider);
    if (!supaProvider) {
      toast.error(`${provider} login is not available. Please use email or another provider.`);
      return;
    }

    setIsConnecting(true);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');

    try {
      // Avoid wagmi competing for browser wallet state during the flow.
      try {
        await wagmiDisconnect();
        clearWagmiStorage();
      } catch { /* ignore */ }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: supaProvider as any,
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw error;
      // Browser navigates away; flow resumes in onAuthStateChange after return.
    } catch (error: any) {
      console.error(`${provider} login error:`, error);
      toast.error(`Failed to connect with ${provider}. Please try again.`);
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      setIsConnecting(false);
    }
  };

  /**
   * Email login step 1: send a 6-digit OTP via Supabase Auth.
   * The login modal then shows the code-entry step and calls verifyEmailOtp.
   */
  const connectWithEmail = async (email: string) => {
    setIsConnecting(true);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');

    try {
      try {
        await wagmiDisconnect();
        clearWagmiStorage();
      } catch { /* ignore */ }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      toast.success('Verification code sent — check your email');
    } catch (error: any) {
      console.error('Email login error:', error);
      toast.error(error?.message || 'Failed to send verification code. Please try again.');
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Email login step 2: verify the OTP. On success the wallet phase is
   * resolved and the modal advances to create/unlock.
   */
  const verifyEmailOtp = async (email: string, code: string) => {
    setIsConnecting(true);
    // Claim the login before verifyOtp fires SIGNED_IN, so the auth-state
    // listener doesn't race us into a duplicate proceedToWalletPhase.
    supaLoginHandledRef.current = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      const uid = data?.session?.user?.id ?? data?.user?.id;
      if (!uid) throw new Error('Verification failed. Please try again.');
      await proceedToWalletPhase(uid);
    } catch (error: any) {
      console.error('OTP verification error:', error);
      throw new Error(error?.message || 'Invalid code. Please try again.');
    } finally {
      supaLoginHandledRef.current = false;
      setIsConnecting(false);
    }
  };

  /**
   * Phone login step 1: send a 6-digit OTP via Supabase Auth (SMS provider
   * must be configured in the Supabase dashboard — Twilio/MessageBird/etc).
   */
  const connectWithSMS = async (phone: string) => {
    setIsConnecting(true);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');

    try {
      try {
        await wagmiDisconnect();
        clearWagmiStorage();
      } catch { /* ignore */ }

      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      toast.success('Verification code sent — check your phone');
    } catch (error: any) {
      console.error('Phone login error:', error);
      toast.error(error?.message || 'Failed to send verification code. Please try again.');
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      setConnectionSource(null);
      localStorage.removeItem('dehub_connection_source');
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Phone login step 2: verify the OTP. On success the wallet phase is
   * resolved and the modal advances to create/unlock.
   */
  const verifyPhoneOtp = async (phone: string, code: string) => {
    setIsConnecting(true);
    supaLoginHandledRef.current = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: code.trim(),
        type: 'sms',
      });
      if (error) throw error;
      const uid = data?.session?.user?.id ?? data?.user?.id;
      if (!uid) throw new Error('Verification failed. Please try again.');
      await proceedToWalletPhase(uid);
    } catch (error: any) {
      console.error('Phone OTP verification error:', error);
      throw new Error(error?.message || 'Invalid code. Please try again.');
    } finally {
      supaLoginHandledRef.current = false;
      setIsConnecting(false);
    }
  };

  // External wallet connect (wagmi) — unchanged.
  const connectWithWallet = async (wallet: WalletProvider): Promise<boolean> => {
    setIsConnecting(true);
    setWagmiAuthIntent(true);
    localStorage.setItem('dehub_connection_source', 'wagmi');

    try {
      const walletMap: Record<string, string[]> = {
        metamask: ['metaMaskSDK', 'io.metamask', 'metaMask'],
        phantom: ['app.phantom', 'phantom'],
        trust: ['trust', 'trustWallet'],
      };
      const ids = walletMap[wallet] || [];
      let connector = connectors.find(c =>
        ids.some(id => c.id === id || c.name.toLowerCase().includes(id.toLowerCase()))
      );

      if (!connector && isWalletInAppBrowser()) {
        connector = connectors.find(c => c.id === 'injected');
      }

      if (!connector) {
        throw new Error(`Connector for ${wallet} not found`);
      }

      try {
        await connector.disconnect();
      } catch { /* ignore if not connected */ }
      await new Promise(r => setTimeout(r, 100));

      try {
        await connectAsync({ connector });
      } catch (retryErr: any) {
        if (retryErr?.name === 'ConnectorAlreadyConnectedError') {
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
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
    clearEngagementCaches();

    setWalletAddress(null);
    setUser(null);
    setConnectionSource(null);
    setIsConnecting(false);
    setIsLoading(false);
    setWalletPhase('none');
    setSupabaseUserId(null);
    wagmiAuthInProgressRef.current = false;
    setWagmiAuthIntent(false);

    disconnectDmSocket();
    queryClient.clear();

    // Provider-level disconnect AFTER local cleanup (non-blocking)
    try {
      if (connectionSource === 'web3auth') {
        clearAAProvider();
        lockWallet();
        // Encrypted-only cache; clearing avoids stale rows when a different
        // user logs in on this device next.
        clearWalletCache();
        try { sessionStorage.removeItem('dhb_approved_chains'); } catch { /* */ }
        supabase.auth.signOut().catch(() => {});
        clearWagmiStorage();
      } else {
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

    // ── Step 1: refresh token (no wallet interaction needed) ──
    const rt = getRefreshToken();
    if (rt) {
      const result = await refreshAccessToken();
      if (result) return true;
      console.warn('[Auth] Refresh token failed, falling back to wallet re-sign');
    }

    // ── Step 2: wallet re-sign ──
    const walletBefore = walletAddress || localStorage.getItem('dehub_wallet');
    const savedSource = localStorage.getItem('dehub_connection_source');

    if ((connectionSource === 'wagmi' || savedSource === 'wagmi') && isWagmiConnected && wagmiAddress) {
      try {
        setConnectionSource('wagmi');
        localStorage.setItem('dehub_connection_source', 'wagmi');
        await completeDeHubAuthWagmi(wagmiAddress);
        const walletAfter = localStorage.getItem('dehub_wallet');
        if (walletBefore && walletAfter && walletBefore.toLowerCase() !== walletAfter.toLowerCase()) {
          await disconnect();
          return false;
        }
        return true;
      } catch (e) {
        console.warn('[Auth] Silent wagmi re-auth failed:', e);
        return false;
      }
    }

    // Smart-wallet sessions: silent re-sign if the key session is still live.
    if (connectionSource === 'web3auth' || savedSource === 'web3auth') {
      try {
        if (!isWalletUnlocked()) {
          // Locked — a UI unlock is required; the next tx attempt triggers it.
          window.dispatchEvent(new Event('dehub:wallet-unlock-required'));
          return false;
        }
        await signAndAuthenticateSmartWallet('auth-refresh');
        const walletAfter = localStorage.getItem('dehub_wallet');
        if (walletBefore && walletAfter && walletBefore.toLowerCase() !== walletAfter.toLowerCase()) {
          await disconnect();
          return false;
        }
        return true;
      } catch (e) {
        console.warn('[Auth] Silent smart-wallet re-auth failed:', e);
        return false;
      }
    }

    return false;
  };

  const connect = async () => {
    openLoginModal();
  };

  // ~180 components consume useAuth; expose stable wrappers that forward to
  // the latest instance via a ref — identity never changes, closure never stales.
  const latestCallbacks = {
    connect,
    connectWithProvider,
    connectWithEmail,
    verifyEmailOtp,
    connectWithSMS,
    verifyPhoneOtp,
    connectWithWallet,
    completeSmartWalletLogin,
    disconnect,
    refreshUser,
    refreshSession,
    setRequiresUsername,
    setWagmiAuthIntent,
    openLoginModal,
    closeLoginModal,
    patchUser,
  };
  const callbacksRef = useRef(latestCallbacks);
  callbacksRef.current = latestCallbacks;
  const stableCallbacks = React.useMemo(() => {
    const stable = {} as typeof latestCallbacks;
    for (const key of Object.keys(callbacksRef.current) as Array<keyof typeof latestCallbacks>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stable as any)[key] = (...args: any[]) => (callbacksRef.current[key] as any)(...args);
    }
    return stable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = React.useMemo(() => ({
    user,
    walletAddress,
    isAuthenticated,
    isLoading,
    isConnecting,
    isProcessingRedirect,
    requiresUsername,
    needsSignature,
    connectionSource,
    walletPhase,
    supabaseUserId,
    isLoginModalOpen,
    ...stableCallbacks,
  }), [
    user,
    walletAddress,
    isAuthenticated,
    isLoading,
    isConnecting,
    isProcessingRedirect,
    requiresUsername,
    needsSignature,
    connectionSource,
    walletPhase,
    supabaseUserId,
    isLoginModalOpen,
    stableCallbacks,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
