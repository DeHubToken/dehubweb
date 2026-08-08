import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    /* Hooks so a theme owns the control instead of class-sniffing its way in.
       The thumb deliberately carries NO background utility: a theme's
       untagged-slab net is scoped under `#app-root`, so it outranks that
       theme's own `[data-switch-thumb]` rule on specificity and repaints the
       thumb in the panel's own material — leaving the switch showing no on/off
       state at all. Excluding the hook from each net only works until the next
       net is written; carrying no `bg-*` class at all makes the thumb
       unmatchable by every one of them, including future ones. Its colour
       comes from the `[data-switch-thumb]` base rule in `index.css`. */
    data-switch-track
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-lg border-2 border-transparent transition-colors data-[state=checked]:bg-white data-[state=unchecked]:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      data-switch-thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-lg shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
