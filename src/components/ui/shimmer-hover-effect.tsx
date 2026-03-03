import * as React from "react";
import { cn } from "@/lib/utils";

export interface ShimmerHoverEffectProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Opacity of the shimmer streak (0–1 scale mapped to Tailwind) */
  intensity?: "subtle" | "normal" | "strong";
  /** Duration of the sweep in ms */
  duration?: number;
}

/**
 * ShimmerHoverEffect
 * ==================
 * A light-streak sweep overlay that activates on the nearest `group` hover.
 * Drop it inside any `group` container to add a glass-reflection shimmer.
 *
 * @example
 * ```tsx
 * <div className="relative group">
 *   <ShimmerHoverEffect />
 *   <p>Content</p>
 * </div>
 * ```
 */
const ShimmerHoverEffect = React.forwardRef<HTMLDivElement, ShimmerHoverEffectProps>(
  ({ className, intensity = "normal", duration = 1000, ...props }, ref) => {
    const intensityClass = {
      subtle: "via-white/5",
      normal: "via-white/10",
      strong: "via-white/20",
    }[intensity];

    return (
      <div
        ref={ref}
        className={cn(
          "absolute inset-0 pointer-events-none",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          `bg-gradient-to-r from-transparent ${intensityClass} to-transparent`,
          "-translate-x-full group-hover:translate-x-full",
          className,
        )}
        style={{ transitionProperty: "opacity, transform", transitionDuration: `500ms, ${duration}ms` }}
        {...props}
      />
    );
  },
);

ShimmerHoverEffect.displayName = "ShimmerHoverEffect";

export { ShimmerHoverEffect };
