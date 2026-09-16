import React, { useEffect, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import { cn } from '@/lib/utils';

/**
 * The shared chrome for the voice and video call surfaces.
 *
 * A call now takes the whole viewport instead of a bottom drawer: the drawer
 * could be swiped away mid-call, and on a phone it left the controls floating
 * over a live page. What stays ours is the palette — no green accept and no red
 * hang-up anywhere, because the design system keeps both off every surface. The
 * one high-contrast control is the solid foreground fill, and which action gets
 * it depends on the screen: accept while ringing, end once the call is up.
 *
 * Round buttons are the single exception to our rounded-square button recipe,
 * and only here: an in-call control follows the platform's phone convention.
 * Avatars stay rounded squares.
 */

export function shortenAddress(address: string): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

export interface PeerIdentity {
  name: string;
  avatarUrl: string | null;
}

/**
 * Resolves the other side of a call to a username and avatar. The shortened
 * address stays as the fallback while the request is in flight and if it fails.
 */
export function usePeerIdentity(peerAddress: string): PeerIdentity {
  const [identity, setIdentity] = useState<PeerIdentity>({
    name: shortenAddress(peerAddress),
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    setIdentity({ name: shortenAddress(peerAddress), avatarUrl: null });
    if (!peerAddress) return;

    getAccountSummaries([peerAddress])
      .then(summaries => {
        if (cancelled) return;
        const summary = summaries[0];
        if (!summary) return;
        const name = summary.username
          ? `@${summary.username}`
          : summary.displayName || shortenAddress(peerAddress);
        setIdentity({ name, avatarUrl: summary.avatarImageUrl ?? null });
      })
      .catch(() => {
        /* the shortened address is a fine answer */
      });

    return () => {
      cancelled = true;
    };
  }, [peerAddress]);

  return identity;
}

export function CallSurface({
  children,
  onMinimize,
  minimizeLabel,
}: {
  children: React.ReactNode;
  onMinimize: () => void;
  minimizeLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-background">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, hsl(var(--muted)/0.55) 0%, hsl(var(--background)) 55%, hsl(var(--background)) 100%)',
        }}
      />
      <button
        type="button"
        onClick={onMinimize}
        aria-label={minimizeLabel}
        title={minimizeLabel}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function CallIdentity({
  kindIcon: KindIcon,
  kindLabel,
  name,
  status,
  avatarUrl,
}: {
  kindIcon: LucideIcon;
  kindLabel: string;
  name: string;
  status: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <KindIcon className="h-3.5 w-3.5" />
        <span>{kindLabel}</span>
      </div>
      <p className="max-w-[90vw] truncate text-3xl font-bold tracking-tight text-foreground">
        {name}
      </p>
      <p className="text-[15px] tabular-nums text-muted-foreground">{status}</p>
      <div className="mt-7 rounded-[20px] border border-border/60 bg-foreground/5 p-1">
        <Avatar className="h-28 w-28 rounded-2xl">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} className="rounded-2xl object-cover" /> : null}
          <AvatarFallback className="rounded-2xl text-2xl">
            {name.replace(/^@/, '').slice(0, 1).toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

/**
 * One round control with its label underneath. `active` inverts it to the solid
 * fill — the same treatment the primary action gets — so a muted mic reads at a
 * glance without reaching for a colour we do not have.
 */
export function CallControl({
  icon: Icon,
  label,
  onClick,
  active,
  primary,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
}) {
  const solid = primary || active;
  return (
    <div className="flex w-1/3 flex-col items-center gap-2.5 sm:w-auto sm:min-w-[92px]">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active ? true : undefined}
        className={cn(
          'flex h-[68px] w-[68px] items-center justify-center rounded-full transition-colors',
          solid
            ? 'bg-foreground text-background hover:bg-foreground/90'
            : 'border border-border/60 bg-foreground/10 text-foreground hover:bg-foreground/20',
        )}
      >
        <Icon className="h-6 w-6" />
      </button>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

/** The glass slab the controls sit in, welded to the bottom of the surface. */
export function CallControlPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-wrap items-start justify-center gap-y-5 rounded-[32px] border border-border/60 bg-foreground/[0.06] px-3 py-6 backdrop-blur-xl sm:gap-x-2">
        {children}
      </div>
    </div>
  );
}
