import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { variant?: "default" | "lava" }
>(({
  className,
  variant = "default",
  // The accessible name belongs on the Thumb — that is the element carrying
  // role="slider" — and Radix does not pass it down from the Root. Every
  // caller put `aria-label` on <Slider>, so every slider in the app announced
  // as unnamed (the two on the signed-out home in the 2026-09-02 Lighthouse
  // run). Lift the three naming attributes off the Root and hand them to the
  // Thumb; everything else still spreads onto the Root as before.
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-valuetext": ariaValueText,
  ...props
}, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center py-2 cursor-pointer", className)}
    {...props}
  >
    <SliderPrimitive.Track data-slider-track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/[0.08] before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']">
      <SliderPrimitive.Range
        data-slider-range
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
    <SliderPrimitive.Thumb data-slider-thumb aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-valuetext={ariaValueText} className={cn(
      "block h-3.5 w-3.5 rounded-full border-2 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      variant === "lava" ? "border-white/40" : "border-primary"
    )} />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
