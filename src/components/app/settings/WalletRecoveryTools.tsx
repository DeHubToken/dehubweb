import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Wallet recovery tools (Settings → Account Security):
 *  - Back up wallet: after a fresh unlock, the wallet's 12 words (when it was
 *    made from them) and, under Advanced, its private key.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, KeyRound, Fingerprint } from "lucide-react";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { getWalletProtection } from '@/lib/wallet-core/protection';
import { PasskeyCancelledError } from '@/lib/wallet-core/biometric-unlock';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
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
      setError(err instanceof Error ? err.message : _copy("copy.a7d4175ad6b1", { defaultValue: "Failed to export key" }));
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

  return (
    <>
      <SettingsRow
        icon={<KeyRound />}
        title={<span className="inline-flex items-center gap-2">{_copy("copy.ef9ec257e675", { defaultValue: "Back up wallet" })}{backedUpAt === null && <span className="w-2 h-2 rounded-full bg-amber-400" aria-label={_copy("copy.67e716b9f541", { defaultValue: "Not backed up yet" })} />}
        </span>}
        description={backedUpAt
          ? `${t('walletBackup.backedUpOn', { date: new Date(backedUpAt).toLocaleDateString() })}. ${t('walletBackup.backupDescription')}`
          : t('walletBackup.backupDescription')}
        action={<Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl" onClick={() => setExportOpen(true)}>{_copy("copy.0054e707d5a9", { defaultValue: "Back up" })}</Button>}
      />
      <BackUpWalletDialog open={exportOpen} onOpenChange={setExportOpen} onBackedUp={loadBackupStatus} />
    </>
  );
}
