/**
 * Wallet unlock flow (embedded in the LoginModal drawer).
 * Decrypts the stored seed with the wallet password (Argon2id + AES-GCM,
 * all client-side) and hands the derived key to the auth provider.
 * Includes the recovery-code reset path for forgotten passwords.
 */
import { useState } from 'react';
import { Loader2, KeyRound, AlertTriangle, Copy } from 'lucide-react';
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
import { fetchWallet, getCachedWallet, fetchRecoveryPayload, saveWallet } from '@/lib/wallet-core/store';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

interface WalletUnlockStepProps {
  userId: string;
  onComplete: (privKeyHex: string) => Promise<void>;
}

type Phase = 'unlock' | 'recover' | 'recover-new-code';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

export function WalletUnlockStep({ userId, onComplete }: WalletUnlockStepProps) {
  const [phase, setPhase] = useState<Phase>('unlock');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recovery flow state
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [newCodeAck, setNewCodeAck] = useState(false);
  const [pendingPrivKey, setPendingPrivKey] = useState<string | null>(null);

  const loadWallet = async () => {
    try {
      const fresh = await fetchWallet(userId);
      if (fresh) return fresh;
    } catch {
      // Network hiccup — fall back to the local encrypted cache
    }
    const cached = getCachedWallet();
    if (cached) return cached;
    throw new Error('No wallet found for this account.');
  };

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const wallet = await loadWallet();
      const secret = await decryptString(wallet.payload, password);
      const derived = deriveFromSecret(secret);
      if (wallet.ethAddress && derived.ethAddress.toLowerCase() !== wallet.ethAddress.toLowerCase()) {
        console.warn('[WalletUnlock] Derived address differs from stored address', {
          derived: derived.ethAddress, stored: wallet.ethAddress,
        });
      }
      await onComplete(derived.ethPrivateKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
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

  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm flex items-center gap-2">
        <KeyRound className="w-4 h-4 shrink-0" />
        Enter your wallet password to unlock your wallet and sign in.
      </p>
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
          autoFocus
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button
          type="submit"
          disabled={busy || !password}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</span> : 'Unlock wallet'}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => { setPhase('recover'); setError(null); }}
        className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Forgot password? Use recovery code
      </button>
    </div>
  );
}
