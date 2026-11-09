import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Wallet creation flow (embedded in the LoginModal drawer).
 * protect → persist → optional 12-word backup → signed in. The backup is one
 * screen with "Skip for now": the wallet is already saved by then, so skipping
 * loses nothing, and Settings → Back up wallet shows the words any time.
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
import { Loader2, Fingerprint, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateMnemonic12, deriveFromSecret, isValidMnemonic } from '@/lib/wallet-core/derive';
import { encryptString } from '@/lib/wallet-core/crypto';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import {
  enrollBiometricUnlock,
  enrollBiometricUnlockWithEnrollment,
  isBiometricUnlockAvailable,
  PasskeyCancelledError,
  PasskeyUnsupportedError,
} from '@/lib/wallet-core/biometric-unlock';
import { fetchWallet, saveWallet } from '@/lib/wallet-core/store';
import { readDeviceSeed, type DeviceSeed } from '@/lib/wallet-core/device-seed';
import { takePendingPasskeyEnrollment } from '@/lib/passkey-login';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { SeedPhraseBackup } from './SeedPhraseBackup';
import { markBackedUp } from '@/lib/wallet-core/backup-status';
import { createLogger } from '@/lib/logger';

const signupLog = createLogger('WalletCreateStep');

interface WalletCreateStepProps {
  userId: string;
  /** Called with the derived private key once the wallet is fully persisted. */
  onComplete: (privKeyHex: string) => Promise<void>;
  /**
   * The first wallet action of a silent sign-up (lib/wallet-secure-flow.ts):
   * the wallet already exists, its words held on this browser
   * (wallet-core/device-seed). Only the password-or-biometrics choice is
   * shown, for that wallet, with no recovery phrase — backing up is the
   * later reminder. onComplete's key is unused.
   */
  securing?: boolean;
}

/** How the new wallet's seed will be protected. */
type Protection = 'biometric' | 'password';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

