/**
 * Wallet creation flow (embedded in the LoginModal drawer).
 * password → persist → signed in. No recovery-phrase/recovery-code step —
 * export-private-key from Settings is the supported backup path, so signup
 * is a single step instead of a three-screen flow.
 * Ported from the Pixcellor CreateWalletDialog; keys are encrypted client-side
 * before anything leaves the device.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { generateMnemonic12, deriveFromSecret, isValidMnemonic, isRawPrivateKey } from '@/lib/wallet-core/derive';
import { encryptString } from '@/lib/wallet-core/crypto';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { saveWallet } from '@/lib/wallet-core/store';
import { hasLegacyBrowserResidue, checkLegacyAccount, type LegacyAccountHint } from '@/lib/wallet-core/legacy-detect';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

interface WalletCreateStepProps {
  userId: string;
  /** Called with the derived private key once the wallet is fully persisted. */
  onComplete: (privKeyHex: string) => Promise<void>;
}

type Mode = 'new' | 'import' | 'migrate';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

export function WalletCreateStep({ userId, onComplete }: WalletCreateStepProps) {
  const [mode, setMode] = useState<Mode>('new');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Key recovered from the old Web3Auth account (one-time migration)
  const [migratedKey, setMigratedKey] = useState<string | null>(null);
  const [migrateEmail, setMigrateEmail] = useState('');
  const [migrateBusy, setMigrateBusy] = useState<string | null>(null);
  // Returning-user detection: backend email lookup + old Web3Auth storage on
  // this origin. Only auto-selects the Migrate tab until the user picks a tab
  // themselves (userChoseModeRef) — never fights an explicit choice.
  const [backendHint, setBackendHint] = useState<LegacyAccountHint | null>(null);
  const [residueDetected, setResidueDetected] = useState(false);
  const userChoseModeRef = useRef(false);

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
    import('@/lib/legacy-web3auth')
      .then(m => m.resumeLegacyMigration())
      .then((key) => {
        if (key) {
          setMigratedKey(key);
          toast.success('Old wallet retrieved — set a password to finish');
        }
      })
      .catch((e) => {
        console.error('[Migrate] Redirect resume failed:', e);
        setError(e instanceof Error ? e.message : 'Migration failed. Please try again.');
      })
      .finally(() => setMigrateBusy(null));
  }, []);

  const handleLegacyLogin = async (provider: 'google' | 'twitter' | 'discord' | 'apple' | 'email_passwordless') => {
    setError(null);
    if (provider === 'email_passwordless' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(migrateEmail)) {
      setError('Enter the email you used on your old account');
      return;
    }
    setMigrateBusy(provider);
    try {
      const { startLegacyMigration } = await import('@/lib/legacy-web3auth');
      const key = await startLegacyMigration(
        provider,
        provider === 'email_passwordless' ? migrateEmail : undefined,
      );
      setMigratedKey(key);
      toast.success('Old wallet retrieved — set a password to finish');
    } catch (e) {
      console.error('[Migrate] Legacy login failed:', e);
      setError(e instanceof Error ? e.message : 'Could not retrieve your old wallet. Please try again.');
    } finally {
      setMigrateBusy(null);
    }
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
      if (!assessment.longEnough) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (assessment.breached === true) {
        setError('This password has appeared in a data breach — choose a different one');
        return;
      }
      if (!assessment.acceptable) {
        setError('Choose a stronger password (mix letters, numbers, and symbols)');
        return;
      }
    } finally {
      setBusy(false);
    }

    if (mode === 'new') {
      void persist(generateMnemonic12());
    } else if (mode === 'migrate') {
      if (!migratedKey) {
        setError('Sign in with your old account first');
        return;
      }
      void persist(migratedKey);
    } else {
      const trimmed = importPhrase.trim();
      if (!isValidMnemonic(trimmed) && !isRawPrivateKey(trimmed)) {
        setError('Invalid recovery phrase or private key');
        return;
      }
      void persist(trimmed);
    }
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
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setBusy(false);
    }
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

  const migrateProviderButton = (
    provider: 'google' | 'twitter' | 'discord' | 'apple',
    label: string,
  ) => (
    <Button
      key={provider}
      variant="outline"
      disabled={!!migrateBusy}
      onClick={() => handleLegacyLogin(provider)}
      className={`w-full h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10 ${
        oldLoginMethods.has(provider) ? 'ring-1 ring-green-400/50 bg-white/15' : ''
      }`}
    >
      {migrateBusy === provider ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
      {label}
      {oldLoginMethods.has(provider) && (
        <span className="ml-2 text-[10px] uppercase tracking-wide bg-green-400/15 text-green-300 rounded-full px-2 py-0.5">
          Your old login
        </span>
      )}
    </Button>
  );

  const showPasswordFields = mode !== 'migrate' || !!migratedKey;

  const OLD_LOGIN_LABELS: Record<string, string> = {
    google: 'Google', apple: 'Apple', twitter: 'X (Twitter)', discord: 'Discord',
    email: 'Email', email_passwordless: 'Email',
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

      <p className="text-white/60 text-sm">
        {mode === 'migrate'
          ? 'Had a DeHub account before? Sign in with your OLD login below to bring over your existing wallet, balance, and profile.'
          : "Your keys are encrypted in this browser before anything leaves the device. You can export your private key anytime from Settings as a backup."}
      </p>

      <div className="flex rounded-xl bg-white/5 p-1 gap-1">
        {([['new', 'New wallet'], ['import', 'Import'], ['migrate', 'Migrate']] as const).map(([m, label]) => (
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

      {mode === 'migrate' && migratedKey && (
        <p className="text-sm text-green-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Old wallet retrieved. Set a password to finish the migration.
        </p>
      )}

      {showPasswordFields && (
        <>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={`Wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
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
            : mode === 'new' ? 'Create wallet' : mode === 'migrate' ? 'Finish migration' : 'Import wallet'}
        </Button>
      )}
    </div>
  );
}
