import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-lg", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, loading, decoding, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full rounded-lg", className)}
    /* Lazy + async by default. A signed-out load of dehub.io in Aug 2026 had
       180 <img> elements, 73 of them offscreen AND eagerly fetched — mostly
       avatars, because Radix forwards to a bare <img> whose default is
       `loading="auto"`. Every one of those competes with the LCP element for
       connections on the same origin. Defaults, not hard-codes: the header
       avatar and anything else above the fold can still pass loading="eager",
       and an in-viewport lazy image is fetched immediately anyway, so this is
       inert for avatars that are actually visible. */
    loading={loading ?? "lazy"}
    decoding={decoding ?? "async"}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    /* Initials tile. Callers pass their own `bg-zinc-700`-family fill, which no
       theme's class net reaches (they all stop at zinc-800), so this is the
       only place a theme can recolour the one element in a post header that
       would otherwise stay a flat opaque grey square. */
    data-avatar-fallback
    className={cn("flex h-full w-full items-center justify-center rounded-lg bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
