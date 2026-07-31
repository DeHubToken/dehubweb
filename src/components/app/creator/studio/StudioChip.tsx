/**
 * Composer setting chips.
 * =======================
 * The horizontally scrolling rail under the prompt box. Each chip shows its
 * current value and opens a popover to change it, so every setting stays one
 * tap away instead of hiding behind a settings screen.
 *
 * Shape rule for the studio: chips and pills are fully rounded, controls are
 * rounded-xl, panels are rounded-2xl.
 */
import { useCallback, useState } from 'react';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';

// Matches the liquid-glass button spec at the top of src/index.css:
// bg-white/10 + backdrop-blur-xl + border-white/20, hover to /20 and /40.
const CHIP_BASE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white/85 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Second line inside the popover row. */
  detail?: string;
  /** Right-aligned metadata, typically a price. */
  meta?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface SelectChipProps<T extends string> {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
  /** Shown instead of the raw value on the chip face. */
  display?: string;
  disabled?: boolean;
  /** Popover width. Model lists need more room than aspect ratios. */
  width?: 'sm' | 'md';
}

export function SelectChip<T extends string>({
  label,
  value,
  options,
  onChange,
  display,
  disabled,
  width = 'sm',
}: SelectChipProps<T>) {
  const current = options.find((o) => o.value === value);

  // Controlled so the popover can be closed from outside. Radix portals it to
  // document.body, where the co-mounted host's `display: none` cannot reach it.
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnSurfaceSwitch(close);
  const epoch = useSurfaceEpoch();

  return (
    <Popover key={epoch} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={CHIP_BASE} disabled={disabled} aria-label={`${label}: ${current?.label ?? value}`}>
          <span className="max-w-[9rem] truncate">{display ?? current?.label ?? value}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          'max-h-[min(22rem,60vh)] overflow-y-auto rounded-2xl border-white/10 bg-zinc-950/95 p-1.5 text-white shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl',
          width === 'md' ? 'w-80' : 'w-56',
        )}
      >
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {label}
        </p>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
              option.disabled
                ? 'cursor-not-allowed opacity-35'
                : 'hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none',
              option.value === value && !option.disabled && 'bg-white/[0.08]',
            )}
          >
            <Check
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                option.value === value ? 'text-white' : 'text-transparent',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{option.label}</span>
              {(option.disabled && option.disabledReason ? option.disabledReason : option.detail) && (
                <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                  {option.disabled && option.disabledReason ? option.disabledReason : option.detail}
                </span>
              )}
            </span>
            {option.meta && (
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-white/50">{option.meta}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface CounterChipProps {
  /** Plural unit shown beside the number, e.g. "images". */
  label: string;
  /** Singular form, used when the value is 1. Defaults to `label`. */
  singular?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function CounterChip({
  label,
  singular,
  value,
  min,
  max,
  onChange,
  disabled,
}: CounterChipProps) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  const unit = value === 1 ? (singular ?? label) : label;

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/20 bg-white/10 px-1 py-0.5 backdrop-blur-xl',
        disabled && 'opacity-40',
      )}
      role="group"
      aria-label={`${label}: ${value}`}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[3.75rem] select-none text-center text-[13px] font-medium tabular-nums text-white/85">
        {value}
        <span className="ml-1 text-[11px] text-white/40">{unit}</span>
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
        className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface ToggleChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export function ToggleChip({ label, active, onClick, icon: Icon, disabled }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(CHIP_BASE, active && 'border-white/40 bg-white/20 text-white')}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
