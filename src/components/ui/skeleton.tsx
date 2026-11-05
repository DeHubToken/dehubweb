import { useState } from "react";
import { cn } from "@/lib/utils";
import '@/styles/skeleton.css';

/** Length of the `.theme-skeleton` pulse in skeleton.css. */
const PULSE_MS = 2000;

/**
 * Every placeholder pulses on one shared beat. Each block used to start its
 * own 2 s cycle when it mounted, so a page that filled in over a few hundred
 * milliseconds blinked out of step. A negative delay set from the page clock
 * puts a late block at the same point in the cycle as the rest.
 */
function pulsePhase(): string {
  if (typeof performance === "undefined") return "0ms";
  return `${-Math.round(performance.now() % PULSE_MS)}ms`;
}

function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [delay] = useState(pulsePhase);
  return <div {...props} data-skeleton className={cn("theme-skeleton rounded-md", className)} style={{ animationDelay: delay, ...style }} />;
}

export { Skeleton };
