/**
 * Wallet recovery tools (Settings → Account Security):
 *  - Export Private Key: the supported backup path — we don't generate
 *    recovery phrases/codes for new wallets anymore.
 *  - Switch to a different old account: Supabase links Google/Email logins
 *    that share a verified email into ONE identity, so a person who had two
 *    separate old Web3Auth-era accounts (one per login method) can only
 *    ever have one of them "active" here. This lets them retrieve the OTHER
 *    old account's key and swap to it — self-service, no support/SQL needed.
 */
import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, Copy, KeyRound, Repeat, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { deriveFromSecret } from '@/lib/wallet-core/derive';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { copyThenClear } from '@/lib/wallet-core/clipboard';
import { PasswordStrengthMeter } from '@/components/app/wallet-setup/PasswordStrengthMeter';
import { checkLegacyAccount, type LegacyAccountMatch } from '@/lib/wallet-core/legacy-detect';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

// ── Export Private Key ──────────────────────────────────────────────────────

function ExportPrivateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { exportPrivateKey } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const reset = () => { setPassword(''); setError(null); setRevealedKey(null); setBusy(false); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = await exportPrivateKey(password);
      setRevealedKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">Export Private Key</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          {revealedKey ? (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                <p>Anyone with this key owns your funds. Save it somewhere safe and never share it.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white break-all select-all">
                {revealedKey}
              </div>
              <Button
                variant="outline"
                onClick={async () => { await copyThenClear(revealedKey); toast.success('Copied — clipboard clears in 30s'); }}
                className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10"
              >
                <Copy className="w-4 h-4 mr-2" /> Copy private key
              </Button>
              <Button onClick={() => close(false)} className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl">
                Done
              </Button>
            </>
          ) : (
            <>
              <p className="text-white/60 text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 shrink-0" />
                Enter your wallet password to reveal your private key.
              </p>
              <Input
                type="password"
                placeholder="Wallet password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoFocus
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                onClick={handleExport}
                disabled={busy || !password}
                className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Decrypting…</span> : 'Reveal private key'}
              </Button>
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
  const { switchActiveWallet, walletAddress } = useAuth();
  const [migratedKey, setMigratedKey] = useState<string | null>(null);
  const [migrateEmail, setMigrateEmail] = useState('');
  const [migrateBusy, setMigrateBusy] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownAccounts, setKnownAccounts] = useState<LegacyAccountMatch[]>([]);

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
    });
    return () => { cancelled = true; };
  }, [open]);

  const accountFor = (provider: string) => knownAccounts.find((a) => a.signupMethod === provider);

  const reset = () => {
    setMigratedKey(null); setMigrateEmail(''); setMigrateBusy(null);
    setPassword(''); setConfirm(''); setAck(false); setBusy(false); setError(null);
    setKnownAccounts([]);
  };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const previewAddress = migratedKey ? deriveFromSecret(migratedKey).ethAddress : null;
  const sameAsCurrent = !!previewAddress && !!walletAddress && previewAddress.toLowerCase() === walletAddress.toLowerCase();

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
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      if (!assessment.longEnough) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return; }
      if (!assessment.acceptable) { setError('Choose a stronger password'); return; }
      await switchActiveWallet(migratedKey, password);
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch wallet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">Switch to a different old account</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          {!migratedKey && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <p>This replaces your active wallet. Export your current private key first if you want to keep access to it.</p>
              </div>
              <p className="text-white/60 text-sm">Sign in with the OLD login for the account you want to switch to:</p>
              {migrateBusy && migrateBusy !== 'email_passwordless' ? (
                <p className="text-white/60 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Retrieving old wallet…</p>
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
                          Old account: {OLD_LOGIN_LABELS[p]}
                        </span>
                        {known && (
                          <span className="text-[10px] text-green-300 text-right">
                            {known.username ? `@${known.username}` : ''}
                            {typeof known.badgeBalance === 'number' ? ` · ${known.badgeBalance.toLocaleString()} DHB` : ''}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Old account email"
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
                  {(() => {
                    const emailAcc = accountFor('email') ?? accountFor('email_passwordless');
                    return emailAcc ? (
                      <p className="text-[10px] text-green-300 px-1">
                        {emailAcc.username ? `@${emailAcc.username}` : ''}
                        {typeof emailAcc.badgeBalance === 'number' ? ` · ${emailAcc.badgeBalance.toLocaleString()} DHB` : ''}
                      </p>
                    ) : null;
                  })()}
                </div>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </>
          )}

          {migratedKey && sameAsCurrent && (
            <>
              <p className="text-white/70 text-sm">This is already your active wallet — nothing to switch.</p>
              <Button onClick={() => close(false)} className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl">
                Close
              </Button>
            </>
          )}

          {migratedKey && !sameAsCurrent && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white space-y-1">
                <p className="text-white/50">Current active wallet</p>
                <p className="break-all">{walletAddress}</p>
                <p className="text-white/50 pt-2">Will switch to</p>
                <p className="break-all text-green-300">{previewAddress}</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-white">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                <span>I've exported my current wallet's private key (or don't need it)</span>
              </label>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder={`New wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
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
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                onClick={handleSwitch}
                disabled={busy || !ack || !password || !confirm}
                className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Switching…</span> : 'Switch wallet'}
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
  const [exportOpen, setExportOpen] = useState(false);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KeyRound className="w-5 h-5 text-zinc-500" />
          <div>
            <p className="text-white font-medium">Export Private Key</p>
            <p className="text-zinc-500 text-sm">Back up your wallet{hasMultipleOldAccounts ? ' — required to keep access if you switch accounts below' : ''}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md" onClick={() => setExportOpen(true)}>
          Export
        </Button>
      </div>
      {hasMultipleOldAccounts && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Repeat className="w-5 h-5 text-zinc-500" />
          <div>
            <p className="text-white font-medium">Switch to a different old account</p>
            <p className="text-zinc-500 text-sm">Had two old accounts (e.g. one via Google, one via email)? Swap which one is active</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md" onClick={() => setSwitchOpen(true)}>
          Switch
        </Button>
      </div>
      )}
      <ExportPrivateKeyDialog open={exportOpen} onOpenChange={setExportOpen} />
      {hasMultipleOldAccounts && <SwitchOldAccountDialog open={switchOpen} onOpenChange={setSwitchOpen} />}
    </>
  );
}
