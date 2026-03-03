import * as React from "react";
import { cn } from "@/lib/utils";
import { ShimmerHoverEffect } from "./shimmer-hover-effect";

export interface LiquidGlassBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Chat tail direction: 'right' for user messages, 'left' for others, 'none' for no tail */
  tail?: 'left' | 'right' | 'none';
  /** Enable hover shimmer effect */
  shimmer?: boolean;
  /** Hide the border */
  noBorder?: boolean;
  /** Children content */
  children: React.ReactNode;
}

/**
 * Liquid Glass Bubble Component
 * 
 * A reusable frosted glass bubble effect for chat messages and cards.
 * Features gradient backgrounds, backdrop blur, and optional shimmer on hover.
 * 
 * @example
 * ```tsx
 * <LiquidGlassBubble tail="right" shimmer>
 *   <p>Hello world</p>
 * </LiquidGlassBubble>
 * ```
 */
const LiquidGlassBubble = React.forwardRef<HTMLDivElement, LiquidGlassBubbleProps>(
  ({ className, tail = 'none', shimmer = true, noBorder = false, children, ...props }, ref) => {
    const tailClasses = {
      left: 'rounded-2xl rounded-bl-md',
      right: 'rounded-2xl rounded-br-md',
      none: 'rounded-2xl'
    };

    return (
      <div ref={ref} className={cn("relative group", className)} {...props}>
        {/* Main liquid glass bubble */}
        <div 
          className={cn(
            "relative px-4 py-2.5 overflow-hidden",
            tailClasses[tail],
            // Gradient background
            "bg-gradient-to-br from-white/20 via-white/10 to-white/5",
            // Backdrop blur effect
            "backdrop-blur-xl",
            // Border
            noBorder ? "" : "border border-white/30",
            // Complex shadow for depth
            noBorder
              ? "shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
              : "shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
            // Top shine overlay (before pseudo-element styles)
            "before:absolute before:inset-0",
            tail === 'left' ? "before:rounded-2xl before:rounded-bl-md" : 
            tail === 'right' ? "before:rounded-2xl before:rounded-br-md" : "before:rounded-2xl",
            "before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-transparent",
            "before:pointer-events-none",
            // Inner glow (after pseudo-element styles)
            "after:absolute after:inset-[1px]",
            tail === 'left' ? "after:rounded-2xl after:rounded-bl-md" : 
            tail === 'right' ? "after:rounded-2xl after:rounded-br-md" : "after:rounded-2xl",
            "after:bg-gradient-to-b after:from-white/5 after:to-transparent",
            "after:pointer-events-none"
          )}
        >
          {/* Shimmer effect on hover */}
          {shimmer && (
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500
                bg-gradient-to-r from-transparent via-white/10 to-transparent
                -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" 
            />
          )}
          
          {/* Content */}
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </div>
    );
  }
);

LiquidGlassBubble.displayName = "LiquidGlassBubble";

export { LiquidGlassBubble };