export function WalletCreateStep({ userId, onComplete, securing = false }: WalletCreateStepProps) {
  const { t: _copy } = _useCopy();
  // securing only: the wallet being secured; undefined while it loads.
  const [securingSeed, setSecuringSeed] = useState<DeviceSeed | null | undefined>(undefined);
  useEffect(() => {
    if (!securing) return;
    let cancelled = false;
    readDeviceSeed(userId).then((seed) => {
      if (cancelled) return;
      setSecuringSeed(seed);
      // Secured meanwhile (another tab, Settings): nothing is left to ask.
      if (!seed) void onComplete('');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securing, userId]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mnemonic for a brand-new wallet, generated once per setup attempt.
  //
  // It used to be minted inside resolveSecret(), which runs on every submit —
  // so a retry did not retry, it created a DIFFERENT wallet. The first attempt
  // may already have got far enough for the backend to link the account to the
  // wallet it signed with, while saveWallet upserts on user_id and hands the
  // row to the newcomer. The account is then linked to a wallet this browser
  // can no longer derive: every later login logs "Supabase session maps to a
  // different wallet", and the signature it falls back to arrives as a brand
  // new signup, which the wallet-history gate refuses — locking the person out
  // of the account they created minutes earlier, on every device, permanently.
  //
  // A retry now re-derives the same wallet, so the write is idempotent.
  const newWalletSecretRef = useRef<string | null>(null);
  // A brand-new wallet that is saved but not yet signed in: the optional
  // backup screen shows its words, then either choice finishes sign-in.
  const [pendingBackup, setPendingBackup] = useState<{ phrase: string; ethAddress: string; privKey: string } | null>(null);
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

  /** The secret this wallet will be built from. */
  const resolveSecret = (): string | null => {
    // Rendered only once the seed has loaded (see the loader below).
    if (securing) return securingSeed?.secret ?? null;
    if (!newWalletSecretRef.current) newWalletSecretRef.current = generateMnemonic12();
    return newWalletSecretRef.current;
  };

  const handlePasswordNext = async () => {
    setError(null);
    if (password !== confirm) {
      setError(_copy("copy.ec5d490e7422", { defaultValue: "Passwords don't match" }));
      return;
    }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      if (assessment.breached === true) {
        setError(_copy("copy.200c70fe2782", { defaultValue: "This password has appeared in a data breach — choose a different one" }));
        return;
      }
      if (!assessment.acceptable) {
        // Reuse the meter's own wording rather than a second, vaguer sentence.
        // The two used to disagree — the meter asked for 12 characters while
        // submit replied "mix letters, numbers, and symbols" — which reads as
        // the rules changing on you at the last step.
        setError(assessment.warnings[0] ?? _copy("copy.701a69a12862", { defaultValue: "Choose a stronger password" }));
        return;
      }
    } finally {
      setBusy(false);
    }

    const secret = resolveSecret();
    if (secret) void persist(secret);
  };

  /**
   * Last line of defence before a write that replaces this account's wallet.
   *
   * Setup is only ever reached when the wallet lookup came back empty, so a row
   * holding a DIFFERENT address means one appeared underneath us — a second tab,
   * a duplicate submit that raced the first write. Overwriting it splits the
   * account away from the wallet the backend just linked, and there is no way
   * back from that: the seed it replaces is gone and the gate refuses the
   * newcomer as a fresh signup. Refusing costs a reload; the write costs the
   * account. Same address is the ordinary retry, and passes straight through.
   */
  const assertNotReplacingWallet = async (ethAddress: string) => {
    const existing = await fetchWallet(userId).catch(() => null);
    if (existing && existing.ethAddress.toLowerCase() !== ethAddress.toLowerCase()) {
      throw new Error(
        _copy("copy.184b63d14517", { defaultValue: "This account already has a wallet — reload the page and sign in with it." }),
      );
    }
  };

  /** Only a wallet minted here has words the person has never seen. */
  const offerBackup = (derived: { secret: string; ethAddress: string; ethPrivateKey: string }) => {
    // Securing leaves backing up to the later reminder.
    if (securing || !isValidMnemonic(derived.secret)) return false;
    setPendingBackup({ phrase: derived.secret, ethAddress: derived.ethAddress, privKey: derived.ethPrivateKey });
    return true;
  };

  const finishAfterBackup = async (saved: boolean) => {
    if (!pendingBackup) return;
    setBusy(true);
    setError(null);
    try {
      if (saved) await markBackedUp(userId, pendingBackup.ethAddress);
      await onComplete(pendingBackup.privKey);
    } catch (err) {
      signupLog.trace?.('wallet-signin-error', { reason: err instanceof Error ? err.message : String(err) });
      setError(err instanceof Error ? err.message : _copy("copy.c2fb518cd172", { defaultValue: "Could not secure your account" }));
    } finally {
      setBusy(false);
    }
  };

  const persist = async (secret: string) => {
    signupLog.trace?.('wallet-protection-start', { protection: 'password' });
    setBusy(true);
    setError(null);
    try {
      const derived = deriveFromSecret(secret);
      const encrypted = await encryptString(derived.secret, password);
      await assertNotReplacingWallet(derived.ethAddress);
      await saveWallet(userId, derived.ethAddress, encrypted);
      if (offerBackup(derived)) return;
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      signupLog.trace?.('wallet-setup-error', { reason: err instanceof Error ? err.message : String(err) });
      setError(err instanceof Error ? err.message : _copy("copy.c2fb518cd172", { defaultValue: "Could not secure your account" }));
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
    signupLog.trace?.('wallet-protection-start', { protection: 'biometric' });
    setError(null);
    const secret = resolveSecret();
    if (!secret) return;

    setBusy(true);
    try {
      const derived = deriveFromSecret(secret);
      // A passkey-only sign-up already holds PRF output from the credential
      // that became the account: wrap under that rather than asking the
      // authenticator for a second passkey.
      const pending = takePendingPasskeyEnrollment();
      if (pending) {
        try {
          await enrollBiometricUnlockWithEnrollment(userId, derived.secret, pending);
        } finally {
          pending.keyMaterial.fill(0);
        }
      } else {
        await enrollBiometricUnlock(userId, derived.secret);
      }
      await assertNotReplacingWallet(derived.ethAddress);
      await saveWallet(userId, derived.ethAddress, null);
      if (offerBackup(derived)) return;
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        signupLog.trace?.('wallet-protection-cancelled');
        // Dismissing the OS sheet isn't a failure — no message, no state change.
        return;
      }
      if (err instanceof PasskeyUnsupportedError) {
        signupLog.trace?.('wallet-protection-unsupported');
        setBiometricAvailable(false);
        setProtection('password');
        setError(_copy("copy.972b469ab8ea", { defaultValue: "{{value1}} Set a password instead.", value1: err.message }));
        return;
      }
      setError(err instanceof Error ? err.message : _copy("copy.c2fb518cd172", { defaultValue: "Could not secure your account" }));
    } finally {
      setBusy(false);
    }
  };

  const chooseProtection = (next: Protection) => {
    userChoseProtectionRef.current = true;
    setProtection(next);
    setError(null);
  };

  const showPasswordFields = protection === 'password';
  const showBiometricStep = protection === 'biometric';

  if (securing && !securingSeed) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-white/60" />
      </div>
    );
  }

  if (pendingBackup) {
    return (
      <div className="space-y-4">
        <SeedPhraseBackup
          phrase={pendingBackup.phrase}
          variant="signup"
          busy={busy}
          onFinished={(saved) => { void finishAfterBackup(saved); }}
        />
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lead with what this protects, not with what it is. Someone who came
          here to post has no reason to care that a wallet is being created, but
          every reason to care that only they can use the account. The mechanics
          stay available underneath for people who do want them. */}
      <div className="space-y-1.5">
        <p className="text-white/60 text-sm">{_copy("copy.296ee8873ba8", { defaultValue: "To ensure only you can post or transact in the app using this account, set a password or biometrics." })}</p>
        <p className="text-white/40 text-xs">
          {protection === 'biometric'
            ? _copy("copy.e37273e12fd4", { defaultValue: "Encrypted on this device before anything leaves it, and unlocked with your fingerprint or face — nothing to remember. You can back up your wallet any time from Settings." })
            : _copy("copy.ef33c9296dc4", { defaultValue: "Encrypted on this device before anything leaves it. You can back up your wallet any time from Settings." })}
        </p>
      </div>

      {biometricAvailable === null && (
        <p className="text-white/50 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />{_copy("copy.4ee11d195b8e", { defaultValue: " Checking what this device supports…" })}</p>
      )}

      {showBiometricStep && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
          <Fingerprint className="w-5 h-5 mt-0.5 text-white shrink-0" />
          <div className="space-y-1">
            <p className="text-white text-sm font-medium">{_copy("copy.cf3847db61fe", { defaultValue: "Unlock with your fingerprint or face" })}</p>
            <p className="text-white/50 text-xs leading-relaxed">{_copy("copy.8fd82319e2ef", { defaultValue: "Your device holds the key that unlocks this account. Nothing to type now or later — and Riftn never sees it." })}</p>
          </div>
        </div>
      )}

      {showPasswordFields && (
        <>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={_copy("copy.2de6c884353b", { defaultValue: "Password (min {{value1}} chars)", value1: MIN_PASSWORD_LENGTH })}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoFocus
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <Input
            type="password"
            placeholder={_copy("copy.5ac265f396a2", { defaultValue: "Confirm password" })}
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
          disabled={busy}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.b403bf9c1175", { defaultValue: " Signing you in…" })}</span>
            : (
              <span className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4" />
                {_copy("copy.4b1d0adb1163", { defaultValue: "Secure account" })}
              </span>
            )}
        </Button>
      )}

      {showPasswordFields && (
        <Button
          onClick={handlePasswordNext}
          disabled={busy || !password || !confirm}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.b403bf9c1175", { defaultValue: " Signing you in…" })}</span>
            : _copy("copy.4b1d0adb1163", { defaultValue: "Secure account" })}
        </Button>
      )}

      {/* Either choice stays reachable: biometrics is the default where it
          works, a password is always an option, and it's the only option where
          PRF is unavailable. */}
      {biometricAvailable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => chooseProtection(protection === 'biometric' ? 'password' : 'biometric')}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {protection === 'biometric'
            ? <><KeyRound className="w-3.5 h-3.5" />{_copy("copy.e0356dec4330", { defaultValue: " Use a password instead" })}</>
            : <><Fingerprint className="w-3.5 h-3.5" />{_copy("copy.8f9890053152", { defaultValue: " Use fingerprint or face instead" })}</>}
        </button>
      )}

      {showPasswordFields && biometricAvailable === false && (
        <p className="text-white/40 text-xs text-center">{_copy("copy.2b7f2e71aee4", { defaultValue: "This device can’t use biometrics. You can add them later from Settings on a device that can." })}</p>
      )}
    </div>
  );
}
