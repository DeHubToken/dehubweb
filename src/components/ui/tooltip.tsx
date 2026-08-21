/**
 * DESIGN SYSTEM RULE: Always use this Tooltip component instead of the native
 * HTML `title` attribute. The `title` attribute creates ugly black browser tooltips.
 * This component provides our liquid glass styled tooltips.
 * 
 * Usage:
 * <Tooltip>
 *   <TooltipTrigger asChild><button>Hover me</button></TooltipTrigger>
 *   <TooltipContent>Tooltip text</TooltipContent>
 * </Tooltip>
 * 
 * NEVER use: title="Some tooltip" on elements
 */
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md px-2 py-1 text-[11px] font-medium leading-tight animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        // Matches the hover label NativeTitleTooltips draws for `title=`
        // attributes, so every tooltip in the app reads as one thing.
        "bg-zinc-800 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
