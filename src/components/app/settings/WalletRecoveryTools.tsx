import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Wallet recovery tools (Settings → Account Security):
 *  - Back up wallet: after a fresh unlock, the wallet's 12 words (when it was
 *    made from them) and, under Advanced, its private key.
 *  - Switch to a different old account: Supabase links Google/Email logins
 *    that share a verified email into ONE identity, so a person who had two
 *    separate old Web3Auth-era accounts (one per login method) can only
 *    ever have one of them "active" here. This lets them retrieve the OTHER
 *    old account's key and swap to it — self-service, no support/SQL needed.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, KeyRound, Repeat, ArrowDownToLine, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { deriveFromSecret } from '@/lib/wallet-core/derive';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { PasswordStrengthMeter } from '@/components/app/wallet-setup/PasswordStrengthMeter';
import { checkLegacyAccount, type LegacyAccountMatch } from '@/lib/wallet-core/legacy-detect';
import {
  legacyAccountForWallet,
  legacyAccountsForProvider,
} from '@/lib/wallet-core/legacy-match';
import { predictSafeAddress } from '@/lib/smart-account-address';
import { getWalletProtection } from '@/lib/wallet-core/protection';
import { PasskeyCancelledError } from '@/lib/wallet-core/biometric-unlock';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { DhbAmount } from '@/components/app/DhbAmount';
import { SeedPhraseBackup } from '@/components/app/wallet-setup/SeedPhraseBackup';
import { PrivateKeyBackup } from '@/components/app/wallet-setup/PrivateKeyBackup';
import { getBackupStatus, markBackedUp } from '@/lib/wallet-core/backup-status';
import type { WalletBackup } from '@/lib/wallet-core/export';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

// ── Back up wallet (12 words, private key under Advanced) ─────────────────

