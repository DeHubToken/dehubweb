import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { LiquidGlassBubble } from "./liquid-glass-bubble";

export interface LiquidGlassBubble2Props {
  /** Button label */
  label: string;
  /** Icon to display next to label */
  icon?: React.ReactNode;
  /** Loading state — shows spinner and optional loading label */
  loading?: boolean;
  /** Label to show while loading (defaults to label) */
  loadingLabel?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Fixed width (default: 110px) */
  width?: string;
  /** Fixed height (default: 42px) */
  height?: string;
  /** Additional className */
  className?: string;
}

/**
 * LiquidGlassBubble2 — Action button variant
 *
 * A liquid glass button with built-in loading/disabled states.
 * Used for primary actions like Deposit, Withdraw, Claim.
 *
 * @example
 * ```tsx
 * <LiquidGlassBubble2
 *   label="Deposit"
 *   icon={<ArrowDownToLine className="w-4 h-4" />}
 *   loading={isDepositing}
 *   loadingLabel="Depositing..."
 *   disabled={!amount}
 *   onClick={handleDeposit}
 * />
 * ```
 */
const LiquidGlassBubble2 = React.forwardRef<HTMLDivElement, LiquidGlassBubble2Props>(
  ({ label, icon, loading, loadingLabel, disabled, onClick, width = "110px", height = "42px", className }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <LiquidGlassBubble
        ref={ref}
        shimmer
        noBorder
        onClick={isDisabled ? undefined : onClick}
        className={cn(
          "flex-shrink-0 cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl",
          isDisabled && "opacity-40 cursor-not-allowed",
          className
        )}
        style={{ width, height }}
      >
        <span className="flex items-center justify-center gap-2 text-white text-sm font-medium h-full">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingLabel || label}
            </>
          ) : (
            <>
              {icon}
              {label}
            </>
          )}
        </span>
      </LiquidGlassBubble>
    );
  }
);

LiquidGlassBubble2.displayName = "LiquidGlassBubble2";

export { LiquidGlassBubble2 };
