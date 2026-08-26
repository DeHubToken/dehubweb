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
import { setBackgroundPaused } from '@/lib/background-gate';

import {
  authenticateWallet,
  authenticateWithSupabaseSession,
  WalletNotLinkedError,
  WalletSignupBlockedError,
  getAccountInfo,
  getAuthToken,
  getRefreshToken,
  clearAuthSession,
  isTokenExpired,
  apiCall,
  refreshAccessTokenDetailed,
  logoutFromServer,
  type DeHubUser,
  type Web3AuthMeta,
  type AuthResponse,
} from '@/lib/api/dehub';
import { disconnectDmSocket, reconnectDmSocket } from '@/lib/api/dehub/dm-socket';
import {
  readConnectionSource,
  writeConnectionSource,
  clearConnectionSource,
  restoreConnectionSource,
  isSmartWalletSession,
  healConnectionSource,
  writeLastSession,
  readLastSession,
  readLastSessionAddress,
  clearLastSession,
  type ConnectionSource,
} from '@/lib/connection-source';
import { predictSafeAddress } from '@/lib/smart-account-address';
import { clearEngagementCaches } from '@/lib/clear-engagement-caches';
import { clearPersistedQueryCache } from '@/lib/query-persist';
import { supabase } from '@/integrations/supabase/client';
import {
  activateWalletKey,
  restoreWalletSession,
  isWalletUnlocked,
  isUnlockAvailable,
  lockWallet,
  setupAAProvider,
  setAAProvider,
  clearAAProvider,
  getAAProvider,
} from '@/lib/smart-wallet';
import { fetchWallet, saveWallet, clearWalletCache, getCachedWallet } from '@/lib/wallet-core/store';
import { unlockWithBiometrics, hasBiometricUsableHere } from '@/lib/wallet-core/biometric-unlock';
import {
  WALLET_UNLOCK_INTERVAL_KEY,
  DEFAULT_WALLET_UNLOCK_INTERVAL,
} from '@/hooks/use-wallet-unlock-interval';
import { clearPasskeyCache, deleteAllPasskeyWraps } from '@/lib/wallet-core/passkey-store';
import { deriveFromSecret } from '@/lib/wallet-core/derive';
import { encryptString, decryptString } from '@/lib/wallet-core/crypto';
import { isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { isUserRejection, isRequestAlreadyPending, isRequestTimeout, describeWalletError, WalletRequestTimeoutError } from '@/lib/wallet-errors';
import { connectorMatchesWallet } from '@/lib/wallet-connectors';
import { getRunningBuildId, isRunningStaleBuild } from '@/lib/version-check';
import {
  initProfileTracking,
  snapshotCurrentSession,
  adoptCurrentProfile,
  stageIncomingIdentity,
  applyProfileSnapshot,
  currentProfileId,
  listProfiles,
  profileAllowance,
  beginProfileSwitch,
  abortProfileSwitch,
  removeProfile,
} from '@/lib/profiles';
import { AuthContext, type SocialProvider, type WalletProvider, type WalletPhase } from './AuthContext';

const authLogger = createLogger('Auth');

/**
 * Who asked for the wallet signature.
 *
 * 'user' is a tap on a wallet button. 'background' is the app deciding on the
 * user's behalf — a session refresh, or a page load that found a live connector
 * — and it is the one that generated the support reports: an unexplained
 * MetaMask popup appears mid-browse, dismissing it is the only sane response,
 * and the app then announced that the user had rejected a signature they never
 * asked for. The distinction has to reach both the copy and the log row.
 */
type WagmiAuthTrigger = 'user' | 'background';

// Set before a Supabase OAuth redirect / email OTP so that, when the session
// lands (possibly after a full page reload), we know to resume the wallet
// login flow instead of ignoring a stray Supabase session.
const SUPA_LOGIN_PENDING_KEY = 'dehub_supa_login_pending';

// Written alongside the pending flag when a social/email login navigates the
// browser away. On return, flag + fresh timestamp together mean "a login
// resume should be on screen RIGHT NOW" — so the sheet is open from the very
// first paint and the user never sees the public feed flash past before the
// wallet step appears. Without the timestamp, a flag left over from an
// abandoned attempt would reopen the sheet on every visit forever.
const SUPA_LOGIN_PENDING_AT_KEY = 'dehub_supa_login_pending_at';
const PENDING_LOGIN_FRESH_MS = 2 * 60 * 1000;

/**
 * Show the API's explanation for a refused wallet signup, if that is what this
 * error is. Returns whether it handled the error.
 *
 * Shared because `authenticateWallet` has three call sites and they used to
 * treat this three different ways — one said "try again" (the one thing that
 * cannot work), one showed a generic title, and the silent-resume path
 * swallowed it and sent the person to a password prompt for an account the
 * server had just refused to create. The wallet is empty and will still be
 * empty next time, so every path has to say the same thing: here is why, and
 * here are the doors that do work.
 */
function reportWalletSignupBlocked(error: unknown): boolean {
  if (!(error instanceof WalletSignupBlockedError)) return false;
  toast.error('This wallet cannot open a new account', {
    id: 'wallet-signup-blocked',
    description: error.message,
    duration: 15000,
  });
  return true;
}

function isSocialLoginResumeExpected(): boolean {
  try {
    if (localStorage.getItem(SUPA_LOGIN_PENDING_KEY) !== '1') return false;
    const at = Number(localStorage.getItem(SUPA_LOGIN_PENDING_AT_KEY));
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at < PENDING_LOGIN_FRESH_MS;
  } catch {
    return false;
  }
}

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
    // Phone-login accounts get a synthetic @phone.dehub.internal email so
    // they can sign in via password (see verify-phone-otp) — never a real
    // address, so it must never surface as "the user's email".
    const realEmail = u.email?.endsWith('@phone.dehub.internal') ? undefined : u.email;
    return {
      typeOfLogin: (u.app_metadata?.provider as string) || 'email',
      verifier: 'dehub-supabase',
      verifierId: u.id,
      email: realEmail ?? (md.email as string | undefined),
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
  // Initialised from the pending-login freshness window rather than left
  // false: a browser coming back from an OAuth redirect or magic link must
  // spend its first frame showing the login sheet ("Signing you in…"), not
  // the bare feed it is about to leave again. The SIGNED_IN listener below
  // drives this flag through the actual resume; the watchdog effect releases
  // it if no session ever lands.
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(isSocialLoginResumeExpected);
  const [requiresUsername, setRequiresUsername] = useState(false);
  const [needsSignature] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(isSocialLoginResumeExpected);
  // Why the sheet is open — plain sign-in, or adding/switching a profile from
  // Settings while already signed in. Only changes the sheet's title.
  const [loginIntent, setLoginIntent] = useState<'login' | 'add-profile'>('login');
  const [walletPhase, setWalletPhase] = useState<WalletPhase>('none');
  // Hydrated from storage rather than left null until some login flow happens
  // to run. This is the identity that OWNS the wallet row, and it is needed on
  // an ordinary page load where no login is in progress: BiometricUnlockSettings
  // renders nothing without it, exportPrivateKey and switchActiveWallet throw
  // "Not signed in" on it, and applyAuthenticatedSession skips writing the
  // last-session record when it is null — so a background re-sign left no trace
  // of itself and the next page load had to start over.
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(
    () => localStorage.getItem('dehub_supabase_uid') ?? readLastSession()?.uid ?? null,
  );
  const [connectionSource, setConnectionSource] = useState<'web3auth' | 'wagmi' | null>(
    readConnectionSource
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
      queryClient.removeQueries({ queryKey: ['dehub-user-content'] });
    }
    prevWalletRef.current = curr;
  }, [walletAddress, queryClient]);

  // When a silent token refresh revives an ALREADY-expired session, refetch
  // per-user-flag queries (isLiked/isSaved were cached anonymously).
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e as CustomEvent<{ wasExpired?: boolean }>).detail?.wasExpired) return;
      for (const key of ['unified-feed', 'dehub-feed', 'dehub-user-content', 'single-post', 'bookmarks']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    window.addEventListener('dehub:token-refreshed', handler);
    return () => window.removeEventListener('dehub:token-refreshed', handler);
  }, [queryClient]);

  // Wagmi hooks
  const { address: wagmiAddress, isConnected: isWagmiConnected, connector: wagmiConnector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect: wagmiDisconnect, disconnectAsync: wagmiDisconnectAsync } = useDisconnect();
  const { connectAsync, connectors } = useConnect();

  const connectionAbortedRef = useRef(false);
  // Set when the sheet opens with add-profile intent: the id of the account
  // that was live at that moment. Drives two promises the sheet makes to the
  // user — closing it mid-attempt restores this account, and completing a new
  // login adds BOTH accounts to the device's profile list. Null otherwise, so
  // plain logins never touch this machinery.
  const addProfilePrevIdRef = useRef<string | null>(null);
  // Whether THIS page mount opened the sheet itself because a login resume
  // was expected at first paint. Only that case needs the watchdog below —
  // a resume started later in the page's life already has a session on its
  // way and an audience that tapped something recently.
  const resumeOpenedAtBootRef = useRef(isSocialLoginResumeExpected());
  const wagmiAuthIntentRef = useRef(false);
  const [wagmiAuthIntentState, setWagmiAuthIntentState] = useState(false);
  const wagmiAuthInProgressRef = useRef(false);
  // When the last wagmi connect approval landed. The signature request must not
  // go out while the wallet's connect popup is still closing — see the gap wait
  // in completeDeHubAuthWagmi.
  const lastWagmiConnectAtRef = useRef(0);
  const wagmiSilentReconnectAttemptedRef = useRef(false);
  // The address whose login signature was just turned down. Rejecting is how
  // people back out to pick a different wallet, but the connector stays
  // attached — and the returning-user branch in handleWagmiConnect needs no tap
  // at all, so it re-asked the moment the state settled. Held until the next
  // deliberate tap, so a refusal ends the attempt instead of restarting it.
  const rejectedSignatureAddressRef = useRef<string | null>(null);
  // Guards double-processing of a landed Supabase session (OAuth return fires
  // both INITIAL_SESSION and SIGNED_IN).
  const supaLoginHandledRef = useRef(false);
  // Cleanup for the cross-device magic-link realtime channel (see connectWithEmail).
  const emailSyncCleanupRef = useRef<null | (() => void)>(null);

  const isAuthenticated = !!user && !!walletAddress && (
    isLoading ||
    (!!getAuthToken() && !isTokenExpired()) ||
    !!getRefreshToken()
  );

  const setWagmiAuthIntent = useCallback((value: boolean) => {
    // A fresh attempt always gets to start. The in-progress latch exists to
    // stop ONE gesture being processed twice (the intent toggle re-fires the
    // effect mid-flight), but a signature promise that never settles skips the
    // `finally` that releases it — and a ref survives closing and reopening the
    // modal, so every later attempt was silently swallowed at the guard until
    // the page was refreshed. A new user gesture means the old attempt is
    // abandoned; at worst its request is still open in the wallet, and the
    // retry then gets the -32002 "already have a request open" toast instead
    // of nothing at all.
    if (value) {
      wagmiAuthInProgressRef.current = false;
      // A new tap is a new answer to the prompt they refused last time.
      rejectedSignatureAddressRef.current = null;
    }
    wagmiAuthIntentRef.current = value;
    // Force a genuine state change even when re-setting the same boolean —
    // handleWagmiConnect relies on this update to re-fire (React bails out of
    // same-value setState). The effect only reads wagmiAuthIntentRef.current.
    setWagmiAuthIntentState(prev => (prev === value ? !prev : value));
  }, []);

  const openLoginModal = useCallback((options?: { intent?: 'login' | 'add-profile' }) => {
    connectionAbortedRef.current = false;
    // Freeze the animated WebGL backgrounds BEFORE anything renders. The sheet
    // composites two full-viewport backdrop-blur layers over them, and with the
    // fbm/particle shaders running underneath, that first composite is the
    // visible lag between tap and slide-up on weak GPUs. Same trade docs and
    // the arcade pages make (lib/background-gate): through the blur a frozen
    // frame is indistinguishable from an animated one. App schedules the idle
    // resume once the whole login flow has gone quiet.
    setBackgroundPaused(true);
    warmWalletOrigins();
    if (options?.intent === 'add-profile') {
      // The user is asking for a multi-account session on this device. The
      // live account joins the list NOW — before anything in the sheet can
      // displace it — and the ref marks the attempt so an abandoned sheet can
      // put everything back exactly as it was.
      const liveId = currentProfileId();
      adoptCurrentProfile();

      // How many profiles fit is a staking-badge allowance. Refuse BEFORE the
      // sheet opens: the add-profile flow takes the live session down on its
      // way through, so discovering the limit at the end would mean signing
      // somebody out of an account they cannot then save.
      const saved = listProfiles();
      const allowance = profileAllowance(saved);
      if (saved.length >= allowance.maxProfiles) {
        toast.error(`You can keep ${allowance.maxProfiles} profiles on this device`, {
          description: allowance.nextTierName
            ? `${allowance.tierName} tier holds ${allowance.maxProfiles}. Stake for ${allowance.nextTierName} to add another.`
            : 'Remove one from Settings → Profile to add a different account.',
          duration: 8000,
        });
        return;
      }
      addProfilePrevIdRef.current = liveId;
    } else {
      snapshotCurrentSession();
    }
    setLoginIntent(options?.intent === 'add-profile' ? 'add-profile' : 'login');
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    connectionAbortedRef.current = true;
    setIsLoginModalOpen(false);
    setLoginIntent('login');
    // An abandoned add-profile attempt gets undone, not just closed. If the
    // flow already displaced the live account (teardown ran, or the exchange
    // started writing), the previous account's snapshot goes back on disk and
    // the page reloads into it — closing the sheet must never cost the user
    // their session. When nothing was displaced yet, the keys still match and
    // closing is just closing.
    const attemptedFrom = addProfilePrevIdRef.current;
    addProfilePrevIdRef.current = null;
    if (attemptedFrom && currentProfileId() !== attemptedFrom) {
      const restored = applyProfileSnapshot(attemptedFrom);
      if (restored?.supabase) {
        // Awaited, exactly as switchToProfile awaits it. setSession persists
        // after at least one turn — and refreshes over the network first when
        // the stored access token has expired — so reloading straight into it
        // can land on a browser holding the restored account's DeHub keys with
        // no Supabase session under them. Worse, a refresh cut off mid-flight
        // has already rotated the pair server-side, which kills the stored
        // refresh token this profile switches back with.
        void (async () => {
          try {
            await Promise.race([
              supabase.auth.setSession({
                access_token: restored.supabase!.access_token,
                refresh_token: restored.supabase!.refresh_token,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Supabase session restore timed out')), 10_000),
              ),
            ]);
          } catch (e) {
            console.warn('[Auth] Restoring the previous profile lost its Supabase session:', e);
          }
          window.location.reload();
        })();
        return;
      }
      window.location.reload();
      return;
    }
    // Dismissing the modal abandons the login. The pending flag must go with
    // it: it was only ever removed on a COMPLETED login, so walking away at the
    // "create/unlock your wallet" step left it set forever. Every later page
    // load then saw a pending login, re-entered proceedToWalletPhase, and (now
    // that an untagged session counts as a different identity) would tear down
    // a perfectly healthy session the user never asked to end.
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
    // The freshness twin goes with it, so a sheet dismissed mid-resume can't
    // combine with a later stray flag into a surprise reopen.
    localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
    // The phase has to go too. LoginModal mirrors it into local step state on a
    // dependency change, so a phase left at 'unlock' after a dismissal both
    // reopens unrelated "Sign in" taps straight onto the unlock step and, worse,
    // makes the next genuine unlock request a no-op — neither dep changed, so
    // the effect never re-runs and the step never appears.
    setWalletPhase('none');
    if (isConnecting && !walletAddress) {
      setIsConnecting(false);
    }
  }, [isConnecting, walletAddress]);

  /**
   * Ask for the wallet password now.
   *
   * Renders without awaiting anything in the ordinary case. Looking the
   * Supabase session up FIRST — as this flow used to — meant a slow lookup
   * showed nothing at all, which is how a locked wallet became a dead end with
   * no dialog and nothing to press.
   *
   * The identity still has to come from somewhere when the cached id is absent,
   * though: sessions whose last full sign-in predates dehub_supabase_uid carry
   * the connection-source tag without it, and opening the signed-out sheet in
   * front of somebody who is demonstrably signed in is the other half of the
   * same bug. So the live session is consulted only on that branch, where there
   * is nothing to render yet anyway.
   *
   * Exposed on the context because until now the ONLY way to reach the unlock
   * step was a window event nobody could call deliberately: no toast action, no
   * menu item, no settings row could offer a way in.
   */
  const requestWalletUnlock = useCallback(() => {
    const cachedUid = supabaseUserId ?? localStorage.getItem('dehub_supabase_uid');
    if (cachedUid) {
      setSupabaseUserId(cachedUid);
      setWalletPhase('unlock');
      openLoginModal();
      return;
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const uid = data?.session?.user?.id;
        if (uid) {
          setSupabaseUserId(uid);
          setWalletPhase('unlock');
        }
        // No Supabase session either — there is genuinely no identity to unlock
        // against, and signing in is the right answer.
        openLoginModal();
      })
      .catch(() => openLoginModal());
  }, [supabaseUserId, openLoginModal]);

  /**
   * Produce the login signature WITHOUT any UI, using only key material that
   * is already legitimately available.
   *
   * This is what keeps the wallet password strictly contextual. The Supabase
   * exchange covers most logins with zero key material at all; when it cannot
   * run — identity not linked yet, endpoint switched off, a stale link — some
   * signature is genuinely required to establish the DeHub session, and THIS
   * is the last chance to produce one silently: a vault unlock still inside
   * its auto-lock window rehydrates without asking anything, and personal_sign
   * with that provider is local computation. Only when this returns false does
   * the login route to the password step.
   *
   * Safety: the restored key must provably belong to THIS identity's wallet
   * row before anything is signed or stored. After an identity switch the
   * local cache is deliberately cleared, which disables the vault's own
   * address check — so the signer address is matched against the row's EOA
   * and its predicted Safe here, and any disagreement aborts toward the
   * unlock step rather than risk linking the wrong wallet.
   */
  const finishLoginWithLiveUnlock = async (
    userId: string,
    ethAddress: string,
  ): Promise<boolean> => {
    try {
      if (!ethAddress) return false;
      const eoaProvider = await restoreWalletSession();
      if (!eoaProvider) return false;

      let signingProvider: any = eoaProvider;
      try {
        const aaProvider = await setupAAProvider();
        if (aaProvider) {
          setAAProvider(aaProvider);
          signingProvider = aaProvider;
        }
      } catch (e) {
        console.warn('[Auth] AA setup failed, falling back to EOA:', e);
      }

      const accounts: string[] = await signingProvider.request({ method: 'eth_accounts' });
      const signerAddress = accounts?.[0]?.toLowerCase();
      const allowed = new Set([ethAddress.toLowerCase()]);
      try {
        allowed.add((await predictSafeAddress(ethAddress)).toLowerCase());
      } catch { /* prediction is best-effort */ }
      if (!signerAddress || !allowed.has(signerAddress)) {
        authLogger.warn('Restored key does not match this identity\'s wallet — not signing', {
          signerAddress,
        });
        return false;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const { address, signature } = await signWithProvider(
        signingProvider,
        new Date(timestamp * 1000),
        'SMART-RESUME',
      );
      const meta = await getSupabaseAuthMeta();
      toast.loading('Signing in...', { id: 'auth-smart-wallet' });
      const authResponse = await authenticateWallet(address, signature, timestamp, 8453, meta);
      applyAuthenticatedSession(authResponse, address, userId, 'SMART-RESUME');
      toast.success(
        authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!',
        { id: 'auth-smart-wallet' },
      );
      closeLoginModal();
      return true;
    } catch (e) {
      // A refused signup is not a reason to ask for a password. The server has
      // said this wallet cannot open an account; the unlock step would prompt
      // for a vault password that cannot change that answer, so tell the person
      // why and stop rather than degrading into a dead end.
      if (reportWalletSignupBlocked(e)) throw e;
      // Locked vault, address mismatch, network failure — all land here and
      // fall back to the unlock step, exactly as before this existed.
      authLogger.warn('Silent login signature unavailable — routing to wallet unlock', {
        reason: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  };

  /**
   * After a Supabase session exists: look up the wallet row and route the
   * login modal to the create or unlock step.
   *
   * Every caller (the SIGNED_IN listener, verifyEmailOtp, verifyPhoneOtp,
   * OAuth redirect return) converges here, so the stale-identity check lives
   * HERE rather than being duplicated per caller. Without it, a browser that
   * still has a valid cached DeHub session (dehub_token/dehub_wallet/user)
   * from a DIFFERENT account keeps showing that account's data on screen
   * while this new identity's wallet flow runs underneath in the modal.
   */
  const proceedToWalletPhase = useCallback(async (userId: string) => {
    // An ABSENT tag means "unknown", which must be treated as "not this user" —
    // not as "same user, carry on". dehub_supabase_uid is written in exactly one
    // place (signAndAuthenticateSmartWallet, below), so every external-wallet
    // (wagmi) session and every session predating the tag has no tag at all.
    // Requiring a known-and-different uid here let those sessions survive a
    // sign-in as somebody else: account A stayed on screen while account B's
    // wallet flow ran in the modal, and because walletAddress was still A's
    // EOA, the address guard in signAndAuthenticateSmartWallet then threw
    // "Wallet address changed during session refresh" on every attempt —
    // making social login unreachable for anyone who had used a wallet first.
    //
    // Clearing an untagged session is safe: a genuine same-user return always
    // carries the tag, and a first-ever login has neither token nor wallet, so
    // the second half of the condition makes this a no-op.
    const cachedUid = localStorage.getItem('dehub_supabase_uid');
    const identityIsUnknownOrDifferent = !cachedUid || cachedUid !== userId;
    if (identityIsUnknownOrDifferent && (getAuthToken() || localStorage.getItem('dehub_wallet'))) {
      clearAuthSession();
      localStorage.removeItem('dehub_user');
      setUser(null);
      setWalletAddress(null);
      // Destroy the previous identity's key material as well. The unlock now
      // outlives the page, so a signed-in-as-somebody-else browser would
      // otherwise still be holding a usable key for the account it just
      // dropped. The vault read has its own address check as a backstop, but
      // that only engages once fetchWallet below has re-cached an address —
      // clearing here means there is no window at all.
      lockWallet();
      clearWalletCache();
    }
    setSupabaseUserId(userId);
    setConnectionSource('web3auth');
    writeConnectionSource('web3auth');
    try {
      const existing = await fetchWallet(userId);

      if (existing) {
        // A wallet already exists, so nothing here needs the seed: the address
        // is stored in the clear and the DeHub session can be minted from the
        // Supabase identity. Finish login with the wallet still locked, and let
        // the first action that actually signs ask for the unlock. This is the
        // difference between "log in, then immediately prove yourself again"
        // and "log in".
        if (await completeLoginWithoutUnlock(userId, existing.ethAddress)) {
          return;
        }
        // Exchange unavailable (identity not linked yet, endpoint off,
        // offline, stale link). Before routing to any password UI: a signature
        // may still be producible silently from a vault unlock inside its
        // auto-lock window. The password step is the LAST resort, reached only
        // when nothing else can establish the session.
        if (await finishLoginWithLiveUnlock(userId, existing.ethAddress)) {
          return;
        }
        setWalletPhase('unlock');
      } else {
        // No wallet row is two very different situations wearing the same
        // result: a brand-new social signup with nothing linked yet, and a
        // wallet-first (external-wallet) account signing in through an email
        // link attached from settings. The exchange tells them apart — its
        // success proves the backend holds a vetted link for THIS identity,
        // so finish the login right here. Routing to 'create' instead would
        // start generating a second wallet and silently split the account.
        if (await completeLoginWithoutUnlock(userId, '')) {
          return;
        }
        setWalletPhase('create');
      }
    } catch (e) {
      console.warn('[Auth] Wallet lookup failed, defaulting to create check on retry:', e);
      // Network hiccup — let the modal retry; default to unlock so we never
      // overwrite an existing wallet by accident.
      setWalletPhase('unlock');
    }
    openLoginModal();
    // completeLoginWithoutUnlock is recreated each render but closes only over
    // setters and refs; including it would rebuild this callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLoginModal]);

  // Check for existing DeHub session on mount
  useEffect(() => {
    // Keep this device's profile snapshots fresh (token refreshes, pagehide).
    initProfileTracking();
    const init = async () => {
      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        // Repair a live session whose connection-source tag went missing — a
        // failed connect attempt used to delete it outright, leaving people
        // signed in but unable to sign anything. Doing it here, once, fixes
        // every reader of the tag rather than each of them separately, and it
        // recovers already-stranded browsers on their next page load without
        // asking anyone to sign out and back in.
        if (token && savedWallet) {
          const healed = healConnectionSource();
          if (healed) setConnectionSource(healed);
        }

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
          const outcome = await refreshAccessTokenDetailed();
          if (outcome.ok && savedWallet) {
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
          } else if (outcome.ok) {
            // Refresh worked but there is no saved wallet to rehydrate from.
            // The session itself is fine — leave it alone.
          } else if (outcome.reason === 'transient' || outcome.reason === 'malformed') {
            // Reachability problem, not a dead session. Keep the cached
            // session and let the proactive refresh below retry: booting
            // offline (or before the radio is up) must not sign the user out.
            console.warn('[Auth] Silent refresh failed transiently on mount — keeping cached session');
            const cachedUser = localStorage.getItem('dehub_user');
            if (cachedUser && savedWallet) {
              try {
                setUser(JSON.parse(cachedUser));
                setWalletAddress(savedWallet);
              } catch { /* ignore */ }
            }
          } else {
            // 'revoked' or 'no-refresh-token' — genuinely unrecoverable.
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

      // "Already fully logged in, nothing to resume" is only true if the
      // cached DeHub session belongs to THIS Supabase user. Without this
      // check, a cross-device magic-link confirmation (or any SIGNED_IN for
      // a different account on a browser that still has an old, unexpired
      // DeHub session) would silently keep the OLD account on screen while
      // the underlying Supabase session had already switched users.
      const cachedUid = localStorage.getItem('dehub_supabase_uid');
      const sameIdentity = !!cachedUid && cachedUid === session.user.id;
      if (sameIdentity && getAuthToken() && !isTokenExpired() && localStorage.getItem('dehub_wallet')) {
        localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
        localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
        // Release a sheet this page mount opened for the expected resume:
        // nothing is left to wait for, and an open "Signing you in…" over an
        // already-valid session would just sit there until the watchdog.
        if (resumeOpenedAtBootRef.current) {
          resumeOpenedAtBootRef.current = false;
          setIsProcessingRedirect(false);
          closeLoginModal();
        }
        return;
      }
      // A different (or unknown) identity just signed in — proceedToWalletPhase
      // itself drops any stale DeHub-level session for the OLD identity before
      // routing this one, so it can't leave a leftover walletAddress tripping
      // the "address changed" guard in signAndAuthenticateSmartWallet.
      supaLoginHandledRef.current = true;
      setIsProcessingRedirect(true);
      // Resumes that start mid-session — the magic-link confirm page
      // navigating into /app, a cross-device broadcast — have no sheet up,
      // because nothing navigated away from THIS tab. Put it up now so the
      // wallet handoff happens inside the sheet instead of popping onto it
      // after the feed has already rendered. On a redirect return this is a
      // no-op: first paint already opened it.
      openLoginModal();
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
  }, [proceedToWalletPhase, openLoginModal, closeLoginModal]);

  // A resume expected at first paint must not hold the loader forever. If no
  // session lands within a generous window — consent abandoned, provider
  // error, the user closed Google's tab — release it so the sheet falls back
  // to the sign-in options instead of spinning eternally.
  useEffect(() => {
    if (!isProcessingRedirect || !resumeOpenedAtBootRef.current) return;
    const t = setTimeout(() => {
      // A resume that IS actively running gets to finish; only a silent one
      // is abandoned here.
      if (supaLoginHandledRef.current) return;
      resumeOpenedAtBootRef.current = false;
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
      setIsProcessingRedirect(false);
    }, 12000);
    return () => clearTimeout(t);
  }, [isProcessingRedirect]);

  // Mid-session unlock requests — a post, tip or stream attempted with the key
  // no longer in memory. Raised by aa-utils when no signing provider exists.
  useEffect(() => {
    const handler = () => {
      // Matches the condition aa-utils used to decide to raise this event at
      // all; if the two ever disagree the dialog silently never opens and the
      // action just fails.
      if (!isSmartWalletSession()) return;

      // How often this fires is the entire complaint about the built-in
      // wallet, and until now nothing counted it: authLogger.info is
      // console-only (lib/logger.ts drops info/debug before the network call),
      // so the backend only ever saw actions that FAILED on a locked wallet —
      // the tail, not the rate. warn is the cheapest level that actually
      // ships, and this is one row per prompt.
      const uid = localStorage.getItem('dehub_supabase_uid');
      authLogger.warn('Wallet unlock prompt shown', {
        // The question worth answering: are people typing a password because
        // biometrics genuinely aren't available on the device, or because this
        // device was never offered enrolment? Those need opposite fixes.
        biometricUsableHere: uid ? hasBiometricUsableHere(uid) : null,
        unlockInterval:
          localStorage.getItem(WALLET_UNLOCK_INTERVAL_KEY) || DEFAULT_WALLET_UNLOCK_INTERVAL,
        // createLogger's warn() has no user_address parameter, so carry it here
        // — without it the rows can't be counted per person, which is the only
        // way to tell "a few people posting a lot" from "everybody".
        //
        // Note this is the SMART ACCOUNT address, which does not join to
        // user_wallets.eth_address (the EOA). Carry the Supabase id too, or
        // linking a log row back to an account means a round-trip through the
        // DeHub profile API to translate one address into the other.
        walletAddress: localStorage.getItem('dehub_wallet'),
        supabaseUserId: uid,
        // Which of the two reasons this was: the auto-lock interval genuinely
        // elapsed, or we had nothing to restore. Without this the rows can't
        // distinguish a setting working as configured from a bug dropping the
        // key, and those need opposite fixes.
        reason: localStorage.getItem('dehub_wallet_unlocked_at') ? 'expired-or-unrestorable' : 'no-prior-unlock',
        path: window.location.pathname,
      });

      requestWalletUnlock();
    };
    window.addEventListener('dehub:wallet-unlock-required', handler);
    return () => window.removeEventListener('dehub:wallet-unlock-required', handler);
  }, [requestWalletUnlock]);

  // Reconnect DM socket when user logs in
  useEffect(() => {
    if (user && walletAddress && getAuthToken()) {
      reconnectDmSocket();
    }
  }, [user, walletAddress]);

  // On page restore, neither the key nor the AA provider is in memory even
  // though the unlock is still good. Rehydrate both in the background so the
  // first tip/post/tx after a refresh signs straight away instead of stopping
  // to ask for a password the user already gave us.
  //
  // isUnlockAvailable rather than isWalletUnlocked: the strict check is false
  // until the vault read lands, which is exactly the window this effect exists
  // to close.
  useEffect(() => {
    if (!user || connectionSource !== 'web3auth') return;
    if (getAAProvider()) return;
    if (!isUnlockAvailable()) return; // genuinely locked — unlock happens on demand

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
        const outcome = await refreshAccessTokenDetailed();
        if (outcome.ok) {
          console.log('[Auth] ✓ Proactive token refresh succeeded');
        } else if (outcome.reason === 'transient' || outcome.reason === 'malformed') {
          // This runs on an interval AND on every visibilitychange, so it is
          // the most likely place to catch a phone waking from sleep with the
          // radio still down. Clearing here — even past nominal expiry — turns
          // "unlocked my phone" into "logged out". The refresh token is still
          // valid; the next tick (or the next 401) will recover.
          console.warn('[Auth] Proactive refresh failed transiently — keeping session, will retry');
        } else {
          // 'revoked' or 'no-refresh-token' — the session really is over.
          console.warn('[Auth] Refresh token rejected — clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
          setUser(null);
          setWalletAddress(null);
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
      // auto-reconnect from extension storage. Drop wagmi for this window —
      // but only when nobody asked for it.
      //
      // `connectionSource` here is React's copy of an optimistic tag, and
      // connectWithWallet updates only the STORED one. So a browser still
      // tagged 'web3auth' — from a smart-wallet session that ended without an
      // explicit sign-out, or from a social login abandoned earlier in this
      // page's life — reaches a deliberate MetaMask connect with isConnecting
      // already true and this state still reading 'web3auth'. This branch then
      // threw the just-approved connection away before the signature could be
      // requested: the connect popup succeeded, no sign prompt ever appeared,
      // and isConnecting stayed latched so nothing on the page could retry.
      // Only a refresh cleared it — which is exactly the "connected, then
      // nothing happened" report, on the browsers that switch between the two
      // wallet kinds.
      //
      // An explicit intent means the wallet IS the login, not a stray
      // reconnect, so it is never the thing to throw away.
      if (!wagmiAuthIntentRef.current && isConnecting && connectionSource === 'web3auth') {
        if (isWagmiConnected && wagmiAddress) {
          // Silently dropping a live connection is precisely the kind of event
          // that leaves someone staring at a wallet that did nothing, and it
          // wrote no row at all. One line here is the difference between
          // reading the cause and guessing at it.
          authLogger.warn('Dropped an auto-reconnected wallet during smart-wallet login', {
            wagmiAddress: wagmiAddress.toLowerCase(),
            connectorId: wagmiConnector?.id,
            storedSource: readConnectionSource(),
            buildId: getRunningBuildId(),
          });
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
            const savedSrc = readConnectionSource();
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
        const savedSource = readConnectionSource();
        const hasUserIntent = wagmiAuthIntentRef.current;
        const hasToken = !!getAuthToken() && !isTokenExpired();
        const isReturningWagmiUser = savedSource === 'wagmi' && hasToken;

        // A refusal only counts against the untapped path: the returning-user
        // branch is the one that can fire on its own, and re-firing it into a
        // wallet whose owner just said no is how one dismissal turned into a
        // prompt that came back every time the state settled.
        const justRefused = rejectedSignatureAddressRef.current === wagmiAddress.toLowerCase();

        if (!hasUserIntent && (!isReturningWagmiUser || justRefused)) {
          return;
        }

        wagmiAuthInProgressRef.current = true;
        try {
          setIsConnecting(true);
          setConnectionSource('wagmi');
          writeConnectionSource('wagmi');
          // `isReturningWagmiUser` reaches here with no tap behind it: a live
          // connector plus a surviving token is enough. That is a signature
          // request the user did not ask for, so it must not be reported as one.
          await completeDeHubAuthWagmi(wagmiAddress, hasUserIntent ? 'user' : 'background');
          setWagmiAuthIntent(false);
          closeLoginModal();
        } catch (err) {
          console.error('[Auth] Wagmi auth failed:', err);
          setWagmiAuthIntent(false);
          setConnectionSource(savedSource);
          restoreConnectionSource(savedSource);
          if (isUserRejection(err)) {
            // Turning the signature down IS the cancel — the login is over, so
            // the connection behind it goes with it. Left attached, it was
            // picked straight back up: every later tap, including a tap on a
            // DIFFERENT wallet, found a live connection and asked this same
            // address to sign again. Dropping it also revokes the site's
            // permission where the wallet supports it, so the next connect
            // offers the account picker instead of silently reusing this one.
            rejectedSignatureAddressRef.current = wagmiAddress.toLowerCase();
            clearWagmiStorage();
            try {
              await wagmiDisconnectAsync();
            } catch { /* already gone */ }
          }
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
        lastWagmiConnectAtRef.current = Date.now();
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
   * Complete DeHub auth using Wagmi (Sign Message).
   *
   * Every failure in here used to end at `console.error`, and `createLogger`
   * does not patch the console — so the entire external-wallet login path wrote
   * nothing at all to `client_error_logs`. A report of "MetaMask says I rejected
   * the signature" could be answered only by guessing, because there was no row
   * to read. Both failure points now log, with enough context (which connector,
   * which provider code, which build) to tell the causes apart.
   */
  const completeDeHubAuthWagmi = async (address: string, trigger: WagmiAuthTrigger = 'user') => {
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const authAddress = address.toLowerCase();
    const connectorId = wagmiConnector?.id;
    const connectorName = wagmiConnector?.name;

    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${authAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    toast.info(
      trigger === 'user'
        ? 'Please sign the message in your wallet...'
        : 'Your session expired — approve the signature in your wallet to stay signed in.',
    );

    // The wallet's connect approval popup takes a moment to close, and a
    // signature request fired into that window is the reliable way to get a
    // prompt that never appears: the wallet queues it behind the closing
    // popup and never surfaces it, the promise never settles, and the whole
    // login sits wedged until a refresh. Give the popup time to finish
    // closing before asking for anything else. Sized to the fresh-connect
    // case only — a returning user whose connect happened minutes ago waits
    // zero.
    const POST_CONNECT_SIGN_GAP_MS = 800;
    const sinceConnect = Date.now() - lastWagmiConnectAtRef.current;
    if (sinceConnect >= 0 && sinceConnect < POST_CONNECT_SIGN_GAP_MS) {
      await new Promise(r => setTimeout(r, POST_CONNECT_SIGN_GAP_MS - sinceConnect));
    }

    // Time-box the signature. When the request never settles (see the gap
    // wait above — the popup-race case queues it invisibly), no catch and no
    // finally ever runs, which is what used to leave isConnecting latched and
    // the auth guard closed for the life of the page. Long enough for a
    // hardware wallet behind MetaMask; a dismissal or rejection settles the
    // promise and never waits this out.
    const SIGN_TIMEOUT_MS = 60_000;
    let signature: string;
    let signTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const signPromise = signMessageAsync({
        message,
        account: address as `0x${string}`,
      });
      // If the timeout wins the race this promise is orphaned, and a
      // dismissal arriving after that must not surface as an unhandled
      // rejection. (A signature arriving late is dropped the same way — the
      // flow has already told the user to retry.)
      signPromise.catch(() => {});
      signature = await Promise.race([
        signPromise,
        new Promise<never>((_, reject) => {
          signTimeoutTimer = setTimeout(
            () => reject(new WalletRequestTimeoutError('signature', SIGN_TIMEOUT_MS)),
            SIGN_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (signError: any) {
      const rejected = isUserRejection(signError);
      const alreadyPending = isRequestAlreadyPending(signError);
      const timedOut = isRequestTimeout(signError);
      const described = describeWalletError(signError);
      // Only worth a round-trip on the branch where the answer changes what we
      // say. A rejection is a rejection whatever build the tab is running, and
      // a stale build doesn't make a wallet go quiet.
      const staleBuild = rejected || timedOut ? null : await isRunningStaleBuild();

      authLogger.error('Wallet signature failed', {
        trigger,
        rejected,
        alreadyPending,
        timedOut,
        staleBuild,
        connectorId,
        connectorName,
        buildId: getRunningBuildId(),
        address: authAddress,
        ...described,
      }, signError);

      if (timedOut) {
        toast.error('Your wallet never showed the request', {
          description: 'Open your wallet and check for a pending signature, then try again.',
        });
      } else if (staleBuild) {
        // The tab has been open across a deploy. Nothing the user does to the
        // wallet will help, and telling them to try again just repeats it.
        toast.error('DeHub has been updated', {
          description: 'This tab is running an older version. Refresh, then sign in again.',
          action: { label: 'Refresh', onClick: () => window.location.reload() },
          duration: 12_000,
        });
      } else if (alreadyPending) {
        toast.error('Your wallet already has a request open', {
          description: 'Approve or dismiss it in your wallet, then try again.',
        });
      } else if (rejected) {
        toast.error(
          trigger === 'user'
            ? 'Signature rejected. Please try again.'
            : 'Signature dismissed. Sign in again whenever you are ready.',
        );
      } else {
        // Explicitly NOT called a rejection any more. This is the branch that
        // used to accuse people of declining a prompt that had failed on its own.
        toast.error('Wallet signature failed. Please try again.', {
          description: described.shortMessage,
        });
      }
      throw signError;
    } finally {
      clearTimeout(signTimeoutTimer);
    }

    // Address guard: prevent silent account switch during session refresh.
    // An add-profile attempt is the opposite of silent — the user asked to
    // sign in as somebody else — so the mismatch is expected there. From this
    // line on the sheet's promise shifts: closing it restores the previous
    // account rather than doing nothing, and staging wipes the outgoing
    // account's keys before the exchange writes the incoming ones (the vault
    // is single-slot, and a stale dehub_supabase_uid would mislink every
    // later refresh). This connection's wagmi storage stays — it belongs to
    // the wallet that just signed.
    const attemptedFrom = addProfilePrevIdRef.current;
    if (attemptedFrom != null) {
      // The ref stays armed across the exchange. Clearing it here left the
      // window between "the outgoing account's keys are wiped" and "the
      // incoming account's are written" with no way back: an exchange that
      // 500s, or a network that drops, ended with nothing signed in on disk
      // and closeLoginModal no longer able to put the previous account back.
      // It is cleared once this login has actually landed, below.
      stageIncomingIdentity({ keepWagmiKeys: true });
    } else if (
      walletAddress &&
      walletAddress.toLowerCase() !== authAddress.toLowerCase()
    ) {
      throw new Error('Wallet address changed during session refresh. Please sign in again.');
    }

    const BASE_CHAIN_ID = 8453;
    let authResponse: AuthResponse;
    try {
      authResponse = await authenticateWallet(authAddress, signature, timestamp, BASE_CHAIN_ID);
    } catch (authError: any) {
      // A signature the wallet happily produced, refused one step later. The
      // only caller catches this into a console.error, so the whole visible
      // result was a spinner stopping and nothing happening — no toast, no row.
      authLogger.error('Wallet auth exchange failed', {
        trigger,
        connectorId,
        connectorName,
        buildId: getRunningBuildId(),
        address: authAddress,
        chainId: BASE_CHAIN_ID,
        status: authError?.status,
        ...describeWalletError(authError),
      }, authError);
      if (!reportWalletSignupBlocked(authError)) {
        toast.error('Could not complete sign-in. Please try again.');
      }
      throw authError;
    }

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

    // External-wallet accounts join this device's profile list here: they have
    // no Supabase identity, so applyAuthenticatedSession (which snapshots for
    // every other flow) never runs on their path. An add-profile attempt adds
    // the new account explicitly; any other login only refreshes what is
    // already listed. The pending-login flags die here too — a login that
    // COMPLETED must never leave them behind to trap the next sheet-open into
    // a "Signing you in…" step that swallows clicks.
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
    localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
    if (attemptedFrom != null) {
      addProfilePrevIdRef.current = null;
      adoptCurrentProfile();
    } else {
      snapshotCurrentSession();
    }

    toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!');
    authLogger.info('Login success', { method: 'wagmi', address: authAddress, username: normalizedUser.username, isNewAccount: !!authResponse.result?.isNewAccount });
  };

  /**
   * Sign the DeHub auth message with the active smart-wallet session and
   * establish the DeHub backend session. Prefers the Safe Smart Account
   * (sponsored gas, same address as the old Web3Auth flow for the same key);
   * falls back to the EOA if Pimlico is unavailable.
   */
  /**
   * Apply a successful DeHub auth response to local state and storage.
   *
   * Shared by the two ways a session can be established — signing with the
   * wallet, and exchanging a Supabase session (see completeLoginWithoutUnlock).
   * Kept in one place deliberately: two copies of "what it means to be logged
   * in" would drift, and a missing line here is a half-logged-in user.
   *
   * @param supabaseUid Passed explicitly rather than read from state, because
   *   the Supabase path runs before setSupabaseUserId has been committed. Null
   *   is tolerated — the signing path hands over the state value, which is why
   *   the storage fallback below exists rather than a guard.
   */
  const applyAuthenticatedSession = (
    authResponse: AuthResponse,
    address: string,
    supabaseUid: string | null,
    flow: string,
    // 'web3auth' for every smart-wallet session. The one exception is a login
    // that arrived through an email link on an account with no built-in
    // wallet: its signatures will come from an external wallet via wagmi, so
    // tagging it 'web3auth' would route signing into unlock prompts for a
    // vault that does not exist.
    source: ConnectionSource = 'web3auth',
  ) => {
    // The same three sources, in the same order, that refreshSession consults
    // before attempting the exchange. It built that chain for the READ and then
    // passed the raw state value here for the WRITE, so a login completed on a
    // page load that never ran a login flow tagged nothing and recorded
    // nothing — and the next page load had no evidence it had ever happened.
    const uid =
      supabaseUid ?? localStorage.getItem('dehub_supabase_uid') ?? readLastSession()?.uid ?? null;
    const normalizedUser = normalizeUser(authResponse.user, address);
    localStorage.setItem('dehub_wallet', address);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
    writeConnectionSource(source);
    // Tag this DeHub session with the Supabase identity that produced it, so
    // a LATER sign-in as a DIFFERENT Supabase user (e.g. via the cross-device
    // magic-link sync) can tell "still me, just refreshing" apart from
    // "someone else signed in on this browser" instead of silently keeping
    // this account's data on screen.
    if (uid) localStorage.setItem('dehub_supabase_uid', uid);
    // Unlike the uid tag, this record survives clearAuthSession on purpose
    // (see connection-source.ts): after a zombie-session cleanup or a rejected
    // refresh wipes the session keys, it is what still lets the next login for
    // this identity verify the linked address without a wallet signature.
    if (uid) writeLastSession(uid, address);
    setConnectionSource(source);
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

    // Every key this profile owns is now on disk — record it on the device's
    // profile list at the one moment all writers have finished. An add-profile
    // attempt adds the new account explicitly; every other login (including
    // same-user session refreshes) only refreshes what is already listed, so
    // a shared browser never turns into a directory of whoever once typed
    // their email here. The pending-login flags die with the completed login —
    // a stale one forces the next sheet onto its click-swallowing "Signing
    // you in…" step until a watchdog lets it go.
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
    localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
    if (addProfilePrevIdRef.current != null) {
      addProfilePrevIdRef.current = null;
      adoptCurrentProfile();
    } else {
      snapshotCurrentSession();
    }

    authLogger.info('Login success', {
      method: flow.toLowerCase(),
      address,
      username: normalizedUser.username,
      isNewAccount: !!authResponse.result?.isNewAccount,
    });

    return normalizedUser;
  };

  /**
   * Finish logging in WITHOUT unlocking the wallet, by exchanging the current
   * Supabase session for a DeHub token.
   *
   * The whole point is that a returning user gets no password or biometric
   * prompt on entry: their key stays encrypted until something actually needs a
   * signature, at which point aa-utils raises dehub:wallet-unlock-required and
   * they are asked then — in context, having chosen to do the thing.
   *
   * Returns false when the exchange is unavailable for any reason (identity not
   * linked yet, endpoint switched off server-side, network failure). Every such
   * case is non-fatal: the caller falls back to the unlock-and-sign flow, which
   * is exactly the previous behaviour.
   *
   * `ethAddress` is the EOA from user_wallets, and may be '' when the caller
   * has no wallet row handy (the session-refresh path); the last-session check
   * below carries the verification alone in that case.
   */
  const completeLoginWithoutUnlock = async (
    userId: string,
    ethAddress: string,
  ): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) return false;

      const authResponse = await authenticateWithSupabaseSession(accessToken);
      const address = (authResponse.user?.address || ethAddress).toLowerCase();
      if (!address) {
        // The exchange succeeded, so a DeHub token is already in storage, but
        // there is no address to hang a session on. Drop the token rather than
        // leave an authenticated API client sitting behind a logged-out UI.
        clearAuthSession();
        return false;
      }

      // The backend links whatever address the user last SIGNED with. On the AA
      // flow that is the Safe smart account, while user_wallets stores the owner
      // EOA the seed derives to — two different strings for the same person.
      //
      // The two cheap checks come first because they cost nothing. Session
      // continuity is the strongest: the address the last completed login for
      // this SAME Supabase identity ran under, on this browser. EOA equality is
      // the one that matches when the link was created by an EOA-flow signature.
      //
      // Neither helps on a browser that has not completed a login before, which
      // is where this was failing: EOA equality can never hold for a
      // smart-account user, so every first login on a new browser, phone or
      // in-app webview was rejected and sent to the wallet-password sheet. 40
      // rejections across ~24 accounts in the five days to 2026-08-21, every one
      // with no prior session record.
      //
      // So when both miss, derive the answer instead of asking the browser to
      // remember it. A Safe's address is a pure CREATE2 function of its owner
      // ADDRESS — no key involved — so predicting it from the stored EOA proves
      // the linked account is the smart account of the wallet this Supabase
      // identity owns per user_wallets, which is an RLS-scoped read keyed on the
      // authenticated user. Checked against every account seen failing in
      // production: 29 of 32 predicted the exact linked address, and all three
      // that did not were stale links — two at addresses never deployed on Base,
      // one at a Safe owned by a different key entirely. Those must keep failing
      // closed, which is also what protects the case the backend cannot see: a
      // wallet replaced locally and not yet re-signed with still predicts to the
      // NEW Safe, so the OLD link is refused and signing re-establishes it.
      // An email-link login carries its proof with it: the backend only puts
      // loginLinkSource:'wallet-email' on a link its own confirm endpoint
      // wrote after a wallet-signed session, so the linked address needs no
      // local corroboration — and on a browser that has never held this
      // account's wallet there is nothing local to corroborate with anyway.
      const serverLinkedEmail = authResponse.user?.loginLinkSource === 'wallet-email';
      const lastSessionAddress = readLastSessionAddress(userId);
      const storedEoa = ethAddress ? ethAddress.toLowerCase() : null;
      let matched: 'last-session' | 'stored-eoa' | 'predicted-safe' | null =
        lastSessionAddress === address ? 'last-session' : storedEoa === address ? 'stored-eoa' : null;
      if (!matched && storedEoa) {
        matched = (await predictSafeAddress(storedEoa)) === address ? 'predicted-safe' : null;
      }
      if (!matched && !serverLinkedEmail) {
        authLogger.warn('Supabase session maps to a different wallet — falling back to signing', {
          linked: address,
          stored: storedEoa,
          // null = this browser has no completed login for this identity, which
          // is now expected rather than fatal; the prediction carries it.
          lastSession: lastSessionAddress,
        });
        return false;
      }

      applyAuthenticatedSession(
        authResponse,
        address,
        userId,
        'SUPABASE',
        // No built-in wallet behind this account: future signatures come from
        // an external wallet via wagmi, not from vault unlocks.
        serverLinkedEmail && !ethAddress ? 'wagmi' : 'web3auth',
      );
      closeLoginModal();
      return true;
    } catch (e) {
      if (e instanceof WalletNotLinkedError) {
        // warn, not info: lib/logger.ts drops info before the network call, so
        // this whole branch was invisible in client_error_logs while the
        // rejection beside it was not — and it covers WALLET_LINK_AMBIGUOUS,
        // which is a real fault rather than a first-login formality.
        authLogger.warn('No wallet linked to this login yet — signing once to link it', {
          reason: e.message,
        });
      } else {
        authLogger.warn('Supabase session exchange unavailable, falling back to signing', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return false;
    }
  };

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

    applyAuthenticatedSession(authResponse, address, supabaseUserId, flow);

    toast.success(authResponse.result?.isNewAccount ? 'Welcome to DeHub!' : 'Welcome back!', { id: toastId });
  };

  /**
   * Decrypt and return the raw private key for the CURRENT wallet — the
   * supported backup path (we don't generate recovery phrases/codes for new
   * wallets anymore). Always re-asks the wallet password, even if already
   * unlocked in this tab — exporting the key is sensitive enough to
   * re-verify, and it works whether or not a live session exists yet.
   */
  const exportPrivateKey = async (password: string): Promise<string> => {
    if (!supabaseUserId) throw new Error('Not signed in');
    const wallet = await fetchWallet(supabaseUserId);
    if (!wallet) throw new Error('No wallet found for this account.');
    if (!wallet.payload) {
      throw new Error('This wallet has no password — export it with biometrics instead.');
    }
    const secret = await decryptString(wallet.payload, password);
    return deriveFromSecret(secret).ethPrivateKey;
  };

  /**
   * Export via biometrics. Deliberately re-verifies with the authenticator
   * rather than reusing the unlocked session key: revealing the private key is
   * sensitive enough to demand a fresh user-presence check, matching how the
   * password path always re-asks.
   */
  const exportPrivateKeyWithBiometrics = async (): Promise<string> => {
    if (!supabaseUserId) throw new Error('Not signed in');
    const secret = await unlockWithBiometrics(supabaseUserId);
    return deriveFromSecret(secret).ethPrivateKey;
  };

  /**
   * Replace the active wallet with a DIFFERENT one — e.g. a second old
   * Web3Auth-era account under the same email (Supabase links Google/Email
   * logins that share a verified email into one identity, so only one
   * wallet can be active at a time; this lets the user swap which one that
   * is). Re-encrypts `secret` under `password` and overwrites the
   * user_wallets row. The PREVIOUS wallet's encrypted seed is gone once this
   * completes — callers must have the user export/back it up first.
   */
  const switchActiveWallet = async (secret: string, password: string) => {
    if (!supabaseUserId) throw new Error('Not signed in');
    const toastId = 'auth-switch-wallet';
    setIsConnecting(true);
    try {
      const derived = deriveFromSecret(secret);
      const encrypted = await encryptString(derived.secret, password);
      await saveWallet(supabaseUserId, derived.ethAddress, encrypted);
      // Every biometric wrap still holds the PREVIOUS wallet's seed, so they
      // would now unlock the wrong wallet. Drop them all — the user re-enrols
      // from Settings — rather than leave credentials that silently disagree
      // with the active wallet.
      //
      // Best-effort by design: the switch itself already succeeded above, so
      // throwing here would report a completed switch as a failure. If cleanup
      // does fail, biometric unlock refuses any wrap whose address doesn't
      // match the wallet row, so the worst case is a clear error rather than
      // signing in to the wrong wallet.
      try {
        await deleteAllPasskeyWraps(supabaseUserId);
      } catch (e) {
        console.warn('[Auth] Could not clear biometric wraps after wallet switch:', e);
      }
      clearWalletCache();
      clearPasskeyCache();
      lockWallet();
      // Drop the stale address so signAndAuthenticateSmartWallet's "address
      // changed" guard (meant to catch accidental switches during a session
      // refresh) doesn't block this INTENTIONAL switch.
      setWalletAddress(null);
      await activateWalletKey(derived.ethPrivateKey);
      await signAndAuthenticateSmartWallet(toastId);
      toast.success('Switched to the other wallet', { id: toastId });
    } catch (err: any) {
      console.error('[Auth] Wallet switch failed:', err);
      toast.error(err?.message || 'Failed to switch wallet', { id: toastId });
      throw err;
    } finally {
      setIsConnecting(false);
    }
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
      localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
      closeLoginModal();
    } catch (err: any) {
      console.error('[Auth] Smart-wallet login failed:', err);
      // Same wording as every other path — the generic title here read as a
      // transient failure over a message explaining a permanent one.
      if (!reportWalletSignupBlocked(err)) {
        toast.error(err?.message || 'Authentication failed', { id: toastId });
      }
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

    // What the browser was tagged as before this attempt. Restored if the
    // attempt fails: someone already signed in who tries a second login method
    // and gives up must not lose the session they still have.
    const previousSource = readConnectionSource();

    setIsConnecting(true);
    setConnectionSource('web3auth');
    writeConnectionSource('web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');
    localStorage.setItem(SUPA_LOGIN_PENDING_AT_KEY, String(Date.now()));

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
      setConnectionSource(previousSource);
      restoreConnectionSource(previousSource);
      setIsConnecting(false);
    }
  };

  /**
   * Email login step 1: send a 6-digit OTP via Supabase Auth.
   * The login modal then shows the code-entry step and calls verifyEmailOtp.
   */
  const connectWithEmail = async (email: string) => {
    const previousSource = readConnectionSource();

    setIsConnecting(true);
    setConnectionSource('web3auth');
    writeConnectionSource('web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');
    localStorage.setItem(SUPA_LOGIN_PENDING_AT_KEY, String(Date.now()));

    // Generate a per-request nonce for cross-device sync. The initiating
    // device (this one) subscribes to a realtime channel keyed by the nonce
    // and passes it through the magic link via emailRedirectTo. When the
    // link is opened on any device, /auth/confirm broadcasts the session
    // tokens back here and this tab hydrates via setSession() — so the user
    // ends up signed in on both browsers/devices.
    const syncNonce = crypto.randomUUID();
    try {
      // Tear down any previous sync channel from an earlier attempt.
      if (emailSyncCleanupRef.current) {
        try { emailSyncCleanupRef.current(); } catch { /* ignore */ }
        emailSyncCleanupRef.current = null;
      }
      const channel = supabase.channel(`auth-sync-${syncNonce}`, {
        config: { broadcast: { self: false, ack: false } },
      });
      channel.on('broadcast', { event: 'session' }, async (msg) => {
        const payload = (msg as any)?.payload || {};
        const access_token = payload.access_token as string | undefined;
        const refresh_token = payload.refresh_token as string | undefined;
        if (!access_token || !refresh_token) return;
        try {
          supaLoginHandledRef.current = true;
          setIsProcessingRedirect(true);
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          const uid = data?.session?.user?.id;
          if (uid) await proceedToWalletPhase(uid);
          toast.success('Signed in — link confirmed on another device');
        } catch (err) {
          console.error('Cross-device session hydrate failed:', err);
        } finally {
          setIsProcessingRedirect(false);
          supaLoginHandledRef.current = false;
          try { await supabase.removeChannel(channel); } catch { /* ignore */ }
          emailSyncCleanupRef.current = null;
        }
      });
      // Wait for the channel to actually be SUBSCRIBED before sending the
      // magic link. Without this, signInWithOtp could fire (and the user
      // could tap the email link) before this tab's realtime subscription
      // was live on the server — the broadcast would be sent to no one and
      // silently lost. This only affects the cross-device path above; this
      // device's own sign-in in AuthConfirm.tsx never depends on it.
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; resolve(); };
        channel.subscribe((status) => { if (status === 'SUBSCRIBED') finish(); });
        setTimeout(finish, 2500);
      });
      emailSyncCleanupRef.current = () => {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      };

      try {
        await wagmiDisconnect();
        clearWagmiStorage();
      } catch { /* ignore */ }

      const redirectTo = `${window.location.origin}/auth/confirm?sync=${syncNonce}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      toast.success('Magic link sent — check your email');
    } catch (error: any) {
      console.error('Email login error:', error);
      toast.error(error?.message || 'Failed to send magic link. Please try again.');
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      setConnectionSource(previousSource);
      restoreConnectionSource(previousSource);
      if (emailSyncCleanupRef.current) {
        try { emailSyncCleanupRef.current(); } catch { /* ignore */ }
        emailSyncCleanupRef.current = null;
      }
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const cancelEmailMagicLink = () => {
    if (emailSyncCleanupRef.current) {
      try { emailSyncCleanupRef.current(); } catch { /* ignore */ }
      emailSyncCleanupRef.current = null;
    }
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
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
      // Hold "Signing you in…" over the sheet while the wallet row lookup and
      // session exchange run, rather than leaving the code form frozen.
      setIsProcessingRedirect(true);
      try {
        await proceedToWalletPhase(uid);
      } finally {
        setIsProcessingRedirect(false);
      }
    } catch (error: any) {
      console.error('OTP verification error:', error);
      throw new Error(error?.message || 'Invalid code. Please try again.');
    } finally {
      supaLoginHandledRef.current = false;
      setIsConnecting(false);
    }
  };

  /**
   * Phone login step 1: send a 6-digit OTP via the request-phone-otp edge
   * function. Not supabase.auth.signInWithOtp — the native Phone provider
   * needs Authentication -> Hooks -> Send SMS enabled to route through
   * CloudTalk, and that toggle isn't reachable from this project's
   * management surface, so request-phone-otp/verify-phone-otp do the same
   * job directly (see their source for the full explanation).
   */
  const connectWithSMS = async (phone: string) => {
    const previousSource = readConnectionSource();

    setIsConnecting(true);
    setConnectionSource('web3auth');
    writeConnectionSource('web3auth');
    localStorage.setItem(SUPA_LOGIN_PENDING_KEY, '1');

    try {
      try {
        await wagmiDisconnect();
        clearWagmiStorage();
      } catch { /* ignore */ }

      const { data, error } = await supabase.functions.invoke('request-phone-otp', {
        body: { phone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Verification code sent — check your phone');
    } catch (error: any) {
      console.error('Phone login error:', error);
      toast.error(error?.message || 'Failed to send verification code. Please try again.');
      localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
      setConnectionSource(previousSource);
      restoreConnectionSource(previousSource);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Phone login step 2: verify the OTP via verify-phone-otp, which hands back
   * a real session (see connectWithSMS for why this isn't
   * supabase.auth.verifyOtp). On success the wallet phase is resolved and the
   * modal advances to create/unlock.
   */
  const verifyPhoneOtp = async (phone: string, code: string) => {
    setIsConnecting(true);
    supaLoginHandledRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone-otp', {
        body: { phone, code: code.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const session = data?.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error('Verification failed. Please try again.');
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      const uid = sessionData?.session?.user?.id;
      if (sessionError || !uid) throw new Error(sessionError?.message || 'Verification failed. Please try again.');
      // Same as the email path: hold "Signing you in…" over the round trips.
      setIsProcessingRedirect(true);
      try {
        await proceedToWalletPhase(uid);
      } finally {
        setIsProcessingRedirect(false);
      }
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
    // Tagged optimistically, before the connector has agreed to anything. This
    // is the path that stranded people: a signed-in smart-wallet user who
    // opened the modal, tapped MetaMask and dismissed its prompt had their
    // 'web3auth' tag overwritten here and then deleted in the catch below,
    // which left them signed in but unable to post, tip or stream.
    const previousSource = readConnectionSource();

    setIsConnecting(true);
    setWagmiAuthIntent(true);
    writeConnectionSource('wagmi');

    try {
      let connector = connectors.find(c => connectorMatchesWallet(c, wallet));

      if (!connector && isWalletInAppBrowser()) {
        connector = connectors.find(c => c.id === 'injected');
      }

      if (!connector) {
        throw new Error(`Connector for ${wallet} not found`);
      }

      // Another wallet is still attached. wagmi would keep it as the active
      // connection and hand the sheet its address back, so the signature would
      // go to the wallet the user is trying to leave — which is what made
      // switching impossible. Drop it before opening the new one.
      if (isWagmiConnected && wagmiConnector && wagmiConnector.uid !== connector.uid) {
        clearWagmiStorage();
        try {
          await wagmiDisconnectAsync();
        } catch { /* already gone */ }
        await new Promise(r => setTimeout(r, 100));
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
      lastWagmiConnectAtRef.current = Date.now();
      return true;
    } catch (err: any) {
      setIsConnecting(false);
      setWagmiAuthIntent(false);
      restoreConnectionSource(previousSource);

      const rejected = isUserRejection(err);
      authLogger.error('Wallet connection failed', {
        wallet,
        rejected,
        buildId: getRunningBuildId(),
        ...describeWalletError(err),
      }, err);

      if (rejected) {
        toast.error('Connection rejected');
      } else {
        const names: Record<string, string> = { metamask: 'MetaMask', phantom: 'Phantom', trust: 'Trust Wallet' };
        toast.error(`Failed to connect to ${names[wallet] || wallet}. Please try again.`);
      }
      return false;
    }
  };

  const disconnect = async (options?: { forgetProfile?: boolean }) => {
    // Best-effort server-side token revocation (fire-and-forget)
    logoutFromServer().catch(() => {});

    // Read the identity off storage before any of it is cleared below, so an
    // explicit sign-out can drop that account from this device's profile list.
    const forgetId = options?.forgetProfile ? currentProfileId() : null;

    // Clean up local state FIRST for immediate UI feedback
    clearAuthSession();
    localStorage.removeItem('dehub_user');
    localStorage.removeItem('dehub_wallet');
    clearConnectionSource();
    // Only an explicit sign-out clears this; it survives every other teardown
    // so a later login can skip the wallet signature (see connection-source.ts).
    clearLastSession();
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
    localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
    clearEngagementCaches();
    // "Log out" means this browser forgets the session — its stored profile
    // snapshot (now-dead tokens) goes with it. Other saved profiles stay.
    if (forgetId) removeProfile(forgetId);

    setWalletAddress(null);
    setUser(null);
    setConnectionSource(null);
    setIsConnecting(false);
    setIsLoading(false);
    setWalletPhase('none');
    setSupabaseUserId(null);
    wagmiAuthInProgressRef.current = false;
    rejectedSignatureAddressRef.current = null;
    setWagmiAuthIntent(false);

    disconnectDmSocket();
    queryClient.clear();
    // clear() only empties the in-memory cache. The persisted slice now carries
    // the conversation list, so it has to be removed outright rather than left
    // for the idle writer to overwrite — a tab closed right after logging out
    // never reaches that write.
    clearPersistedQueryCache();

    // Provider-level disconnect AFTER local cleanup (non-blocking)
    try {
      if (connectionSource === 'web3auth') {
        clearAAProvider();
        lockWallet();
        // Encrypted-only caches; clearing avoids stale rows when a different
        // user logs in on this device next.
        clearWalletCache();
        clearPasskeyCache();
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

  /**
   * Become another profile saved on this device. Silent when its session can
   * be restored from the snapshot; otherwise the sign-in sheet opens (titled
   * "Add a profile") and completing it lands on that account.
   *
   * The switch finishes with a reload: too much state hangs off these keys —
   * the DM socket, the wallet vault, per-account caches — for an in-place swap
   * to be trustworthy, and boot already knows how to hydrate a set of keys.
   */
  const switchToProfile = async (id: string) => {
    if (!id || id === currentProfileId()) return;
    // Remember who was live before the swap: if the restore fails, disk has
    // to go back to them — an authed request must never read a half-switched
    // identity, and the app keeps running while the sheet opens.
    const prevId = currentProfileId();
    const plan = beginProfileSwitch(id);
    if (!plan) {
      openLoginModal({ intent: 'add-profile' });
      return;
    }
    try {
      if (plan.supabase) {
        // Re-seats AND persists the stored session; a stale access token is
        // refreshed here against its still-unused refresh token.
        //
        // Raced against a timeout because a hung re-seat would never reach the
        // reload below: switchGuarded stays true, every snapshot listener is
        // blocked from then on, and the registry quietly goes stale while the
        // live account keeps rotating its refresh token — the next switch
        // would then submit a dead one and get both sessions revoked. A late
        // completion after abort is tolerated: abortProfileSwitch has already
        // wiped Supabase storage as part of restoring the previous account,
        // and a straggling persist can only be corrected by the next login or
        // switch, which wipe it again.
        await Promise.race([
          supabase.auth.setSession({
            access_token: plan.supabase.access_token,
            refresh_token: plan.supabase.refresh_token,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Supabase session restore timed out')), 10_000),
          ),
        ]);
      }
      if (plan.uid) writeLastSession(plan.uid, plan.address);
      window.location.reload();
    } catch (e) {
      console.warn('[Auth] Profile switch failed to restore its session:', e);
      abortProfileSwitch(prevId);
      openLoginModal({ intent: 'add-profile' });
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

  /**
   * Re-establish a usable DeHub session.
   *
   * `force` skips the "the token still looks fine locally" shortcut. Callers
   * reacting to a REJECTED request must pass it: expiry here is pure arithmetic
   * on the device clock (isTokenExpired), so a token the server has revoked —
   * or one whose real expiry disagrees with ours because the clock drifted, the
   * account was suspended, or a deploy rotated the signing secret — still looks
   * valid locally. Returning true in that state made every recovery path report
   * "Session restored — please try again", let the user retry, fail identically,
   * and loop forever with no way out but a manual sign-out.
   */
  const refreshSession = async (force = false): Promise<boolean> => {
    const token = getAuthToken();
    if (!force && token && !isTokenExpired()) return true;

    // ── Step 1: refresh token (no wallet interaction needed) ──
    const rt = getRefreshToken();
    if (rt) {
      const outcome = await refreshAccessTokenDetailed();
      if (outcome.ok) return true;
      if (outcome.reason === 'transient' || outcome.reason === 'malformed') {
        // Escalating to a wallet signature prompt here would ask the user to
        // approve a signature over the same connection that just failed —
        // it cannot succeed, and it trains people to re-sign constantly.
        console.warn('[Auth] Refresh failed transiently — not escalating to wallet re-sign');
        return false;
      }
      console.warn('[Auth] Refresh token rejected, falling back to wallet re-sign');
    }

    // ── Step 2: wallet re-sign ──
    const walletBefore = walletAddress || localStorage.getItem('dehub_wallet');
    const savedSource = readConnectionSource();

    if ((connectionSource === 'wagmi' || savedSource === 'wagmi') && isWagmiConnected && wagmiAddress) {
      try {
        setConnectionSource('wagmi');
        writeConnectionSource('wagmi');
        // Reached from any 401 mid-session (use-reauth-handler, usePostForm), so
        // the wallet popup lands while the user is tipping or posting and has
        // asked for nothing of the sort. Say why it appeared.
        await completeDeHubAuthWagmi(wagmiAddress, 'background');
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

    if (connectionSource === 'web3auth' || savedSource === 'web3auth') {
      // ── Step 2a: Supabase session exchange — still no wallet interaction ──
      // The Supabase client refreshes its own token independently of ours, so
      // it is usually still alive when the DeHub refresh token has died. Until
      // now this path went straight to re-signing, which needs the decrypted
      // key — so an expired session with a locked wallet became a password
      // prompt for something a plain HTTP exchange could have done.
      //
      // Sources are consulted in memory-then-storage order because a rejected
      // refresh has already run clearAuthSession by the time we get here,
      // taking the uid tag with it; the last-session record is the one place
      // that survives that wipe.
      const uid =
        supabaseUserId ?? localStorage.getItem('dehub_supabase_uid') ?? readLastSession()?.uid;
      if (uid && await completeLoginWithoutUnlock(uid, getCachedWallet()?.ethAddress ?? '')) {
        return true;
      }

      // ── Step 2b: silent re-sign if the key session is still live ──
      try {
        // Rehydrate from the vault before concluding anything: after a reload
        // the key is not in memory yet, and treating that as "locked" here is
        // what turned an ordinary token refresh into a password prompt.
        if (!isWalletUnlocked() && !await restoreWalletSession()) {
          // Genuinely locked — a UI unlock is required; the next tx attempt
          // triggers it too, but prompting here saves the user a dead click.
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
    cancelEmailMagicLink,
    verifyEmailOtp,
    connectWithSMS,
    verifyPhoneOtp,
    connectWithWallet,
    completeSmartWalletLogin,
    exportPrivateKey,
    exportPrivateKeyWithBiometrics,
    switchActiveWallet,
    switchToProfile,
    disconnect,
    refreshUser,
    refreshSession,
    setRequiresUsername,
    setWagmiAuthIntent,
    openLoginModal,
    closeLoginModal,
    requestWalletUnlock,
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

  // Central recovery for auth failures raised anywhere in the app (dispatched
  // by the QueryClient's MutationCache in App.tsx). Tries a silent refresh
  // first and only asks the user to sign in when that genuinely fails —
  // otherwise a single expired token turns into a manual sign-out/sign-in.
  const authRecoveryInFlight = useRef(false);
  useEffect(() => {
    const handler = async () => {
      // A batch of mutations failing together must produce one recovery
      // attempt and one toast, not one per mutation.
      if (authRecoveryInFlight.current) return;
      authRecoveryInFlight.current = true;

      const toastId = toast.loading('Session expired — restoring…');
      try {
        // force: we are here because the server rejected a request, so the
        // local expiry arithmetic cannot be trusted to decide whether to try.
        const recovered = await stableCallbacks.refreshSession(true);
        toast.dismiss(toastId);
        if (recovered) {
          toast.success('Session restored — please try again.');
        } else {
          // Bring React in line with storage — but ONLY when the credentials
          // are genuinely gone. clearAuthSession runs down in the transport
          // layer, which cannot touch React state, so after a real revocation
          // the app keeps rendering a signed-in header, avatar and feed over a
          // session that no longer exists.
          //
          // The narrow condition matters: refreshSession also returns false
          // when it merely dispatched dehub:wallet-unlock-required and is
          // waiting for the user to type their wallet password. Tearing down
          // there would cancel the very flow that recovers them.
          const credentialsGone = !getAuthToken() && !getRefreshToken();
          if (credentialsGone) {
            localStorage.removeItem('dehub_user');
            setUser(null);
            setWalletAddress(null);
          }
          toast.error('Session expired', {
            description: 'Please sign in again to continue',
            action: { label: 'Sign in', onClick: () => stableCallbacks.openLoginModal() },
            duration: 8000,
          });
        }
      } catch {
        toast.dismiss(toastId);
      } finally {
        authRecoveryInFlight.current = false;
      }
    };

    window.addEventListener('dehub:auth-expired', handler);
    return () => window.removeEventListener('dehub:auth-expired', handler);
  }, [stableCallbacks]);

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
    loginIntent,
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
    loginIntent,
    stableCallbacks,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
