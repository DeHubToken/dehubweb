import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";
import { OverlayOpenTracker } from "@/lib/overlay-open";

// Shared guard against the vaul "ghost click": dismissing a sheet — tapping the
// scrim, or an outside tap on a non-modal drawer — fires a synthesized click on
// whatever sits beneath once the sheet unmounts. On a feed card that click lands
// on the card root and navigates to the post the user was only trying to dismiss
// past. Every Drawer stamps the moment it closes here; feed cards check
// wasDrawerJustDismissed() before navigating.
let lastDrawerDismissAt = 0;
export function wasDrawerJustDismissed(withinMs = 400) {
  return Date.now() - lastDrawerDismissAt < withinMs;
}

const Drawer = ({ shouldScaleBackground = false, modal = true, onOpenChange, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    modal={modal}
    onOpenChange={(open) => {
      if (!open) lastDrawerDismissAt = Date.now();
      onOpenChange?.(open);
    }}
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay 
    ref={ref} 
    className={cn("fixed inset-0 z-[100] bg-black/80", className)} 
    {...props} 
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & { glass?: boolean; hideHandle?: boolean; noOverlay?: boolean; overlayClassName?: string }
>(({ className, children, glass = false, hideHandle = true, noOverlay = false, overlayClassName, ...props }, ref) => (
  <DrawerPortal>
    {/* Registers this sheet in the global overlay count while open, so the
        sticky feed navs / mobile header get out of the way (lib/overlay-open). */}
    <OverlayOpenTracker />
    {!noOverlay && <DrawerOverlay className={cn(glass ? "bg-black/20 backdrop-blur-md" : undefined, overlayClassName)} />}
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[100] mt-24 flex h-auto flex-col rounded-t-[20px]",
        glass 
          ? "bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl" 
          : "border bg-background",
        "focus:outline-none focus-visible:outline-none",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {!hideHandle && (
        <div className={cn(
          "mx-auto mt-3 mb-2 h-1 w-10 rounded-full shrink-0",
          glass ? "bg-white/40" : "bg-muted"
        )} />
      )}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
