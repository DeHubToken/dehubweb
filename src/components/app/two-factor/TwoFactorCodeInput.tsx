import { OTPInput, type SlotProps } from 'input-otp';

import { cn } from '@/lib/utils';

interface TwoFactorCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires once the sixth digit lands, so the reader never has to press a button. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * Six boxes for an authenticator code. One real input underneath (input-otp),
 * so paste, SMS/password-manager autofill and the phone's number pad all work.
 */
export function TwoFactorCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: TwoFactorCodeInputProps) {
  return (
    <OTPInput
      value={value}
      onChange={(next) => onChange(next.replace(/\D/g, ''))}
      onComplete={onComplete}
      maxLength={6}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="^[0-9]*$"
      disabled={disabled}
      autoFocus={autoFocus}
      // The real input sits on top, see-through. Themes that recolour every
      // <input> must not paint its digits over the boxes.
      className="!text-transparent !caret-transparent !bg-transparent !border-0 !shadow-none [-webkit-text-fill-color:transparent] selection:bg-transparent"
      containerClassName={cn('flex items-center justify-center gap-2', invalid && 'animate-[two-factor-shake_0.32s_ease-in-out]')}
      render={({ slots }) => (
        <>
          <div className="flex gap-2">{slots.slice(0, 3).map((slot, i) => <Slot key={i} {...slot} invalid={invalid} />)}</div>
          <span className="h-px w-3 bg-white/25" aria-hidden />
          <div className="flex gap-2">{slots.slice(3).map((slot, i) => <Slot key={i} {...slot} invalid={invalid} />)}</div>
        </>
      )}
    />
  );
}

function Slot({ char, isActive, hasFakeCaret, invalid }: SlotProps & { invalid?: boolean }) {
  return (
    <div
      data-two-factor-slot
      className={cn(
        'relative grid h-14 w-11 place-items-center rounded-xl border bg-white/10 text-2xl font-semibold tabular-nums text-white transition-colors',
        invalid ? 'border-red-400/70' : isActive ? 'border-white/70 ring-2 ring-white/20' : 'border-white/10',
      )}
    >
      {char}
      {hasFakeCaret && <span className="absolute h-6 w-px animate-pulse bg-white" aria-hidden />}
    </div>
  );
}
