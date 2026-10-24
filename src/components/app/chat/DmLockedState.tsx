/**
 * DmLockedState — the whole thread, as one screen, while this device can't
 * open it.
 *
 * Without a key every encrypted line used to render its own "can't be opened
 * on this device" pill, so a locked wallet turned a chat into a column of the
 * same error. This replaces the list (and the composer, since anything typed
 * now would go out in the clear) with one place to unlock from.
 */
import { useTranslation as useI18n } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Lock from '@/components/ui/cut-icons/privacy';
import type { DmEncryptionStatus } from '@/hooks/use-dm-encryption';

interface DmLockedStateProps {
  status: DmEncryptionStatus;
  needsWalletConnection: boolean;
  peerName: string;
  peerAvatarUrl?: string;
  onUnlock: () => void;
}

export function DmLockedState({ status, needsWalletConnection, peerName, peerAvatarUrl, onUnlock }: DmLockedStateProps) {
  const { t: tr } = useI18n();
  const busy = status === 'pending';

  const label = needsWalletConnection
    ? tr('messages.encryptionReconnectWallet', { defaultValue: 'Reconnect wallet' })
    : status === 'error'
      ? tr('messages.lockedTryAgain', { defaultValue: 'Try again' })
      : tr('messages.lockedUnlock', { defaultValue: 'Unlock wallet' });

  const body = status === 'error'
    ? tr('messages.encryptionSetupFailed', { defaultValue: 'Encryption setup failed. Please try again.' })
    : needsWalletConnection
      ? tr('messages.encryptionReconnect', { defaultValue: 'Reconnect your wallet to turn on encryption.' })
      : tr('messages.lockedBody', {
          name: peerName,
          defaultValue: 'Your chat with {{name}} is end-to-end encrypted. Unlock your wallet on this device to open it.',
        });

  return (
    <div
      data-dm-locked
      role="status"
      aria-live="polite"
      className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3 px-6 py-10"
    >
      <div className="relative w-[78px] h-16 mb-1">
        <Avatar className="absolute left-0 top-0 w-14 h-14">
          {peerAvatarUrl && <AvatarImage src={peerAvatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white font-medium">
            {peerName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          data-dm-locked-badge
          className="absolute right-0 bottom-0 w-9 h-9 rounded-full grid place-items-center bg-white text-black shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
        >
          <Lock className="w-4 h-4 text-current" />
        </span>
      </div>
      <p className="text-lg font-semibold text-white text-balance max-w-xs">
        {tr('messages.lockedTitle', { defaultValue: 'Unlock to read your messages' })}
      </p>
      <p className="text-sm text-zinc-400 max-w-xs">{body}</p>
      <Button type="button" variant="glass" className="mt-2 rounded-full px-6" onClick={onUnlock} disabled={busy} loading={busy}>
        {!busy && <Lock className="w-4 h-4 text-current" />}
        {busy
          ? tr('messages.encryptionTurningOn', { defaultValue: 'Waiting for your wallet to turn on encryption…' })
          : label}
      </Button>
      <span className="mt-1 text-xs text-zinc-500 rounded-full border border-white/10 px-3 py-1">
        {tr('messages.lockedPrivate', { defaultValue: 'Only you can read them' })}
      </span>
    </div>
  );
}

/** One quiet line standing in for a run of lines encrypted for another device. */
export function DmUndecryptableRun({ count }: { count: number }) {
  const { t: tr } = useI18n();
  return (
    <div data-dm-undecryptable-run className="flex items-center gap-2 my-3 text-xs text-zinc-500">
      <span className="flex-1 h-px bg-white/10" />
      <Lock className="w-3 h-3 flex-shrink-0 text-current" />
      <span>{tr('messages.undecryptableRun', { count, defaultValue: "{{count}} messages can't be opened on this device" })}</span>
      <span className="flex-1 h-px bg-white/10" />
    </div>
  );
}
