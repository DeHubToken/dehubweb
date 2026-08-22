/**
 * Wallet creation flow (embedded in the LoginModal drawer).
 * protect → persist → signed in. No recovery-phrase/recovery-code step —
 * export-private-key from Settings is the supported backup path, so signup
 * is a single step instead of a three-screen flow.
 *
 * Two ways to protect the new wallet:
 *  - biometrics (default wherever WebAuthn PRF works) — one Face ID / Touch ID
 *    prompt and nothing to type or remember;
 *  - a wallet password — the automatic path on devices without PRF, and always
 *    available as an explicit choice.
 * Either way the seed is encrypted client-side before anything leaves the
 * device. Ported from the Pixcellor CreateWalletDialog.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ArrowDownToLine, Fingerprint, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { generateMnemonic12, deriveFromSecret, isValidMnemonic, isRawPrivateKey } from '@/lib/wallet-core/derive';
import { encryptString } from '@/lib/wallet-core/crypto';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import {
  enrollBiometricUnlock,
  isBiometricUnlockAvailable,
  PasskeyCancelledError,
  PasskeyUnsupportedError,
} from '@/lib/wallet-core/biometric-unlock';
import { saveWallet } from '@/lib/wallet-core/store';
import { hasLegacyBrowserResidue, checkLegacyAccount, type LegacyAccountHint, type LegacyAccountMatch } from '@/lib/wallet-core/legacy-detect';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

interface WalletCreateStepProps {
  userId: string;
  /** Called with the derived private key once the wallet is fully persisted. */
  onComplete: (privKeyHex: string) => Promise<void>;
}

type Mode = 'new' | 'import' | 'migrate';
/** How the new wallet's seed will be protected. */
type Protection = 'biometric' | 'password';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

/** Survives the mobile redirect round-trip so the resumed leg still knows
 * which old login was used (and therefore which legacy account was reached). */
const MIGRATE_PROVIDER_KEY = 'dehub_legacy_migrate_provider';

/**
 * Which legacy account did this retrieval actually reach?
 *
 * NOT by address: the address we derive from the recovered key is the EOA
 * behind the old Web3Auth key, whereas legacy_accounts.eth_address is the
 * account's (smart) wallet address. For the same person those differ, so an
 * address comparison reports "no match" on a perfectly correct migration —
 * which is why the confirm screen used to show an address the user didn't
 * recognise. The login method just used is the reliable signal, since old
 * Web3Auth keys are per-provider. Address equality is still honoured first
 * for the accounts where the two happen to coincide.
 */
function matchLegacyAccount(
  accounts: LegacyAccountMatch[],
  provider: string | null,
  derivedAddress: string,
): LegacyAccountMatch | undefined {
  const byAddress = accounts.find((a) => a.ethAddress?.toLowerCase() === derivedAddress.toLowerCase());
  if (byAddress) return byAddress;
  if (provider) {
    const wanted = provider === 'email_passwordless'
      ? ['email', 'email_passwordless']
      : provider === 'sms_passwordless'
        ? ['sms', 'sms_passwordless', 'phone']
        : [provider];
    const byProvider = accounts.filter((a) => a.signupMethod && wanted.includes(a.signupMethod));
    if (byProvider.length === 1) return byProvider[0];
    // Ambiguous (several old accounts on the same provider) — don't guess.
    if (byProvider.length > 1) return undefined;
  }
  return accounts.length === 1 ? accounts[0] : undefined;
}

