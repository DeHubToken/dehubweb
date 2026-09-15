/**
 * The Kids Mode PIN pad.
 *
 * One drawer, two jobs: set a PIN to arm Kids Mode, or enter it to leave.
 * Arming asks twice, because a PIN nobody can reproduce locks the device until
 * the parent finds their wallet — recoverable, but not on the tablet the child
 * is holding.
 *
 * Deliberately a numeric keypad rather than a text input. A PIN is digits, the
 * on-screen keyboard is the wrong shape for them, and `inputMode="numeric"` on
 * a phone still leaves the field selectable and pasteable in a drawer a child
 * is sitting in front of.
 *
 * @module components/app/settings/KidsModeDrawer
 */

import { useEffect, useState } from 'react';
import { Delete, Baby } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

const PIN_MIN = 4;
const PIN_MAX = 8;

type Stage = 'enter' | 'confirm';

interface KidsModeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'enable' sets a new PIN (asked twice); 'disable' checks the existing one. */
  mode: 'enable' | 'disable';
  /** Resolves on success; reject with an Error whose message is shown under the pad. */
  onSubmit: (pin: string) => Promise<unknown>;
  busy?: boolean;
}

export function KidsModeDrawer({ open, onOpenChange, mode, onSubmit, busy }: KidsModeDrawerProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [stage, setStage] = useState<Stage>('enter');
  const [error, setError] = useState<string | null>(null);

  // Reset every time it opens. A half-typed PIN surviving a close is the kind
  // of state that submits something nobody meant to submit.
  useEffect(() => {
    if (!open) return;
    setPin('');
    setFirstPin('');
    setStage('enter');
    setError(null);
  }, [open]);

  const press = (digit: string) => {
    setError(null);
    setPin(current => (current.length >= PIN_MAX ? current : current + digit));
  };

  const backspace = () => {
    setError(null);
    setPin(current => current.slice(0, -1));
  };

  const submit = async () => {
    if (pin.length < PIN_MIN) return;

    if (mode === 'enable' && stage === 'enter') {
      setFirstPin(pin);
      setPin('');
      setStage('confirm');
      return;
    }

    if (mode === 'enable' && pin !== firstPin) {
      setError(t('settings.kidsModePinMismatch', 'Those PINs are different. Start again.'));
      setPin('');
      setFirstPin('');
      setStage('enter');
      return;
    }

    try {
      await onSubmit(pin);
      onOpenChange(false);
    } catch (err: any) {
      // The server's own message, which says whether the PIN was wrong or the
      // pad is locked — two different things the parent needs to tell apart.
      setError(err?.message || t('settings.kidsModeFailed', 'That did not work. Try again.'));
      setPin('');
    }
  };

  const title =
    mode === 'disable'
      ? t('settings.kidsModeEnterPin', 'Enter your PIN')
      : stage === 'confirm'
        ? t('settings.kidsModeConfirmPin', 'Enter it again')
        : t('settings.kidsModeSetPin', 'Choose a PIN');

  const help =
    mode === 'disable'
      ? t('settings.kidsModeEnterPinHelp', 'This turns Kids Mode off on this device.')
      : stage === 'confirm'
        ? t('settings.kidsModeConfirmPinHelp', 'So you know you can reproduce it.')
        : t('settings.kidsModeSetPinHelp', '4 to 8 digits. You need it to turn Kids Mode off again.');

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[90vh] max-h-[90dvh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Baby className="w-4 h-4" />
            {title}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col items-center gap-5">
          <p className="text-sm text-white/60 text-center max-w-[36ch]">{help}</p>

          {/* Filled dots to PIN_MIN, then outlined ones for the optional digits,
              so the pad shows both "long enough yet" and "how much room is left". */}
          <div className="flex items-center gap-2.5" aria-live="polite">
            {Array.from({ length: PIN_MAX }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-colors',
                  i < pin.length ? 'bg-white' : i < PIN_MIN ? 'bg-white/20' : 'bg-white/10',
                )}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400 text-center max-w-[36ch]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="h-14 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xl font-medium transition-colors"
              >
                {digit}
              </button>
            ))}
            <span />
            <button
              type="button"
              onClick={() => press('0')}
              className="h-14 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xl font-medium transition-colors"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              aria-label={t('common.delete', 'Delete')}
              className="h-14 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center transition-colors"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pin.length < PIN_MIN || busy}
            className="w-full max-w-[260px] h-11 rounded-xl bg-white text-black font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {mode === 'disable'
              ? t('settings.kidsModeTurnOff', 'Turn Kids Mode off')
              : stage === 'confirm'
                ? t('settings.kidsModeTurnOn', 'Turn Kids Mode on')
                : t('common.continue', 'Continue')}
          </button>

          {mode === 'disable' && (
            <p className="text-xs text-white/40 text-center max-w-[36ch]">
              {t(
                'settings.kidsModeForgotPin',
                'Forgotten it? Sign in with your wallet on another device to turn Kids Mode off.',
              )}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