function BackUpWalletDialog({ open, onOpenChange, onBackedUp }: { open: boolean; onOpenChange: (v: boolean) => void; onBackedUp: () => void }) {
  const { t: _copy } = _useCopy();
  const { exportPrivateKey, exportPrivateKeyWithBiometrics, supabaseUserId } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<WalletBackup | null>(null);
  const [showKey, setShowKey] = useState(false);
  const revealedKey = backup && (showKey || !backup.phrase) ? backup.privateKey : null;
  // Which unlock methods this wallet + device actually support. A wallet with
  // no password can only be exported with biometrics, so the dialog must not
  // show a password box that cannot work.
  const [hasPassword, setHasPassword] = useState(true);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);

  const reset = () => { setPassword(''); setError(null); setBackup(null); setShowKey(false); setBusy(false); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  useEffect(() => {
    if (!open || !supabaseUserId) return;
    let cancelled = false;
    getWalletProtection(supabaseUserId).then((p) => {
      if (cancelled) return;
      setHasPassword(p.hasPassword);
      setCanUseBiometrics(p.canUseBiometrics);
    });
    return () => { cancelled = true; };
  }, [open, supabaseUserId]);

  const recordBackup = async (result: WalletBackup) => {
    if (!supabaseUserId) return;
    await markBackedUp(supabaseUserId, result.ethAddress);
    onBackedUp();
  };

  const runExport = async (fn: () => Promise<WalletBackup>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      setBackup(result);
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return;
      setError(err instanceof Error ? err.message : 'Failed to export key');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => runExport(() => exportPrivateKey(password));
  const handleBiometricExport = () => runExport(() => exportPrivateKeyWithBiometrics());

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent column className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">{_copy("copy.ef9ec257e675", { defaultValue: "Back up wallet" })}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          {backup?.phrase && !showKey ? (
            <>
              <SeedPhraseBackup
                phrase={backup.phrase}
                variant="settings"
                onFinished={() => { void recordBackup(backup); close(false); }}
              />
              <button
                type="button"
                onClick={() => setShowKey(true)}
                className="w-full py-1 text-xs text-white/40 hover:text-white/70 transition-colors"
              >{_copy("copy.50e88d341eaa", { defaultValue: "Advanced: show private key instead" })}</button>
            </>
          ) : revealedKey ? (
            <PrivateKeyBackup
              privateKey={revealedKey}
              hasPhrase={!!backup?.phrase}
              onFinished={() => { if (backup) void recordBackup(backup); close(false); }}
            />
          ) : (
            <>
              <p className="text-white/60 text-sm flex items-center gap-2">
                {canUseBiometrics && !hasPassword
                  ? <><Fingerprint className="w-4 h-4 shrink-0" />{_copy("copy.a130d3033853", { defaultValue: " Confirm with your fingerprint or face to see your backup." })}</>
                  : <><KeyRound className="w-4 h-4 shrink-0" />{_copy("copy.1cfa0e57d832", { defaultValue: " Enter your wallet password to see your backup." })}</>}
              </p>
              {hasPassword && (
                <Input
                  type="password"
                  placeholder={_copy("copy.b7aaad3dc136", { defaultValue: "Wallet password" })}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
              {hasPassword && (
                <Button
                  onClick={handleExport}
                  disabled={busy || !password}
                  className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
                >
                  {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.ffa6d46b9ed4", { defaultValue: " Decrypting…" })}</span> : _copy("copy.2c44bdeaa37c", { defaultValue: "Show backup" })}
                </Button>
              )}
              {canUseBiometrics && (
                <Button
                  onClick={handleBiometricExport}
                  disabled={busy}
                  variant={hasPassword ? 'outline' : 'default'}
                  className={hasPassword
                    ? 'w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10'
                    : 'w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl'}
                >
                  {busy && !hasPassword
                    ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.ffa6d46b9ed4", { defaultValue: " Decrypting…" })}</span>
                    : (
                      <span className="flex items-center gap-2">
                        <Fingerprint className="w-4 h-4" />
                        {hasPassword ? _copy("copy.b94496133a98", { defaultValue: "Use biometrics instead" }) : _copy("copy.2c44bdeaa37c", { defaultValue: "Show backup" })}
                      </span>
                    )}
                </Button>
              )}
              {!hasPassword && !canUseBiometrics && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
                  <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                  <p>{_copy("copy.7b33d21f5c2c", { defaultValue: "This wallet unlocks with biometrics, which aren’t available in this browser. Back it up from the device you set it up on." })}</p>
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Switch to a different old account ───────────────────────────────────────

const OLD_LOGIN_LABELS: Record<string, string> = {
  google: 'Google', apple: 'Apple', twitter: 'X (Twitter)', discord: 'Discord',
  email: 'Email', email_passwordless: 'Email',
};

function SwitchOldAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t: _copy } = _useCopy();
  const { switchActiveWallet, walletAddress } = useAuth();
  const [migratedKey, setMigratedKey] = useState<string | null>(null);
  const [migrateEmail, setMigrateEmail] = useSurfaceDraft("src/components/app/settings/WalletRecoveryTools.tsx:migrateEmail", '');
  const [migrateBusy, setMigrateBusy] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownAccounts, setKnownAccounts] = useState<LegacyAccountMatch[]>([]);
  const [knownAccountsChecked, setKnownAccountsChecked] = useState(false);
  const [previewSafeAddress, setPreviewSafeAddress] = useState<string | null>(null);
  const [safeAddressChecked, setSafeAddressChecked] = useState(false);

  // Preview what's on each old account BEFORE the user picks a login — the
  // login step itself can't be skipped (it's what proves ownership and lets
  // Web3Auth reconstruct the key), but which button to click shouldn't be a
  // blind guess.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    checkLegacyAccount().then((hint) => {
      if (cancelled) return;
      if (hint.exists === true && hint.accounts?.length) {
        setKnownAccounts(hint.accounts);
        const emailAccount = hint.accounts.find((a) => a.signupMethod === 'email' || a.signupMethod === 'email_passwordless');
        if (emailAccount && hint.email) setMigrateEmail((prev) => prev || hint.email!);
      }
    }).finally(() => {
      if (!cancelled) setKnownAccountsChecked(true);
    });
    return () => { cancelled = true; };
  }, [open, setMigrateEmail]);

  const accountFor = (provider: string) => {
    const matches = legacyAccountsForProvider(knownAccounts, provider);
    return matches.length === 1 ? matches[0] : undefined;
  };

  const reset = () => {
    setMigratedKey(null); setMigrateEmail(''); setMigrateBusy(null);
    setPassword(''); setConfirm(''); setAck(false); setBusy(false); setError(null);
    setKnownAccounts([]); setKnownAccountsChecked(false);
    setPreviewSafeAddress(null); setSafeAddressChecked(false);
  };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const previewAddress = migratedKey ? deriveFromSecret(migratedKey).ethAddress : null;
  const matchedAccount = previewAddress && safeAddressChecked
    ? legacyAccountForWallet(knownAccounts, previewAddress, previewSafeAddress)
    : undefined;
  const targetProfileAddress = matchedAccount?.ethAddress ?? previewSafeAddress;
  const profileMatchFailed =
    !!previewAddress && safeAddressChecked && knownAccounts.length > 0 && !matchedAccount;
  const sameAsCurrent =
    !!targetProfileAddress &&
    !!walletAddress &&
    targetProfileAddress.toLowerCase() === walletAddress.toLowerCase();

  useEffect(() => {
    setPreviewSafeAddress(null);
    setSafeAddressChecked(false);
    if (!previewAddress) return;
    let cancelled = false;
    predictSafeAddress(previewAddress)
      .then((address) => {
        if (!cancelled) setPreviewSafeAddress(address);
      })
      .finally(() => {
        if (!cancelled) setSafeAddressChecked(true);
      });
    return () => { cancelled = true; };
  }, [previewAddress]);

  const handleLegacyLogin = async (provider: 'google' | 'twitter' | 'discord' | 'apple' | 'email_passwordless') => {
    setError(null);
    if (provider === 'email_passwordless' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(migrateEmail)) {
      setError('Enter the email you used on that old account');
      return;
    }
    setMigrateBusy(provider);
    try {
      const { startLegacyMigration } = await import('@/lib/legacy-web3auth');
      const key = await startLegacyMigration(provider, provider === 'email_passwordless' ? migrateEmail : undefined);
      deriveFromSecret(key);
      setMigratedKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retrieve that old wallet. Please try again.');
    } finally {
      setMigrateBusy(null);
    }
  };

  const handleSwitch = async () => {
    if (!migratedKey) return;
    setError(null);
    if (profileMatchFailed || !targetProfileAddress) {
      setError('This login did not recover either profile shown. Nothing was changed.');
      return;
    }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      // Same wording as the meter above the field — see WalletCreateStep.
      if (!assessment.acceptable) { setError(assessment.warnings[0] ?? 'Choose a stronger password'); return; }
      await switchActiveWallet(migratedKey, password, targetProfileAddress);
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch wallet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent column className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">{_copy("copy.90b92c105ff2", { defaultValue: "Switch to a different old account" })}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          {!migratedKey && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <p>{_copy("copy.ff3cc0ff8997", { defaultValue: "This replaces your active wallet. Export your current private key first if you want to keep access to it." })}</p>
              </div>
              {!knownAccountsChecked ? (
                <p className="text-white/60 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.8b3b208294c9", { defaultValue: " Loading your older profiles..." })}</p>
              ) : knownAccounts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-white/70 text-sm">{_copy("copy.cb75c6f3c889", { defaultValue: "We found " })}{knownAccounts.length}{_copy("copy.bd5a081ced3a", { defaultValue: " older profiles linked to this email. Different sign-ins could create separate profiles before login methods were linked." })}</p>
                <div className="space-y-1">
                  {knownAccounts.map((account, index) => (
                    <div key={account.ethAddress || index} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white">
                          {account.username ? `@${account.username}` : _copy("copy.63b6ac6dd6db", { defaultValue: "Older profile {{value1}}", value1: index + 1 })}
                        </span>
                        <span className="block text-white/50">
                          {account.signupMethod
                            ? _copy("copy.9a63b218711e", { defaultValue: "Original sign-in: {{value1}}", value1: OLD_LOGIN_LABELS[account.signupMethod] ?? account.signupMethod })
                            : _copy("copy.fd89fc8921b3", { defaultValue: "Original sign-in was not recorded" })}
                        </span>
                      </span>
                      {typeof account.badgeBalance === 'number' && (
                        <DhbAmount amount={account.badgeBalance.toLocaleString()} className="shrink-0 text-white/50" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              ) : (
                <p className="text-white/60 text-sm">{_copy("copy.088468b96b16", { defaultValue: "We could not load the profile list. Use the original sign-in that created the old profile." })}</p>
              )}
              <p className="text-white/60 text-sm">{_copy("copy.d0d03da52f24", { defaultValue: "Use the original sign-in for the profile you want. We verify its DeHub wallet before switching." })}</p>
              {migrateBusy && migrateBusy !== 'email_passwordless' ? (
                <p className="text-white/60 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.5cbe7783f7b1", { defaultValue: " Retrieving old wallet…" })}</p>
              ) : (
                <div className="space-y-2">
                  {(['google', 'apple', 'twitter', 'discord'] as const).map((p) => {
                    const known = accountFor(p);
                    return (
                      <Button
                        key={p}
                        variant="outline"
                        disabled={!!migrateBusy}
                        onClick={() => handleLegacyLogin(p)}
                        className={`w-full h-auto min-h-11 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10 flex items-center justify-between ${known ? 'ring-1 ring-green-400/50 bg-white/15' : ''}`}
                      >
                        <span className="flex items-center">
                          {migrateBusy === p ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          {known?.username ? _copy("copy.61d964ed9f7f", { defaultValue: "{{value1}} for @{{value2}}", value1: OLD_LOGIN_LABELS[p], value2: known.username }) : _copy("copy.1476d70d1ec7", { defaultValue: "Try {{value1}}", value1: OLD_LOGIN_LABELS[p] })}
                        </span>
                        {known && (
                          <span className="text-[10px] text-green-300 text-right">{_copy("copy.0d6346e060b4", { defaultValue: "Matched" })}</span>
                        )}
                      </Button>
                    );
                  })}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder={_copy("copy.aca3b4d885fe", { defaultValue: "Old account email" })}
                      value={migrateEmail}
                      onChange={(e) => setMigrateEmail(e.target.value)}
                      className={`${inputClass} h-11 flex-1 ${accountFor('email') || accountFor('email_passwordless') ? 'ring-1 ring-green-400/50' : ''}`}
                    />
                    <Button
                      variant="outline"
                      disabled={!!migrateBusy || !migrateEmail}
                      onClick={() => handleLegacyLogin('email_passwordless')}
                      className="h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10 shrink-0"
                    >
                      {migrateBusy === 'email_passwordless' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    </Button>
                  </div>
                  {accountFor('email_passwordless') && (
                    <p className="text-xs text-green-300 px-1">
                      {accountFor('email_passwordless')?.username
                        ? _copy("copy.5ec7bb337f2b", { defaultValue: "Email recovers @{{value1}}", value1: accountFor('email_passwordless')?.username })
                        : _copy("copy.57c2e5f0dc0f", { defaultValue: "Email recovers the matched profile" })}
                    </p>
                  )}
                </div>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </>
          )}

          {migratedKey && !safeAddressChecked && (
            <p className="text-white/60 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.40d4cc8bff03", { defaultValue: " Matching this wallet to your DeHub profile..." })}</p>
          )}

          {migratedKey && safeAddressChecked && profileMatchFailed && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                <p>{_copy("copy.7018324cc834", { defaultValue: "This login recovered a different wallet from the profiles shown above. Nothing was changed." })}</p>
              </div>
              <Button variant="ghost" onClick={() => setMigratedKey(null)} className="w-full">{_copy("copy.25b4eebad209", { defaultValue: "Try a different login" })}</Button>
            </div>
          )}

          {migratedKey && safeAddressChecked && !profileMatchFailed && sameAsCurrent && (
            <>
              <p className="text-white/70 text-sm">{_copy("copy.3c5519c538a6", { defaultValue: "This profile is already active. There is nothing to switch." })}</p>
              <Button onClick={() => close(false)} className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl">{_copy("copy.7d9eb7acb13e", { defaultValue: "Close" })}</Button>
            </>
          )}

          {migratedKey && safeAddressChecked && !profileMatchFailed && !sameAsCurrent && targetProfileAddress && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white space-y-1">
                <p className="text-white/50">{_copy("copy.e0012e751b11", { defaultValue: "Current active wallet" })}</p>
                <p className="break-all">{walletAddress}</p>
                <p className="text-white/50 pt-2">{_copy("copy.7c1b59f63339", { defaultValue: "Will switch to " })}{matchedAccount?.username ? `@${matchedAccount.username}` : _copy("copy.9b0822fb624d", { defaultValue: "recovered profile" })}
                </p>
                <p className="break-all text-green-300">{targetProfileAddress}</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-white">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                <span>{_copy("copy.de3d1f7155f6", { defaultValue: "I've exported my current wallet's private key (or don't need it)" })}</span>
              </label>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder={_copy("copy.064656b93bd0", { defaultValue: "New wallet password (min {{value1}} chars)", value1: MIN_PASSWORD_LENGTH })}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
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
                onClick={handleSwitch}
                disabled={busy || !ack || !password || !confirm}
                className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.8c7583c6d77d", { defaultValue: " Switching…" })}</span> : _copy("copy.b7af0b97837b", { defaultValue: "Switch wallet" })}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Settings entry points ───────────────────────────────────────────────────

export function WalletRecoveryTools() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { supabaseUserId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportOpen, setExportOpen] = useState(false);
  // null = unknown (still loading, or the lookup failed): show no badge.
  const [backedUpAt, setBackedUpAt] = useState<string | null | undefined>(undefined);

  const loadBackupStatus = useCallback(() => {
    if (!supabaseUserId) return;
    getBackupStatus(supabaseUserId).then((status) => setBackedUpAt(status ? status.backedUpAt : undefined));
  }, [supabaseUserId]);
  useEffect(loadBackupStatus, [loadBackupStatus]);

  // The wallet page's reminder links here with ?backup=1 to open the dialog.
  useEffect(() => {
    if (searchParams.get('backup') !== '1') return;
    setExportOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('backup');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [switchOpen, setSwitchOpen] = useState(false);
  // "Switch to a different old account" only matters — and only shows — for
  // the minority of users who genuinely have 2+ old Web3Auth-era accounts
  // under this email. Keeps the setting page uncluttered for everyone else.
  const [hasMultipleOldAccounts, setHasMultipleOldAccounts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkLegacyAccount().then((hint) => {
      if (!cancelled && hint.exists === true && (hint.accounts?.length ?? 0) > 1) {
        setHasMultipleOldAccounts(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <SettingsRow
        icon={<KeyRound />}
        title={<span className="inline-flex items-center gap-2">{_copy("copy.ef9ec257e675", { defaultValue: "Back up wallet" })}{backedUpAt === null && <span className="w-2 h-2 rounded-full bg-amber-400" aria-label={_copy("copy.67e716b9f541", { defaultValue: "Not backed up yet" })} />}
        </span>}
        description={<>
          {backedUpAt
            ? `${t('walletBackup.backedUpOn', { date: new Date(backedUpAt).toLocaleDateString() })}. ${t('walletBackup.backupDescription')}`
            : t('walletBackup.backupDescription')}
          {hasMultipleOldAccounts ? _copy("copy.e0de4ffb9e25", { defaultValue: " — required to keep access if you switch accounts below" }) : ''}
        </>}
        action={<Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl" onClick={() => setExportOpen(true)}>{_copy("copy.0054e707d5a9", { defaultValue: "Back up" })}</Button>}
      />
      {hasMultipleOldAccounts && (
      <SettingsRow
        icon={<Repeat />}
        title={_copy("copy.90b92c105ff2", { defaultValue: "Switch to a different old account" })}
        description={_copy("copy.e770a59d7d01", { defaultValue: "Had two old accounts (e.g. one via Google, one via email)? Swap which one is active" })}
        action={<Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl" onClick={() => setSwitchOpen(true)}>{_copy("copy.39921a740bf2", { defaultValue: "Switch" })}</Button>}
      />
      )}
      <BackUpWalletDialog open={exportOpen} onOpenChange={setExportOpen} onBackedUp={loadBackupStatus} />
      {hasMultipleOldAccounts && <SwitchOldAccountDialog open={switchOpen} onOpenChange={setSwitchOpen} />}
    </>
  );
}