export function WalletCreateStep({ userId, onComplete }: WalletCreateStepProps) {
  const [mode, setMode] = useState<Mode>('new');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Key recovered from the old Web3Auth account (one-time migration)
  const [migratedKey, setMigratedKey] = useState<string | null>(null);
  // Require an explicit look at the derived address before persisting it —
  // Migrate retrieves whichever account the login used actually belongs to,
  // which is NOT always the one the user meant to reach (e.g. someone else's
  // real account, if a shared login was used). Resets on every new retrieval.
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [migrateEmail, setMigrateEmail] = useState('');
  const [migrateBusy, setMigrateBusy] = useState<string | null>(null);
  // Which OLD login method was actually used for the retrieval in progress.
  // This — not the derived address — is how we identify which legacy account
  // was reached: the address we derive here is the EOA behind the Web3Auth
  // key, while legacy_accounts.eth_address is the account's (smart) wallet
  // address, so the two legitimately differ for the same person.
  const [migrateProvider, setMigrateProvider] = useState<string | null>(null);
  // Address is support/debug detail now, not the identity shown by default.
  const [showMigratedAddress, setShowMigratedAddress] = useState(false);
  // Profile picture for the matched legacy account, pulled from the public
  // account_info endpoint by username (legacy_accounts itself stores no avatar).
  const [matchedAvatarUrl, setMatchedAvatarUrl] = useState<string | null>(null);
  // Returning-user detection: backend email lookup + old Web3Auth storage on
  // this origin. Only auto-selects the Migrate tab until the user picks a tab
  // themselves (userChoseModeRef) — never fights an explicit choice.
  const [backendHint, setBackendHint] = useState<LegacyAccountHint | null>(null);
  const [residueDetected, setResidueDetected] = useState(false);
  const userChoseModeRef = useRef(false);
  // null while probing — the protection UI waits rather than flashing the
  // password form and then swapping it for the biometric button.
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [protection, setProtection] = useState<Protection>('password');
  const userChoseProtectionRef = useRef(false);

  // Prefer biometrics wherever the platform can do it, without overriding an
  // explicit choice the user already made.
  useEffect(() => {
    let cancelled = false;
    isBiometricUnlockAvailable().then((available) => {
      if (cancelled) return;
      setBiometricAvailable(available);
      if (available && !userChoseProtectionRef.current) setProtection('biometric');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hasLegacyBrowserResidue()) {
      setResidueDetected(true);
      if (!userChoseModeRef.current) setMode('migrate');
    }
    checkLegacyAccount().then((hint) => {
      if (cancelled) return;
      setBackendHint(hint);
      if (hint.exists === true && hint.accounts?.length) {
        if (!userChoseModeRef.current) setMode('migrate');
        const emailAccount = hint.accounts.find((a) => a.signupMethod === 'email' || a.signupMethod === 'email_passwordless');
        if (emailAccount && hint.email) {
          setMigrateEmail((prev) => prev || hint.email!);
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Resume the mobile/redirect leg of a legacy migration. Flags are checked
  // BEFORE importing the legacy module so the ~1 MB Web3Auth chunk only loads
  // when a migration round-trip is actually in progress.
  useEffect(() => {
    let pending = false;
    try { pending = !!sessionStorage.getItem('dehub_legacy_migration_pending'); } catch { /* ignore */ }
    const url = window.location.hash + window.location.search;
    const hasParams = url.includes('b64Params') || url.includes('sessionId') || url.includes('sessionNamespace');
    if (!pending || !hasParams) return;

    setMode('migrate');
    setMigrateBusy('resume');
    let resumedProvider: string | null = null;
    try { resumedProvider = sessionStorage.getItem(MIGRATE_PROVIDER_KEY); } catch { /* ignore */ }
    import('@/lib/legacy-web3auth')
      .then(m => m.resumeLegacyMigration())
      .then((key) => {
        if (key) {
          setAddressConfirmed(false);
          setMigrateProvider(resumedProvider);
          setMigratedKey(key);
          toast.success('Old wallet retrieved — check the address before continuing');
        }
      })
      .catch((e) => {
        console.error('[Migrate] Redirect resume failed:', e);
        setError(e instanceof Error ? e.message : 'Migration failed. Please try again.');
      })
      .finally(() => setMigrateBusy(null));
  }, []);

  const handleLegacyLogin = async (provider: 'google' | 'twitter' | 'discord' | 'apple' | 'email_passwordless' | 'sms_passwordless') => {
    setError(null);
    if (provider === 'email_passwordless' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(migrateEmail)) {
      setError('Enter the email you used on your old account');
      return;
    }
    setMigrateBusy(provider);
    try { sessionStorage.setItem(MIGRATE_PROVIDER_KEY, provider); } catch { /* ignore */ }
    try {
      const { startLegacyMigration } = await import('@/lib/legacy-web3auth');
      const key = await startLegacyMigration(
        provider,
        provider === 'email_passwordless' ? migrateEmail : undefined,
      );
      setAddressConfirmed(false);
      setMigrateProvider(provider);
      setMigratedKey(key);
      toast.success('Old wallet retrieved — check the address before continuing');
    } catch (e) {
      console.error('[Migrate] Legacy login failed:', e);
      setError(e instanceof Error ? e.message : 'Could not retrieve your old wallet. Please try again.');
    } finally {
      setMigrateBusy(null);
    }
  };

  /**
   * The secret this wallet will be built from, per mode. Returns null and sets
   * an inline error when the mode's input isn't usable yet.
   */
  const resolveSecret = (): string | null => {
    if (mode === 'new') return generateMnemonic12();
    if (mode === 'migrate') {
      if (!migratedKey) {
        setError('Sign in with your old account first');
        return null;
      }
      return migratedKey;
    }
    const trimmed = importPhrase.trim();
    if (!isValidMnemonic(trimmed) && !isRawPrivateKey(trimmed)) {
      setError('Invalid recovery phrase or private key');
      return null;
    }
    return trimmed;
  };

  const handlePasswordNext = async () => {
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      if (assessment.breached === true) {
        setError('This password has appeared in a data breach — choose a different one');
        return;
      }
      if (!assessment.acceptable) {
        // Reuse the meter's own wording rather than a second, vaguer sentence.
        // The two used to disagree — the meter asked for 12 characters while
        // submit replied "mix letters, numbers, and symbols" — which reads as
        // the rules changing on you at the last step.
        setError(assessment.warnings[0] ?? 'Choose a stronger password');
        return;
      }
    } finally {
      setBusy(false);
    }

    const secret = resolveSecret();
    if (secret) void persist(secret);
  };

  const persist = async (secret: string) => {
    setBusy(true);
    setError(null);
    try {
      const derived = deriveFromSecret(secret);
      const encrypted = await encryptString(derived.secret, password);
      await saveWallet(userId, derived.ethAddress, encrypted);
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not secure your account');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Biometric path: enrol a passkey, wrap the seed under its PRF output, then
   * write the wallet row.
   *
   * The wrap is stored BEFORE the wallet row on purpose. If the second write
   * fails we're left with an unreferenced wrap — harmless, and the retry
   * overwrites it — whereas the reverse order could leave a wallet row with no
   * way at all to reach its seed.
   */
  const handleBiometricCreate = async () => {
    setError(null);
    const secret = resolveSecret();
    if (!secret) return;

    setBusy(true);
    try {
      const derived = deriveFromSecret(secret);
      await enrollBiometricUnlock(userId, derived.secret);
      await saveWallet(userId, derived.ethAddress, null);
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        // Dismissing the OS sheet isn't a failure — no message, no state change.
        return;
      }
      if (err instanceof PasskeyUnsupportedError) {
        setBiometricAvailable(false);
        setProtection('password');
        setError(`${err.message} Set a password instead.`);
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not secure your account');
    } finally {
      setBusy(false);
    }
  };

  const chooseProtection = (next: Protection) => {
    userChoseProtectionRef.current = true;
    setProtection(next);
    setError(null);
  };

  // Providers the backend says old accounts used — highlighted so the user
  // re-authenticates with a matching method (Web3Auth keys are per-provider).
  // A person can have MORE than one old account for this email (Supabase
  // links Google/Email logins with the same verified email into one new
  // identity, but each was its own separate old account) — highlight ALL of
  // them, not just one, and preview what's on each before they pick.
  const foundAccounts = backendHint?.exists === true ? (backendHint.accounts ?? []) : [];
  const oldLoginMethods = new Set(foundAccounts.map((a) => a.signupMethod).filter((m): m is string => !!m));
  const hasMultipleOldAccounts = foundAccounts.length > 1;
  const hasOldEmailLogin = oldLoginMethods.has('email') || oldLoginMethods.has('email_passwordless');
  // SMS-era Web3Auth accounts have no email on the old key at all — the number
  // IS the verifier id. They were unreachable until this button existed, since
  // every other provider reconstructs a different key.
  const hasOldSmsLogin = oldLoginMethods.has('sms') || oldLoginMethods.has('sms_passwordless') || oldLoginMethods.has('phone');

  const migrateProviderButton = (
    provider: 'google' | 'twitter' | 'discord' | 'apple' | 'sms_passwordless',
    label: string,
  ) => {
    const isOldLogin = provider === 'sms_passwordless' ? hasOldSmsLogin : oldLoginMethods.has(provider);
    return (
    <Button
      key={provider}
      variant="outline"
      disabled={!!migrateBusy}
      onClick={() => handleLegacyLogin(provider)}
      className={`w-full h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10 ${
        isOldLogin ? 'ring-1 ring-green-400/50 bg-white/15' : ''
      }`}
    >
      {migrateBusy === provider ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
      {label}
      {isOldLogin && (
        <span className="ml-2 text-[10px] uppercase tracking-wide bg-green-400/15 text-green-300 rounded-full px-2 py-0.5">
          Your old login
        </span>
      )}
    </Button>
    );
  };

  // deriveFromSecret throws on a key it cannot parse, and legacy Web3Auth keys
  // are not always well-formed (leading zeros stripped to 63 hex chars, or not
  // a valid secp256k1 scalar). Unguarded, that throw happens DURING RENDER, the
  // moment setMigratedKey lands — React unmounts the whole subtree to the error
  // boundary and the login modal vanishes right as the user is told their old
  // wallet was retrieved. Degrade to an inline error instead.
  let migratedAddress: string | null = null;
  let migratedKeyError: string | null = null;
  if (migratedKey) {
    try {
      migratedAddress = deriveFromSecret(migratedKey).ethAddress;
    } catch (e) {
      console.error('[WalletCreate] Could not derive an address from the migrated key:', e);
      migratedKeyError = 'We could not read that old wallet key. Please try another login method, or contact support.';
    }
  }
  const matchedAccount = migratedAddress
    ? matchLegacyAccount(foundAccounts, migrateProvider, migratedAddress)
    : undefined;

  // Resolve the matched account's profile picture. account_info is public, and
  // the CDN avatar path is keyed by the account's wallet address — so the
  // username from legacy_accounts is enough to get the real picture. Best
  // effort: a miss just leaves the initial fallback in place.
  const matchedUsername = matchedAccount?.username;
  const matchedEthAddress = matchedAccount?.ethAddress;
  useEffect(() => {
    setMatchedAvatarUrl(null);
    if (!matchedUsername) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ getAccountByUsername }, { buildAvatarUrl, extractAvatarPath }] = await Promise.all([
          import('@/lib/api/dehub/users'),
          import('@/lib/media-url'),
        ]);
        const user = await getAccountByUsername(matchedUsername);
        if (cancelled) return;
        const address = (user as any)?.address || (user as any)?.wallet_address || matchedEthAddress;
        if (!address) return;
        setMatchedAvatarUrl(buildAvatarUrl(address, extractAvatarPath(user as any)) ?? null);
      } catch {
        /* keep the initial fallback */
      }
    })();
    return () => { cancelled = true; };
  }, [matchedUsername, matchedEthAddress]);

  // Never advance to the protection step on a key we could not parse — the
  // confirmation UI has no address to show and saving would store a wallet the
  // user never verified.
  const showProtectionStep =
    mode !== 'migrate' || (!!migratedKey && !migratedKeyError && addressConfirmed);
  const showPasswordFields = showProtectionStep && protection === 'password';
  const showBiometricStep = showProtectionStep && protection === 'biometric';

  const OLD_LOGIN_LABELS: Record<string, string> = {
    google: 'Google', apple: 'Apple', twitter: 'X (Twitter)', discord: 'Discord',
    email: 'Email', email_passwordless: 'Email',
    sms: 'Phone (SMS)', sms_passwordless: 'Phone (SMS)', phone: 'Phone (SMS)',
  };

  return (
    <div className="space-y-4">
      {/* Returning-user detection banners (hidden once the old key is retrieved) */}
      {!migratedKey && hasMultipleOldAccounts && (
        <div className="rounded-xl border border-green-400/40 bg-green-400/10 p-3 text-sm text-white space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
            <p>We found <span className="font-semibold">{foundAccounts.length} old accounts</span> for this email. Pick which one to bring over below — you can switch later from Settings.</p>
          </div>
          <div className="space-y-1 pl-6">
            {foundAccounts.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-white/70 bg-black/20 rounded-lg px-2.5 py-1.5">
                <span>{a.signupMethod ? OLD_LOGIN_LABELS[a.signupMethod] ?? a.signupMethod : 'Unknown login'}{a.username ? ` — @${a.username}` : ''}</span>
                {typeof a.badgeBalance === 'number' && (
                  <span className="text-white/50">{a.badgeBalance.toLocaleString()} DHB</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!migratedKey && !hasMultipleOldAccounts && backendHint?.exists === true && foundAccounts[0] && (
        <div className="flex items-start gap-2 rounded-xl border border-green-400/40 bg-green-400/10 p-3 text-sm text-white">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
          <p>
            Welcome back! We found your existing DeHub account
            {foundAccounts[0].signupMethod && OLD_LOGIN_LABELS[foundAccounts[0].signupMethod] ? <> (old login: <span className="font-semibold">{OLD_LOGIN_LABELS[foundAccounts[0].signupMethod]}</span>)</> : null}
            . Sign in with it below to keep your wallet, balance, and profile.
          </p>
        </div>
      )}
      {!migratedKey && backendHint?.exists !== true && residueDetected && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
          <p>Looks like this browser has signed in to DeHub before. If that was you, use <span className="font-semibold">Migrate</span> below so you keep your old wallet and balance.</p>
        </div>
      )}

      {/* Lead with what this protects, not with what it is. Someone who came
          here to post has no reason to care that a wallet is being created, but
          every reason to care that only they can use the account. The mechanics
          stay available underneath for people who do want them. */}
      {mode === 'migrate' ? (
        <p className="text-white/60 text-sm">
          Had a DeHub account before? Sign in with your OLD login below to bring over your existing wallet, balance, and profile.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-white/60 text-sm">
            To ensure only you can post or transact in the app using this account, set a password or biometrics.
          </p>
          <p className="text-white/40 text-xs">
            {protection === 'biometric'
              ? 'Encrypted on this device before anything leaves it, and unlocked with your fingerprint or face — nothing to remember. You can export a backup key anytime from Settings.'
              : 'Encrypted on this device before anything leaves it. You can export a backup key anytime from Settings.'}
          </p>
        </div>
      )}

      <div className="flex rounded-xl bg-white/5 p-1 gap-1">
        {([['new', 'New account'], ['import', 'Import'], ['migrate', 'Migrate']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => { userChoseModeRef.current = true; setMode(m); setError(null); }}
            className={`flex-1 h-9 rounded-lg text-sm transition-colors ${mode === m ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Guarantee the migrate path can't be missed, even when detection is unavailable */}
      {mode === 'new' && (
        <button
          type="button"
          onClick={() => { userChoseModeRef.current = true; setMode('migrate'); setError(null); }}
          className="w-full text-left text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          Used DeHub before? <span className="underline">Migrate your old account</span> to keep your wallet and balance →
        </button>
      )}

      {mode === 'import' && (
        <Textarea
          value={importPhrase}
          onChange={(e) => setImportPhrase(e.target.value)}
          rows={3}
          placeholder="Recovery phrase (12/24 words) or 0x private key"
          className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
        />
      )}

      {mode === 'migrate' && !migratedKey && (
        <div className="space-y-2">
          {migrateBusy === 'resume' ? (
            <p className="text-white/60 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Retrieving your old wallet…
            </p>
          ) : (
            <>
              {migrateProviderButton('google', 'Old account: Google')}
              {migrateProviderButton('apple', 'Old account: Apple')}
              {migrateProviderButton('twitter', 'Old account: X (Twitter)')}
              {migrateProviderButton('discord', 'Old account: Discord')}
              {migrateProviderButton('sms_passwordless', 'Old account: Phone (SMS)')}
              <div className="space-y-1.5">
                <p className={`text-xs px-1 ${hasOldEmailLogin ? 'text-green-300' : 'text-white/50'}`}>
                  Old account: Email
                  {hasOldEmailLogin && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-green-400/15 text-green-300 rounded-full px-2 py-0.5">
                      Your old login
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Old account email"
                    value={migrateEmail}
                    onChange={(e) => setMigrateEmail(e.target.value)}
                    className={`${inputClass} h-11 flex-1 ${hasOldEmailLogin ? 'ring-1 ring-green-400/50' : ''}`}
                  />
                  <Button
                    variant="outline"
                    disabled={!!migrateBusy || !migrateEmail}
                    onClick={() => handleLegacyLogin('email_passwordless')}
                    className="h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10 shrink-0"
                  >
                    {migrateBusy === 'email_passwordless'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <ArrowDownToLine className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-white/40 text-xs">
                A one-time sign-in retrieves your wallet key securely in this browser — it never touches our servers.
              </p>
            </>
          )}
        </div>
      )}

      {mode === 'migrate' && migratedKey && migratedKeyError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
            <p>{migratedKeyError}</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => { setMigratedKey(null); setAddressConfirmed(false); setMigrateProvider(null); setShowMigratedAddress(false); }}
            className="w-full"
          >
            Try a different login
          </Button>
        </div>
      )}

      {mode === 'migrate' && migratedKey && !addressConfirmed && migratedAddress && (() => {
        const matched = matchedAccount;
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
              <p>This retrieved a real account — double check it's actually yours before continuing. This can't be undone once you set a password.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white space-y-2">
              {matched ? (
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 shrink-0 rounded-xl ring-1 ring-white/[0.06]">
                    <AvatarImage src={matchedAvatarUrl || undefined} className="object-cover" />
                    <AvatarFallback className="bg-white/[0.06] text-white/50 text-sm rounded-xl">
                      {(matched.username || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {matched.username ? `@${matched.username}` : 'Your old DeHub account'}
                    </p>
                    <p className="text-xs text-white/50">
                      {matched.signupMethod && OLD_LOGIN_LABELS[matched.signupMethod]
                        ? OLD_LOGIN_LABELS[matched.signupMethod]
                        : 'Old DeHub account'}
                      {typeof matched.badgeBalance === 'number'
                        ? ` — ${matched.badgeBalance.toLocaleString()} DHB`
                        : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-white/70 text-xs">
                  We retrieved a wallet for this login, but couldn't match it to a profile on record. Check the address before continuing.
                </p>
              )}
              {matched ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMigratedAddress((v) => !v)}
                    className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showMigratedAddress ? 'Hide wallet address' : 'Show wallet address'}
                  </button>
                  {showMigratedAddress && (
                    <p className="break-all text-[11px] text-white/50">{migratedAddress}</p>
                  )}
                </>
              ) : (
                <p className="break-all text-[11px] text-white/50">{migratedAddress}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => { setMigratedKey(null); setAddressConfirmed(false); setMigrateProvider(null); setShowMigratedAddress(false); }}
                className="flex-1 h-11 text-white/60 hover:text-white rounded-xl"
              >
                Try a different login
              </Button>
              <Button
                onClick={() => setAddressConfirmed(true)}
                className="flex-1 h-11 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                Yes, this is mine
              </Button>
            </div>
          </div>
        );
      })()}

      {mode === 'migrate' && migratedKey && addressConfirmed && (
        <p className="text-sm text-green-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {protection === 'biometric'
            ? 'Confirmed. Finish with your fingerprint or face.'
            : 'Confirmed. Set a password to finish the migration.'}
        </p>
      )}

      {showProtectionStep && biometricAvailable === null && (
        <p className="text-white/50 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Checking what this device supports…
        </p>
      )}

      {showBiometricStep && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
          <Fingerprint className="w-5 h-5 mt-0.5 text-white shrink-0" />
          <div className="space-y-1">
            <p className="text-white text-sm font-medium">Unlock with your fingerprint or face</p>
            <p className="text-white/50 text-xs leading-relaxed">
              Your device holds the key that unlocks this account. Nothing to type now or later —
              and DeHub never sees it.
            </p>
          </div>
        </div>
      )}

      {showPasswordFields && (
        <>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={`Password (min ${MIN_PASSWORD_LENGTH} chars)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoFocus={mode !== 'migrate'}
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {showBiometricStep && (
        <Button
          onClick={handleBiometricCreate}
          disabled={busy || (mode === 'import' && !importPhrase.trim()) || (mode === 'migrate' && !migratedKey)}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing you in…</span>
            : (
              <span className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4" />
                {mode === 'new' ? 'Secure account' : mode === 'migrate' ? 'Finish migration' : 'Import wallet'}
              </span>
            )}
        </Button>
      )}

      {showPasswordFields && (
        <Button
          onClick={handlePasswordNext}
          disabled={
            busy || !password || !confirm ||
            (mode === 'import' && !importPhrase.trim()) ||
            (mode === 'migrate' && !migratedKey)
          }
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing you in…</span>
            : mode === 'new' ? 'Secure account' : mode === 'migrate' ? 'Finish migration' : 'Import wallet'}
        </Button>
      )}

      {/* Either choice stays reachable: biometrics is the default where it
          works, a password is always an option, and it's the only option where
          PRF is unavailable. */}
      {showProtectionStep && biometricAvailable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => chooseProtection(protection === 'biometric' ? 'password' : 'biometric')}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {protection === 'biometric'
            ? <><KeyRound className="w-3.5 h-3.5" /> Use a password instead</>
            : <><Fingerprint className="w-3.5 h-3.5" /> Use fingerprint or face instead</>}
        </button>
      )}

      {showPasswordFields && biometricAvailable === false && (
        <p className="text-white/40 text-xs text-center">
          This device can’t use biometrics. You can add them later from Settings on a device that can.
        </p>
      )}
    </div>
  );
}
