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

/**
 * Is a vaul Root actually above us? False inside a dormant sheet, so
 * `DrawerContent` can withhold itself instead of portalling into nothing.
 *
 * The JSX walk below only ever sees the literal children written at the call
 * site, so it cannot know that a component renders a `DrawerContent` — and a
 * sheet body reached through a wrapper (`<Drawer><PPVDrawerContent /></Drawer>`)
 * used to survive `withoutContent`, render with no Root above it, and throw
 * "`DialogPortal` must be used within `Dialog`" out of vaul's Portal. That took
 * out the whole subtree: every video post page rendered its error boundary,
 * because the immersive creator bar mounts that sheet unconditionally.
 *
 * Guarding at `DrawerContent` closes the hole wherever the content is written,
 * literal or wrapped, rather than trying to spot the wrappers from outside.
 */
const DrawerRootMounted = React.createContext(false);

/**
 * vaul parts that only work inside a Root, because they read its context. If a
 * sheet puts any of these outside its `DrawerContent`, its Root has to stay
 * mounted; `DrawerContent` itself is exempt because a closed Root renders none
 * of it anyway.
 *
 * Only the literal children are walked, so a part reached through a wrapper
 * component still escapes this check — `DrawerContent` is safe either way via
 * `DrawerRootMounted`, the rest are written literally at every call site.
 */
const CONTEXT_BOUND_PARTS: ReadonlySet<unknown> = new Set([
  DrawerPrimitive.Trigger,
  DrawerPrimitive.Close,
  DrawerPrimitive.Title,
  DrawerPrimitive.Description,
  DrawerPrimitive.Portal,
  DrawerPrimitive.Overlay,
]);

/**
 * Can this sheet be left unmounted until it first opens? Only if nothing outside
 * its content needs the Root's context — most commonly a `DrawerTrigger`, which
 * is the sheet's own opener and would vanish with it. Walks the literal JSX
 * children (where every such part in this codebase is written), pruning at
 * `DrawerContent` since that subtree is withheld anyway.
 */
function isDeferrable(node: React.ReactNode, DrawerContentType: unknown): boolean {
  let ok = true;
  React.Children.forEach(node, (child) => {
    if (!ok || !React.isValidElement(child)) return;
    if (child.type === DrawerContentType) return;
    if (CONTEXT_BOUND_PARTS.has(child.type)) {
      ok = false;
      return;
    }
    const kids = (child.props as { children?: React.ReactNode } | null)?.children;
    if (kids && !isDeferrable(kids, DrawerContentType)) ok = false;
  });
  return ok;
}

/** The children a closed, dormant sheet still has to render: everything but the sheet body. */
function withoutContent(node: React.ReactNode, DrawerContentType: unknown): React.ReactNode {
  return React.Children.map(node, (child) =>
    React.isValidElement(child) && child.type === DrawerContentType ? null : child,
  );
}

/**
 * Every mounted vaul Root registers a `window` scroll listener for the lifetime
 * of the component — `usePositionFixed` does it with an empty dep array, so it
 * happens whether or not the sheet is open, and the handler reads
 * `window.scrollY` (a layout-flushing read) on every scroll event. It exists
 * only to restore position on iOS Safari; everywhere else it is pure cost.
 *
 * That cost is per sheet, and the feed mounts a handful of sheets per card:
 * 20 posts on screen meant 185 window scroll listeners, 40 posts meant 365, and
 * it kept climbing as the infinite feed grew — every one of them running on
 * every scroll frame. It was the largest single JS cost while scrolling the feed.
 *
 * So keep the Root out of the tree until a sheet first opens, rendering its
 * non-content children (openers and other markup) exactly as a closed Root
 * would. Mounting then happens in two steps — Root closed first, real `open` on
 * the next frame — because vaul renders an already-open Root at its final
 * position with no transition, and a sheet that teleports in instead of sliding
 * up would be a worse trade than the listener. Once live the Root stays mounted,
 * so this costs one frame on a sheet's first open and nothing afterwards.
 */
const Drawer = ({ shouldScaleBackground = false, modal = true, onOpenChange, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => {
  const canDeferRef = React.useRef<boolean | null>(null);
  if (canDeferRef.current === null) {
    canDeferRef.current =
      !props.open && !props.defaultOpen && isDeferrable(children, DrawerContent);
  }

  const [phase, setPhase] = React.useState<"dormant" | "mounting" | "live">(
    canDeferRef.current ? "dormant" : "live",
  );

  React.useEffect(() => {
    if (phase === "dormant" && props.open) setPhase("mounting");
  }, [phase, props.open]);

  React.useEffect(() => {
    if (phase !== "mounting") return;
    const raf = requestAnimationFrame(() => setPhase("live"));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase === "dormant") {
    // Explicitly false, not just the default: a dormant sheet nested inside a
    // live one would otherwise inherit the outer Root's `true`.
    return (
      <DrawerRootMounted.Provider value={false}>
        {withoutContent(children, DrawerContent)}
      </DrawerRootMounted.Provider>
    );
  }

  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      modal={modal}
      onOpenChange={(open) => {
        if (!open) lastDrawerDismissAt = Date.now();
        onOpenChange?.(open);
      }}
      {...props}
      open={phase === "mounting" ? false : props.open}
    >
      <DrawerRootMounted.Provider value={true}>
        {children}
      </DrawerRootMounted.Provider>
    </DrawerPrimitive.Root>
  );
};
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
>(({ className, children, glass = false, hideHandle = true, noOverlay = false, overlayClassName, ...props }, ref) => {
  const rootMounted = React.useContext(DrawerRootMounted);
  // No Root above us — this sheet is dormant (or the content escaped its
  // Drawer entirely). Render nothing rather than portalling into no Dialog.
  if (!rootMounted) return null;

  return (
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
  );
});
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
