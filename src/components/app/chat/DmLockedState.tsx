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
import { AppState } from '@/components/app/AppState';
import Lock from '@/components/ui/cut-icons/privacy';
import type { DmEncryptionStatus } from '@/hooks/use-dm-encryption';

interface DmLockedStateProps {
  status: DmEncryptionStatus;
  needsWalletConnection: boolean;
  peerName: string;
  onUnlock: () => void;
}

export function DmLockedState({ status, needsWalletConnection, peerName, onUnlock }: DmLockedStateProps) {
  const { t: tr } = useI18n();
  const busy = status === 'pending';

  const label = busy
    ? tr('messages.encryptionTurningOn', { defaultValue: 'Waiting for your wallet to turn on encryption…' })
    : needsWalletConnection
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
    <div data-dm-locked className="flex-1 min-h-0 flex flex-col">
      <AppState
        icon="messages"
        kind="restricted"
        size="page"
        title={tr('messages.lockedTitle', { defaultValue: 'Unlock to read your messages' })}
        description={body}
        primaryAction={{
          label,
          onClick: onUnlock,
          disabled: busy,
          loading: busy,
          icon: busy ? undefined : <Lock className="w-4 h-4 text-current" />,
        }}
        className="flex-1"
      />
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
