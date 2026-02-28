import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { variant?: "default" | "lava" }
>(({ className, variant = "default", ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/[0.08]">
      <SliderPrimitive.Range
        className={cn(
          "absolute h-full rounded-full",
          variant === "lava"
            ? "animate-lava-flow bg-[length:300%_100%]"
            : "bg-primary"
        )}
        style={variant === "lava" ? {
          backgroundImage: "linear-gradient(90deg, #a855f7, #ec4899, #f97316, #eab308, #22d3ee, #a855f7)",
        } : undefined}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className={cn(
      "block h-3.5 w-3.5 rounded-full border-2 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      variant === "lava" ? "border-white/40" : "border-primary"
    )} />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
