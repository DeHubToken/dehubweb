/**
 * Wallet creation flow (embedded in the LoginModal drawer).
 * password → recovery phrase (show once) → persist → recovery code (show once)
 * Ported from the Pixcellor CreateWalletDialog; keys are encrypted client-side
 * before anything leaves the device.
 */
import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Copy, CheckCircle2, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { generateMnemonic12, deriveFromSecret, isValidMnemonic, isRawPrivateKey } from '@/lib/wallet-core/derive';
import { encryptString } from '@/lib/wallet-core/crypto';
import { generateRecoveryCode, encryptSeedWithRecoveryCode } from '@/lib/wallet-core/recovery';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { copyThenClear } from '@/lib/wallet-core/clipboard';
import { saveWallet } from '@/lib/wallet-core/store';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

interface WalletCreateStepProps {
  userId: string;
  /** Called with the derived private key once the wallet is fully persisted. */
  onComplete: (privKeyHex: string) => Promise<void>;
}

type Phase = 'password' | 'phrase' | 'recovery-code';
type Mode = 'new' | 'import' | 'migrate';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

export function WalletCreateStep({ userId, onComplete }: WalletCreateStepProps) {
  const [mode, setMode] = useState<Mode>('new');
  const [phase, setPhase] = useState<Phase>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryAck, setRecoveryAck] = useState(false);
  const [pendingPrivKey, setPendingPrivKey] = useState<string | null>(null);
  // Key recovered from the old Web3Auth account (one-time migration)
  const [migratedKey, setMigratedKey] = useState<string | null>(null);
  const [migrateEmail, setMigrateEmail] = useState('');
  const [migrateBusy, setMigrateBusy] = useState<string | null>(null);

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
      setMnemonic(generateMnemonic12());
      setPhase('phrase');
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

      // Recovery code: a second password the seed is encrypted under, so a
      // forgotten wallet password never means a lost wallet.
      const code = generateRecoveryCode();
      const recoveryPayload = await encryptSeedWithRecoveryCode(derived.secret, code);

      await saveWallet(userId, derived.ethAddress, encrypted, recoveryPayload);

      setPendingPrivKey(derived.ethPrivateKey);
      setRecoveryCode(code);
      setPhase('recovery-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setBusy(false);
    }
  };

  const copyPhrase = async () => {
    await copyThenClear(mnemonic);
    toast.success('Recovery phrase copied — clipboard clears in 30s');
  };

  const copyRecoveryCode = async () => {
    if (!recoveryCode) return;
    await copyThenClear(recoveryCode);
    toast.success('Recovery code copied — clipboard clears in 30s');
  };

  const handleFinish = async () => {
    if (!pendingPrivKey) return;
    setBusy(true);
    try {
      await onComplete(pendingPrivKey);
    } catch {
      // completeSmartWalletLogin surfaces its own toast; stay on this screen
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'recovery-code' && recoveryCode) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
          <p>Save this recovery code somewhere safe. If you forget your wallet password, it is the ONLY way to restore access. We cannot show it again.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white break-words select-all">
          {recoveryCode}
        </div>
        <Button variant="outline" onClick={copyRecoveryCode} className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10">
          <Copy className="w-4 h-4 mr-2" /> Copy recovery code
        </Button>
        <label className="flex items-start gap-2 text-sm text-white">
          <Checkbox checked={recoveryAck} onCheckedChange={(v) => setRecoveryAck(v === true)} className="mt-0.5" />
          <span>I have saved my recovery code somewhere safe</span>
        </label>
        <Button
          disabled={!recoveryAck || busy}
          onClick={handleFinish}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing you in…</span> : 'Finish & sign in'}
        </Button>
      </div>
    );
  }

  if (phase === 'phrase') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
          <p>Write this down and store it offline. Anyone with this phrase owns your funds. We cannot show it again.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
          {mnemonic.split(' ').map((word, i) => (
            <div key={i} className="rounded bg-black/40 px-2 py-1 text-sm text-white">
              <span className="text-white/40 mr-1">{i + 1}.</span>
              {word}
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={copyPhrase} className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10">
          <Copy className="w-4 h-4 mr-2" /> Copy phrase
        </Button>
        <label className="flex items-start gap-2 text-sm text-white">
          <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} className="mt-0.5" />
          <span>I have saved my recovery phrase somewhere safe</span>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPhase('password')} className="flex-1 h-12 text-white/60 hover:text-white rounded-xl">
            Back
          </Button>
          <Button
            disabled={!saved || busy}
            onClick={() => persist(mnemonic)}
            className="flex-1 h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Encrypting…</span> : 'Create wallet'}
          </Button>
        </div>
      </div>
    );
  }

  const migrateProviderButton = (
    provider: 'google' | 'twitter' | 'discord' | 'apple',
    label: string,
  ) => (
    <Button
      key={provider}
      variant="outline"
      disabled={!!migrateBusy}
      onClick={() => handleLegacyLogin(provider)}
      className="w-full h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10"
    >
      {migrateBusy === provider ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
      {label}
    </Button>
  );

  const showPasswordFields = mode !== 'migrate' || !!migratedKey;

  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm">
        {mode === 'migrate'
          ? 'Had a DeHub account before? Sign in with your OLD login below to bring over your existing wallet, balance, and profile.'
          : "Your keys are encrypted in this browser before anything leaves the device. You'll also get a recovery code in case you forget your password."}
      </p>

      <div className="flex rounded-xl bg-white/5 p-1 gap-1">
        {([['new', 'New wallet'], ['import', 'Import'], ['migrate', 'Migrate']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 h-9 rounded-lg text-sm transition-colors ${mode === m ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

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
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Old account email"
                  value={migrateEmail}
                  onChange={(e) => setMigrateEmail(e.target.value)}
                  className={`${inputClass} h-11 flex-1`}
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
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Working…</span>
            : mode === 'new' ? 'Continue' : mode === 'migrate' ? 'Finish migration' : 'Import wallet'}
        </Button>
      )}
    </div>
  );
}
