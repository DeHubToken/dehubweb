/**
 * Wallet unlock flow (embedded in the LoginModal drawer).
 *
 * Two ways in, both client-side:
 *  - biometrics — one Face ID / Touch ID prompt releases a WebAuthn PRF secret
 *    that opens an HKDF+AES-GCM wrap of the seed (see lib/wallet-core/passkey);
 *  - the wallet password — Argon2id + AES-GCM, the original path, still the
 *    fallback everywhere PRF is unavailable.
 *
 * Whichever succeeds hands the derived key to the auth provider. Also includes
 * the recovery-code reset path for forgotten passwords, and an offer to enrol
 * biometrics right after a password unlock — the one moment we legitimately
 * hold the plaintext seed and can wrap it without asking for anything again.
 */
import { useEffect, useState } from 'react';
import { Loader2, KeyRound, AlertTriangle, Copy, Fingerprint, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { decryptString, encryptString } from '@/lib/wallet-core/crypto';
import { deriveFromSecret } from '@/lib/wallet-core/derive';
import {
  generateRecoveryCode,
  encryptSeedWithRecoveryCode,
  decryptSeedWithRecoveryCode,
  isValidRecoveryCode,
} from '@/lib/wallet-core/recovery';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { copyThenClear } from '@/lib/wallet-core/clipboard';
import { fetchRecoveryPayload, saveWallet, type StoredWallet } from '@/lib/wallet-core/store';
import { getWalletProtection, loadWalletOrCached } from '@/lib/wallet-core/protection';
import {
  enrollBiometricUnlock,
  unlockWithBiometrics,
  hasDeclinedBiometricOffer,
  declineBiometricOffer,
  clearBiometricOfferDecline,
  hasBiometricUsableHere,
  isPasswordBackupReminderSnoozed,
  snoozePasswordBackupReminder,
  PasskeyCancelledError,
  type PasskeyWrap,
} from '@/lib/wallet-core/biometric-unlock';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { useAuth } from '@/contexts/AuthContext';
import { requestSessionWalletConnect } from '@/lib/wallet-reconnect';

interface WalletUnlockStepProps {
  userId: string;
  onComplete: (privKeyHex: string) => Promise<void>;
  /** Sign out of the current identity and return to the login options.
   *  Gives a user who can't unlock (wrong account / lost password AND
   *  recovery code) a way out instead of a dead-end. */
  onLogout?: () => void | Promise<void>;
}

type Phase = 'unlock' | 'recover' | 'recover-new-code' | 'enroll-offer' | 'set-password' | 'lost-device';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

export function WalletUnlockStep({ userId, onComplete, onLogout }: WalletUnlockStepProps) {
  // replaceLostWallet: only for the lost-device path. That flow mints a
  // wallet, moves the account onto it and finishes the sign-in itself, so it
  // cannot go through onComplete — which expects a key for the wallet this
  // row already names. The other two serve the no-built-in-wallet hand-off.
  const { replaceLostWallet, isAuthenticated, closeLoginModal } = useAuth();
  const [phase, setPhase] = useState<Phase>('unlock');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recovery flow state
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [newCodeAck, setNewCodeAck] = useState(false);
  const [pendingPrivKey, setPendingPrivKey] = useState<string | null>(null);
  // Biometric state. `wallet` is loaded up front (not just on submit) because
  // which options to offer depends on whether a password wrap even exists.
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [wraps, setWraps] = useState<PasskeyWrap[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [noWalletOnServer, setNoWalletOnServer] = useState(false);
  const [stateUnknown, setStateUnknown] = useState(false);
  const [seedIsPasskeyWrapped, setSeedIsPasskeyWrapped] = useState(false);
  const [probing, setProbing] = useState(true);
  const [probeNonce, setProbeNonce] = useState(0);
  // Held only across the post-password enrolment offer, then dropped.
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [showPasswordAnyway, setShowPasswordAnyway] = useState(false);

  const loadWallet = () => loadWalletOrCached(userId);

  // Decide up front what this device + account can actually offer.
  useEffect(() => {
    let cancelled = false;
    setProbing(true);
    getWalletProtection(userId).then((p) => {
      if (cancelled) return;
      setWallet(p.wallet);
      setBiometricAvailable(p.biometricAvailable);
      setWraps(p.wraps);
      setNoWalletOnServer(p.noWalletOnServer);
      setStateUnknown(p.stateUnknown);
      setSeedIsPasskeyWrapped(p.seedIsPasskeyWrapped);
      setProbing(false);
    });
    return () => { cancelled = true; };
  }, [userId, probeNonce]);

  // From the payload's KDF header, not mere presence: the mobile app's
  // biometric wallets write an hkdf wrap into the password column, and a
  // password box in front of one of those is a dead end.
  const hasPasswordWrap = !!wallet?.payload && !seedIsPasskeyWrapped;
  const canUseBiometrics = biometricAvailable === true && wraps.length > 0;
  // Enrolled elsewhere but unusable here — the user needs the device they set
  // it up on, or a password backup added from that device.
  const biometricEnrolledElsewhere = biometricAvailable === false && wraps.length > 0;
  // What the wraps' recorded metadata says about using them from THIS device:
  // a synced passkey (or one with the "hybrid" transport) can answer here —
  // the browser hands off to the phone that holds it via QR — while a
  // device-bound one (Windows Hello) can only ever answer on its own machine.
  // Pre-migration rows have neither recorded and stay null → both false.
  const someWrapReachableHere = wraps.some(
    (w) => w.backedUp === true || (w.transports ?? []).includes('hybrid'),
  );
  const allWrapsDeviceBound =
    wraps.length > 0 &&
    wraps.every((w) => w.backedUp === false && !!w.transports && !w.transports.includes('hybrid'));

  const handleBiometricUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const current = wallet ?? await loadWallet();
      if (!wallet) setWallet(current);
      const secret = await unlockWithBiometrics(userId, wraps);
      const derived = deriveFromSecret(secret);
      // Stricter than the password path's warn-only check below: a passkey wrap
      // that opens to a different address means this credential belongs to
      // another wallet (e.g. a stale wrap from an interrupted signup). Signing
      // in with it would silently switch the user's wallet, so refuse.
      if (current.ethAddress && derived.ethAddress.toLowerCase() !== current.ethAddress.toLowerCase()) {
        throw new Error('That passkey unlocks a different wallet. Use your wallet password instead.');
      }
      // A wallet whose ONLY key is this passkey is one lost handset from being
      // unreachable, and the person cannot discover that until the day they
      // try DeHub somewhere else. This is the moment to warn them: they have
      // just proved themselves, the plaintext seed is in hand, and the wrap
      // costs them one password and no second prompt.
      //
      // Deliberately NOT asked at signup. Nobody arriving has a reason to care
      // about a backup key yet, and a password field on the first screen is
      // pure drop-off. By the time this fires they have chosen to do something
      // with the wallet, so the warning has a reason attached to it.
      //
      // A warning with a choice, not a gate: "not now" signs in and snoozes
      // the reminder for a week. Forcing it turned the unlock into a wall, and
      // a wall in front of a tip or a login gets a throwaway password typed at
      // it — a backup nobody remembers is worse than a reminder that returns.
      if (!hasPasswordWrap && !isPasswordBackupReminderSnoozed(userId)) {
        setPendingSecret(derived.secret);
        setPendingPrivKey(derived.ethPrivateKey);
        setPhase('set-password');
        return;
      }
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return; // dismissed — not a failure
      const message = err instanceof Error ? err.message : 'Biometric unlock failed';
      // The passkey layer states the failure but not the remedy, because only
      // here do we know whether this wallet has a password to fall back to.
      // Telling a biometrics-only user to "use your password" is a dead end.
      //
      // The most common failure here is an enrolled credential that lives on
      // another device and didn't sync, so say what happens next rather than
      // leaving "use your password" as the whole answer — otherwise this
      // device stays password-only and the user is never told it needn't be.
      const willOfferEnrolHere =
        biometricAvailable === true && !hasBiometricUsableHere(userId) && !hasDeclinedBiometricOffer(userId);
      setError(
        hasPasswordWrap
          ? willOfferEnrolHere
            ? `${message} Unlock with your wallet password below — we'll offer to set biometrics up on this device right after.`
            : `${message} Use your wallet password instead.`
          : `${message} This wallet has no password yet — sign in on a device where biometrics work and add one from Settings → Account Security.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const current = wallet ?? await loadWallet();
      if (!wallet) setWallet(current);
      if (!current.payload) {
        throw new Error('This wallet has no password — unlock it with biometrics instead.');
      }
      const secret = await decryptString(current.payload, password);
      const derived = deriveFromSecret(secret);
      if (current.ethAddress && derived.ethAddress.toLowerCase() !== current.ethAddress.toLowerCase()) {
        console.warn('[WalletUnlock] Derived address differs from stored address', {
          derived: derived.ethAddress, stored: current.ethAddress,
        });
      }
      // The one moment we hold the plaintext seed with the user's attention:
      // offer to make the next unlock a fingerprint instead of this. Asked once
      // per device — someone who said no must not be asked at every login.
      //
      // Gated on "biometrics have never worked on THIS device", not "this
      // account has no wraps": wraps are account-wide, so enrolling on a phone
      // used to suppress the offer on every other device the user owns,
      // leaving them typing this password forever with nothing offering a way
      // out. Someone whose passkey does sync here just enrols a second
      // credential, which is harmless, and only if they chose the password
      // over the biometric button already on screen.
      if (biometricAvailable === true && !hasBiometricUsableHere(userId) && !hasDeclinedBiometricOffer(userId)) {
        setPendingSecret(derived.secret);
        setPendingPrivKey(derived.ethPrivateKey);
        setPassword('');
        setPhase('enroll-offer');
        return;
      }
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Write the password wrap for a biometrics-only wallet, then continue.
   *
   * Mirrors AddPasswordBackupDialog in Settings, minus its biometric step: the
   * unlock that got us here already produced the seed, so this asks for nothing
   * beyond the password itself. The biometric wraps are untouched — this only
   * fills in the password columns, so the fingerprint keeps working.
   *
   * A failure here must not strand the unlock that already succeeded. The
   * caller is mid-action (a tip, a mint, a login), and refusing to hand back a
   * key we are holding would turn a backup problem into a broken feature — so
   * the error is shown, and the wallet still opens.
   */
  const handleSetPassword = async () => {
    if (!pendingSecret || !pendingPrivKey) return;
    setError(null);
    if (password !== newConfirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    // Rejections release the button before returning. There is no `finally`
    // covering this block — the success path deliberately falls through to the
    // sign-in below, still busy — so anything that bails here has to say so, or
    // the form stays disabled with no way to correct the password.
    const reject = (message: string) => { setError(message); setBusy(false); };
    try {
      const assessment = await assessPassword(password);
      if (!assessment.longEnough) {
        reject(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (assessment.breached === true) {
        reject('This password has appeared in a data breach — choose a different one');
        return;
      }
      if (!assessment.acceptable) {
        reject('Choose a stronger password (mix letters, numbers, and symbols)');
        return;
      }

      const derived = deriveFromSecret(pendingSecret);
      const encrypted = await encryptString(derived.secret, password);
      await saveWallet(userId, derived.ethAddress, encrypted);
      toast.success('Password backup saved — your wallet now opens on any device');
    } catch (err) {
      reject(err instanceof Error ? err.message : 'Could not save the password backup');
      return;
    }

    const privKey = pendingPrivKey;
    setPendingSecret(null);
    setPassword('');
    setNewConfirm('');
    try {
      await onComplete(privKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setBusy(false);
    }
  };

  /** Decline the password backup for now and finish signing in. */
  const handleSkipSetPassword = async () => {
    if (!pendingPrivKey) return;
    setBusy(true);
    setError(null);
    // A snooze, not a permanent no — the risk stays, so the reminder returns
    // after a week rather than at every unlock.
    snoozePasswordBackupReminder(userId);
    const privKey = pendingPrivKey;
    setPendingSecret(null);
    setPassword('');
    setNewConfirm('');
    try {
      await onComplete(privKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Give up on the old wallet and mint a new one, carrying the account across.
   *
   * The password is required rather than offered: this runs on a device that
   * has just proved it cannot do biometrics for this account, so a
   * biometrics-only replacement would rebuild the same trap the user is
   * standing in.
   */
  const handleReplaceLostWallet = async () => {
    setError(null);
    if (password !== newConfirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    const reject = (message: string) => { setError(message); setBusy(false); };
    try {
      const assessment = await assessPassword(password);
      if (!assessment.longEnough) {
        reject(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (assessment.breached === true) {
        reject('This password has appeared in a data breach — choose a different one');
        return;
      }
      if (!assessment.acceptable) {
        reject('Choose a stronger password (mix letters, numbers, and symbols)');
        return;
      }
      // Closes the sheet and finishes the sign-in on success.
      await replaceLostWallet(password);
      setPassword('');
      setNewConfirm('');
    } catch (err) {
      reject(err instanceof Error ? err.message : 'Could not set up a new wallet');
      return;
    }
    setBusy(false);
  };

  /**
   * Enrol from the post-password offer, then finish signing in either way.
   *
   * Enrolment and sign-in are caught separately on purpose: they used to share
   * one try/catch, so a sign-in failure was reported as an enrolment failure
   * AND retried a second time from the catch block.
   */
  const handleEnrollOffer = async () => {
    if (!pendingSecret || !pendingPrivKey) return;
    setBusy(true);
    setError(null);
    try {
      await enrollBiometricUnlock(userId, pendingSecret);
      clearBiometricOfferDecline(userId);
      toast.success('Biometric unlock is on — no password next time');
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        setBusy(false);
        return; // stay on the offer; they can skip or retry
      }
      // Enrolment is a convenience, never a gate on signing in — fall through.
      console.warn('[WalletUnlock] Biometric enrolment failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not turn on biometric unlock');
    }

    setPendingSecret(null);
    try {
      await onComplete(pendingPrivKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setBusy(false);
    }
  };

  const handleSkipEnroll = async () => {
    if (!pendingPrivKey) return;
    setBusy(true);
    try {
      // Remember the "no" so this is a one-time question, not a login tax.
      declineBiometricOffer(userId);
      setPendingSecret(null);
      await onComplete(pendingPrivKey);
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isValidRecoveryCode(recoveryInput)) {
        throw new Error('Invalid recovery code');
      }
      if (newPassword !== newConfirm) {
        throw new Error("Passwords don't match");
      }
      const assessment = await assessPassword(newPassword);
      if (!assessment.longEnough) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      if (!assessment.acceptable) {
        throw new Error('Choose a stronger password (mix letters, numbers, and symbols)');
      }

      const recoveryPayload = await fetchRecoveryPayload(userId);
      if (!recoveryPayload) {
        throw new Error('No recovery record found for this account.');
      }
      const secret = await decryptSeedWithRecoveryCode(recoveryPayload, recoveryInput);
      const derived = deriveFromSecret(secret);

      // Re-encrypt under the new password and rotate the recovery code.
      const encrypted = await encryptString(derived.secret, newPassword);
      const freshCode = generateRecoveryCode();
      const freshRecoveryPayload = await encryptSeedWithRecoveryCode(derived.secret, freshCode);
      await saveWallet(userId, derived.ethAddress, encrypted, freshRecoveryPayload);

      setPendingPrivKey(derived.ethPrivateKey);
      setNewRecoveryCode(freshCode);
      setPhase('recover-new-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverFinish = async () => {
    if (!pendingPrivKey) return;
    setBusy(true);
    try {
      await onComplete(pendingPrivKey);
    } catch {
      /* toast shown upstream */
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!onLogout) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const recoveryAndLogoutLinks = (
    <div className="space-y-3 pt-1">
      {hasPasswordWrap && (
        <button
          type="button"
          onClick={() => { setPhase('recover'); setError(null); }}
          disabled={busy || loggingOut}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
        >
          Forgot password? Use recovery code
        </button>
      )}
      {/* Offered wherever biometrics are part of the answer, including the
          screen that CAN show a biometrics button: this device having a
          fingerprint reader says nothing about whether the enrolled credential
          is still on it, so the person whose handset is gone lands there too
          and needs a way out that is not "log out". */}
      {wraps.length > 0 && (
        <button
          type="button"
          onClick={() => { setPhase('lost-device'); setError(null); setPassword(''); setNewConfirm(''); }}
          disabled={busy || loggingOut}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
        >
          Lost the device you set this up on?
        </button>
      )}
      {onLogout && (
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy || loggingOut}
          className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors border-t border-white/10 pt-3 disabled:opacity-50"
        >
          {loggingOut ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Logging out…
            </span>
          ) : (
            'Log out'
          )}
        </button>
      )}
    </div>
  );

  if (phase === 'enroll-offer') {
    return (
      <div className="space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
          <Fingerprint className="w-6 h-6 text-white" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-white text-sm font-medium">Skip the password next time?</p>
          <p className="text-white/50 text-xs leading-relaxed">
            Unlock with your fingerprint or face on this device instead. Your wallet password keeps
            working — it stays your backup on devices that can’t do this. You can turn this on later
            from Settings → Account Security.
          </p>
        </div>
        <Button
          onClick={handleEnrollOffer}
          disabled={busy}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</span>
            : <span className="flex items-center gap-2"><Fingerprint className="w-4 h-4" /> Turn on biometric unlock</span>}
        </Button>
        <button
          type="button"
          onClick={handleSkipEnroll}
          disabled={busy}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    );
  }

  if (phase === 'lost-device') {
    return (
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <p className="text-white text-sm font-medium">Start a new wallet on this device</p>
          <p className="text-white/50 text-xs leading-relaxed">
            Your account comes with it — same username, posts, messages and followers. Only the wallet
            itself is replaced.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
          <p>Any DeHub tokens in your old wallet can be recovered but other assets will be lost.</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (password && newConfirm && !busy) handleReplaceLostWallet(); }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={`New wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoFocus
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <Input
            type="password"
            placeholder="Confirm password"
            value={newConfirm}
            onChange={(e) => setNewConfirm(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={busy || !password || !newConfirm}
            className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {busy
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</span>
              : 'Create a new wallet'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => { setPhase('unlock'); setError(null); setPassword(''); setNewConfirm(''); }}
          disabled={busy}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
        >
          Back
        </button>
      </div>
    );
  }

  // A security warning with a choice, not a gate. The first cut of this had
  // no "not now" — on the theory that a dismissible prompt is a prompt most
  // people dismiss — but that meant anyone mid-tip or mid-login hit a wall
  // they couldn't decline, and a wall gets a throwaway password typed at it.
  // So: state the risk plainly, let them choose, and if they skip, the
  // reminder returns in a week (snoozePasswordBackupReminder). Settings →
  // Account Security has the same flow whenever they're ready.
  if (phase === 'set-password') {
    return (
      <div className="space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-white text-sm font-medium">Your wallet has no backup</p>
          <p className="text-white/50 text-xs leading-relaxed">
            It only opens with biometrics on this device — lose the device and nobody, including DeHub,
            can get you back in. A password fixes that and lets you sign in anywhere. Your fingerprint
            keeps working here.
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (password && newConfirm && !busy) handleSetPassword(); }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={`Wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoFocus
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <Input
            type="password"
            placeholder="Confirm password"
            value={newConfirm}
            onChange={(e) => setNewConfirm(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={busy || !password || !newConfirm}
            className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {busy
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving…</span>
              : 'Save and continue'}
          </Button>
        </form>
        <button
          type="button"
          onClick={handleSkipSetPassword}
          disabled={busy}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
        >
          Not now — remind me later
        </button>
      </div>
    );
  }

  if (phase === 'recover-new-code' && newRecoveryCode) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
          <p>Your password was reset. This is your NEW recovery code — the old one no longer works. Save it somewhere safe.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white break-words select-all">
          {newRecoveryCode}
        </div>
        <Button
          variant="outline"
          onClick={async () => { await copyThenClear(newRecoveryCode); toast.success('Recovery code copied — clipboard clears in 30s'); }}
          className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10"
        >
          <Copy className="w-4 h-4 mr-2" /> Copy recovery code
        </Button>
        <label className="flex items-start gap-2 text-sm text-white">
          <Checkbox checked={newCodeAck} onCheckedChange={(v) => setNewCodeAck(v === true)} className="mt-0.5" />
          <span>I have saved my new recovery code</span>
        </label>
        <Button
          disabled={!newCodeAck || busy}
          onClick={handleRecoverFinish}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing you in…</span> : 'Finish & sign in'}
        </Button>
      </div>
    );
  }

  if (phase === 'recover') {
    return (
      <div className="space-y-4">
        <p className="text-white/60 text-sm">
          Enter your 24-word recovery code and choose a new wallet password.
        </p>
        <Textarea
          value={recoveryInput}
          onChange={(e) => setRecoveryInput(e.target.value)}
          rows={3}
          placeholder="word word word…"
          className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
          autoFocus
        />
        <div className="space-y-2">
          <Input
            type="password"
            placeholder={`New wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <PasswordStrengthMeter password={newPassword} />
        </div>
        <Input
          type="password"
          placeholder="Confirm new password"
          value={newConfirm}
          onChange={(e) => setNewConfirm(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { setPhase('unlock'); setError(null); }} className="flex-1 h-12 text-white/60 hover:text-white rounded-xl">
            Back
          </Button>
          <Button
            disabled={busy || !recoveryInput.trim() || !newPassword || !newConfirm}
            onClick={handleRecover}
            className="flex-1 h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Recovering…</span> : 'Reset password'}
          </Button>
        </div>
      </div>
    );
  }

  // The site preloader, not an inline spinner: this is the first thing on
  // screen after the login sheet hands over, and changing loader idiom
  // mid-handoff is half of what made the sequence read as a stall.
  if (probing) {
    return (
      <DeHubPageLoader
        size={56}
        minHeight="180px"
        label="Checking how to unlock your wallet…"
        // The loader's default caption colour is tuned for page surfaces; this
        // sheet is always dark. A colour alpha, not an opacity utility — the
        // mark's fade-in animates `opacity` and would win over that.
        className="[&_span]:text-white/50"
      />
    );
  }

  // The probe learned nothing: the reads failed, or ran without a live
  // Supabase session for this user — where RLS answers with zero rows, so a
  // wallet with a password wrap and enrolled devices looks exactly like a
  // bare biometrics-only one. Falling through would assert that guess as
  // fact ("no password, no biometrics here") and hide the password box that
  // would have worked. Say what happened and what fixes it instead.
  if (stateUnknown) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
          <p>
            We couldn’t check how your wallet is protected on this device — the secure session
            here has expired, or the connection dropped. Your wallet is unaffected. Try again,
            or log out and sign back in on this device to refresh it.
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button
          onClick={() => { setError(null); setProbeNonce((n) => n + 1); }}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          Try again
        </Button>
        {recoveryAndLogoutLinks}
      </div>
    );
  }

  // The account has no built-in wallet at all — its signatures come from an
  // external wallet, and this is what an email sign-in to a MetaMask/Phantom
  // account looks like when something asks for a signature. A password box or
  // a biometrics pitch here can never work; hand over to the connect sheet
  // instead. Gated on the server's positive answer, not on the fetch failing —
  // see noWalletOnServer in wallet-core/protection.
  if (noWalletOnServer && wraps.length === 0) {
    if (isAuthenticated) {
      return (
        <div className="space-y-4">
          <p className="text-white/60 text-sm leading-relaxed">
            You’re signed in to a wallet-based account via email — there’s no built-in wallet to
            unlock here. Connect the account’s wallet to use wallet features, or log out and sign
            back in with it.
          </p>
          <Button
            onClick={() => { closeLoginModal(); requestSessionWalletConnect(); }}
            className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            <span className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Connect wallet</span>
          </Button>
          {recoveryAndLogoutLinks}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-white/60 text-sm leading-relaxed">
          This account signs in with its own wallet app — there’s no wallet password to enter.
          Go back and choose Connect Wallet to sign in.
        </p>
        {recoveryAndLogoutLinks}
      </div>
    );
  }

  // Nothing on this device can open the wallet: it's biometric-only and this
  // browser can't do PRF. Say exactly what will fix it rather than showing a
  // password box that can never work.
  if (!hasPasswordWrap && !canUseBiometrics) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
          <p>
            {seedIsPasskeyWrapped && wraps.length === 0
              ? 'This wallet’s biometric unlock was set up in the DeHub mobile app. Open the app on that phone to use the wallet — or add a wallet password there, from its Settings, to unlock it here.'
              : biometricEnrolledElsewhere
                ? 'This wallet unlocks with biometrics, which this browser doesn’t support. Open DeHub on the device you set it up on — or add a wallet password there, from Settings → Account Security.'
                : 'This wallet unlocks with biometrics, but none are set up on this device. Open DeHub on the device you set it up on, or add a wallet password there from Settings → Account Security.'}
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {recoveryAndLogoutLinks}
      </div>
    );
  }

  const showPasswordForm = hasPasswordWrap && (!canUseBiometrics || showPasswordAnyway);

  return (
    <div className="space-y-4">
      {canUseBiometrics ? (
        <p className="text-white/60 text-sm flex items-center gap-2">
          <Fingerprint className="w-4 h-4 shrink-0" />
          Unlock your wallet with your fingerprint or face to sign in.
        </p>
      ) : (
        <p className="text-white/60 text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4 shrink-0" />
          Enter your wallet password to unlock your wallet and sign in.
        </p>
      )}

      {canUseBiometrics && (
        <Button
          onClick={handleBiometricUnlock}
          disabled={busy}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</span>
            : <span className="flex items-center gap-2"><Fingerprint className="w-4 h-4" /> Unlock with biometrics</span>}
        </Button>
      )}

      {/* canUseBiometrics only says this machine HAS an authenticator — the
          enrolled credential may live on another device entirely, and with no
          password wrap there is nothing else on this screen to try. Name the
          device the wallet was set up on so a confused "I never set up
          biometrics" moment turns into "oh, that's my phone" — and use the
          recorded transports/backup state to say whether the browser's QR
          handoff can reach it (synced passkeys and "hybrid" transports can;
          a Windows Hello credential answers only on its own machine). */}
      {canUseBiometrics && !hasPasswordWrap && wraps.some((w) => w.label) && (
        <p className="text-white/40 text-xs text-center">
          Your wallet's biometric unlock was set up on: {[...new Set(wraps.map((w) => w.label).filter(Boolean))].join(', ')}.{' '}
          {someWrapReachableHere
            ? 'Your passkey can answer from that device: when the passkey sheet opens, choose “use another device” and scan the QR code with it.'
            : allWrapsDeviceBound
              ? 'That credential only works on the device it was made on — open DeHub there, or add a wallet password from its Settings → Account Security to unlock anywhere.'
              : 'On a different device, choose that device if your browser offers it — or open Settings → Account Security there to add a wallet password.'}
        </p>
      )}

      {showPasswordForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (password && !busy) handleUnlock(); }}
          className="space-y-4"
        >
          <Input
            type="password"
            placeholder="Wallet password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoFocus={!canUseBiometrics}
          />
          <Button
            type="submit"
            disabled={busy || !password}
            className={
              canUseBiometrics
                ? 'w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl border border-white/10'
                : 'w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl'
            }
          >
            {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</span> : 'Unlock wallet'}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {canUseBiometrics && hasPasswordWrap && !showPasswordAnyway && (
        <button
          type="button"
          disabled={busy}
          onClick={() => { setShowPasswordAnyway(true); setError(null); }}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5" /> Use my wallet password instead
        </button>
      )}

      {recoveryAndLogoutLinks}
    </div>
  );
}
