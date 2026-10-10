import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Biometric unlock management (Settings → Account Security).
 *
 * Three jobs:
 *  - list the devices enrolled for biometric wallet unlock, and let the user
 *    revoke any of them;
 *  - enrol THIS device (needs the seed, so it asks for the wallet password, or
 *    uses an existing passkey when one already works here);
 *  - add a wallet password to a biometrics-only wallet — the backup path that
 *    keeps a lost or unsupported device from meaning a lost wallet.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Fingerprint, Trash2, KeyRound, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { deriveFromSecret } from '@/lib/wallet-core/derive';
import { decryptString, encryptString } from '@/lib/wallet-core/crypto';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { saveWallet } from '@/lib/wallet-core/store';
import { getWalletProtection, type WalletProtection } from '@/lib/wallet-core/protection';
import {
  describeThisDevice,
  enrollBiometricUnlock,
  removeBiometricUnlock,
  unlockWithBiometrics,
  PasskeyCancelledError,
} from '@/lib/wallet-core/biometric-unlock';
import { PasswordStrengthMeter } from '@/components/app/wallet-setup/PasswordStrengthMeter';
import { SettingsRow } from '@/components/app/settings/SettingsRow';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Ask for the wallet password, then enrol this device's biometrics. */
function EnrollDialog({
  open, onOpenChange, userId, protection, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  protection: WalletProtection;
  onDone: () => void;
}) {
  const { t: _copy } = _useCopy();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setPassword(''); setError(null); setBusy(false); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const enroll = async (getSecret: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      const secret = await getSecret();
      await enrollBiometricUnlock(userId, secret);
      toast.success(_copy("copy.250982a5859d", { defaultValue: "Biometric unlock is on for this device" }));
      onDone();
      close(false);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return;
      setError(err instanceof Error ? err.message : 'Could not turn on biometric unlock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent column className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">{_copy("copy.798a968ee657", { defaultValue: "Add biometric unlock" })}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          <p className="text-white/60 text-sm">
            {protection.hasPassword
              ? _copy("copy.2509598db80e", { defaultValue: "Confirm your wallet password once, then {{value1}} can unlock your wallet with your fingerprint or face.", value1: describeThisDevice() })
              : _copy("copy.1d400ab0cde5", { defaultValue: "Confirm with an existing passkey to add this device." })}
          </p>

          {protection.hasPassword ? (
            <>
              <Input
                type="password"
                placeholder={_copy("copy.b7aaad3dc136", { defaultValue: "Wallet password" })}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoFocus
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                disabled={busy || !password}
                onClick={() => enroll(async () => {
                  const wallet = protection.wallet;
                  if (!wallet?.payload) throw new Error('No wallet password is set for this account.');
                  return decryptString(wallet.payload, password);
                })}
                className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {busy
                  ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.70b1154c072a", { defaultValue: " Setting up…" })}</span>
                  : <span className="flex items-center gap-2"><Fingerprint className="w-4 h-4" />{_copy("copy.dedbe5b582dd", { defaultValue: " Turn on biometric unlock" })}</span>}
              </Button>
            </>
          ) : protection.canUseBiometrics ? (
            <>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                disabled={busy}
                onClick={() => enroll(() => unlockWithBiometrics(userId, protection.wraps))}
                className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {busy
                  ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.70b1154c072a", { defaultValue: " Setting up…" })}</span>
                  : <span className="flex items-center gap-2"><Fingerprint className="w-4 h-4" />{_copy("copy.3f0866a95762", { defaultValue: " Confirm and add" })}</span>}
              </Button>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
              <p>{_copy("copy.cd8776f2c798", { defaultValue: "This wallet has no password, and no passkey that works in this browser. Open DeHub on a device where biometric unlock already works to add this one." })}</p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Add a password wrap to a wallet that currently only has biometrics. */
function AddPasswordBackupDialog({
  open, onOpenChange, userId, protection, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  protection: WalletProtection;
  onDone: () => void;
}) {
  const { t: _copy } = _useCopy();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setPassword(''); setConfirm(''); setError(null); setBusy(false); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleAdd = async () => {
    setError(null);
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      if (!assessment.longEnough) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return; }
      if (assessment.breached === true) {
        setError('This password has appeared in a data breach — choose a different one');
        return;
      }
      if (!assessment.acceptable) { setError('Choose a stronger password (mix letters, numbers, and symbols)'); return; }

      const secret = await unlockWithBiometrics(userId, protection.wraps);
      const derived = deriveFromSecret(secret);
      const encrypted = await encryptString(derived.secret, password);
      // Biometric wraps are untouched — this only fills in the password columns.
      await saveWallet(userId, derived.ethAddress, encrypted);
      toast.success(_copy("copy.0cbb363a7189", { defaultValue: "Password backup added" }));
      onDone();
      close(false);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return;
      setError(err instanceof Error ? err.message : 'Could not add a password backup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent column className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">{_copy("copy.ed9a9b07af95", { defaultValue: "Add a password backup" })}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          <p className="text-white/60 text-sm">{_copy("copy.9df91f8755a1", { defaultValue: "Your wallet currently unlocks with biometrics only. A password lets you get in from a device that can’t do biometrics — and if you ever lose this one. You’ll confirm with your fingerprint or face first." })}</p>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder={_copy("copy.aaf087e964d8", { defaultValue: "Wallet password (min {{value1}} chars)", value1: MIN_PASSWORD_LENGTH })}
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            onClick={handleAdd}
            disabled={busy || !password || !confirm}
            className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {busy
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.7e20d23ed3ee", { defaultValue: " Saving…" })}</span>
              : _copy("copy.2bcd455ba302", { defaultValue: "Add password backup" })}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function BiometricUnlockSettings() {
  const { t: _copy } = _useCopy();
  const { supabaseUserId } = useAuth();
  const [protection, setProtection] = useState<WalletProtection | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabaseUserId) { setLoading(false); return; }
    try {
      setProtection(await getWalletProtection(supabaseUserId));
    } finally {
      setLoading(false);
    }
  }, [supabaseUserId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleRemove = async (credentialId: string) => {
    if (!supabaseUserId || !protection) return;
    // Removing the last way in is a lockout, not a preference.
    if (!protection.hasPassword && protection.wraps.length <= 1) {
      toast.error(_copy("copy.97ba69c42026", { defaultValue: "Add a password backup first — this is the only way to unlock your wallet." }));
      return;
    }
    setRemoving(credentialId);
    try {
      await removeBiometricUnlock(supabaseUserId, credentialId);
      toast.success(_copy("copy.15c9dcfa93a8", { defaultValue: "Device removed" }));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that device');
    } finally {
      setRemoving(null);
    }
  };

  // Sessions signed in with an external wallet (wagmi) have no DeHub-managed
  // seed, so there is nothing here to protect.
  if (!supabaseUserId) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.c10ea304a01d", { defaultValue: " Checking biometric unlock…" })}</div>
    );
  }
  // The probe learned nothing — an expired Supabase session makes both reads
  // return zero rows (RLS hides them rather than erroring), which used to make
  // this whole section vanish on exactly the device where someone comes
  // looking for "add a wallet password". Say so instead of rendering nothing.
  if (protection?.stateUnknown) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium">{_copy("copy.a0d27016d1ec", { defaultValue: "Couldn’t check wallet security" })}</p>
          <p className="text-zinc-400 text-xs">{_copy("copy.6f29a3ccecee", { defaultValue: "This device’s secure session has expired, or the connection dropped. Log out and sign back in on this device, then come back here." })}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl shrink-0"
          onClick={() => { setLoading(true); void refresh(); }}
        >{_copy("copy.942087cc2d41", { defaultValue: "Retry" })}</Button>
      </div>
    );
  }
  if (!protection?.wallet) return null;

  const { wraps, hasPassword, biometricAvailable, canUseBiometrics } = protection;
  const thisDeviceCouldEnroll = biometricAvailable && (hasPassword || canUseBiometrics);

  return (
    <>
      <div className="space-y-3">
        <SettingsRow
          icon={<Fingerprint />}
          title={_copy("copy.18e709a14cb1", { defaultValue: "Biometric unlock" })}
          description={wraps.length === 0
            ? _copy("copy.0d355ddcbf67", { defaultValue: "Unlock your wallet with your fingerprint or face instead of a password" })
            : _copy("copy.b833d24ae4f5", { defaultValue: "Devices with biometric access to this wallet: {{value1}}", value1: wraps.length, value2: wraps.length === 1 ? '' : 's' })}
          action={thisDeviceCouldEnroll ? (
            <Button
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl shrink-0"
              onClick={() => setEnrollOpen(true)}
            >{_copy("copy.419d18afe2d3", { defaultValue: "Add device" })}</Button>
          ) : undefined}
        />

        <p className="pl-8 text-xs text-zinc-500">{_copy("copy.c7b827c10392", { defaultValue: "Web biometric unlock uses a browser passkey. The Android app uses that phone's fingerprint or device lock separately, after the wallet is unlocked there once with its password or recovery phrase." })}</p>

        {wraps.length > 0 && (
          <ul className="space-y-2 pl-8">
            {wraps.map((wrap) => {
              const added = formatWhen(wrap.createdAt);
              const used = formatWhen(wrap.lastUsedAt);
              return (
                <li
                  key={wrap.credentialId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{wrap.label || _copy("copy.06c4a77e4b3e", { defaultValue: "Unknown device" })}</p>
                    <p className="text-zinc-500 text-xs">
                      {added ? _copy("copy.04f3521551d4", { defaultValue: "Added {{value1}}", value1: added }) : _copy("copy.4a3e0e4e8eac", { defaultValue: "Added recently" })}
                      {used ? _copy("copy.8867dad3d7f6", { defaultValue: " · last used {{value1}}", value1: used }) : ''}
                      {/* Recorded at enrolment (backfilled on unlock): a synced
                          passkey answers from the user's other devices via the
                          browser's QR handoff; a device-bound one cannot. */}
                      {wrap.backedUp === true
                        ? _copy("copy.bc72f5e48888", { defaultValue: " · synced passkey — works from your other devices" })
                        : wrap.backedUp === false
                          ? _copy("copy.1bf27f52fd1a", { defaultValue: " · this device only" })
                          : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removing === wrap.credentialId}
                    onClick={() => handleRemove(wrap.credentialId)}
                    className="text-zinc-400 hover:text-red-400 shrink-0"
                    aria-label={_copy("copy.d2f6b9b77710", { defaultValue: "Remove {{value1}}", value1: wrap.label || _copy("copy.cf3cc23e5a6e", { defaultValue: "this device" }) })}
                  >
                    {removing === wrap.credentialId
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {!biometricAvailable && wraps.length === 0 && (
          <p className="text-zinc-500 text-xs pl-8">{_copy("copy.de53684b6cf8", { defaultValue: "This device can’t do biometric unlock. Try it on a phone with Face ID, Touch ID, or an Android fingerprint." })}</p>
        )}

        {/* The safety net: a biometrics-only wallet has exactly one route in. */}
        {!hasPassword && (
          <div className="flex flex-col items-stretch gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3">
            <div className="flex items-start gap-2 min-w-0">
              <KeyRound className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">{_copy("copy.0c9566ffe94c", { defaultValue: "No password backup" })}</p>
                <p className="text-zinc-400 text-xs">
                  {protection.seedIsPasskeyWrapped && !canUseBiometrics
                    ? _copy("copy.382977a2fc76", { defaultValue: "Biometrics is the only way into this wallet, and it was set up in the DeHub mobile app — add a password from that app’s settings so a lost phone isn’t a lost wallet." })
                    : _copy("copy.0a9a5533eec5", { defaultValue: "Biometrics is the only way into this wallet. Add a password so a lost device isn’t a lost wallet." })}
                </p>
              </div>
            </div>
            {canUseBiometrics && (
              <Button
                variant="outline"
                size="sm"
                className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl w-full"
                onClick={() => setBackupOpen(true)}
              >{_copy("copy.9fd728c66c9a", { defaultValue: "Add" })}</Button>
            )}
          </div>
        )}
      </div>

      {enrollOpen && (
        <EnrollDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          userId={supabaseUserId}
          protection={protection}
          onDone={refresh}
        />
      )}
      {backupOpen && (
        <AddPasswordBackupDialog
          open={backupOpen}
          onOpenChange={setBackupOpen}
          userId={supabaseUserId}
          protection={protection}
          onDone={refresh}
        />
      )}
    </>
  );
}
