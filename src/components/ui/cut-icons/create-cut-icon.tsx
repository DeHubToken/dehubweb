import React from "react";
import type { LucideProps } from "lucide-react";

/** Each screen imports only the artwork it renders. */
export function createCutIcon(name: string, artwork: (props: { weight: number; maskId: string }) => React.ReactNode) {
  const Icon = React.forwardRef<SVGSVGElement, LucideProps>(({ size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, className, children, ...props }, ref) => {
    const maskId = React.useId().replace(/:/g, "");
    const weight = Number(strokeWidth) * (absoluteStrokeWidth ? 24 / Number(size) : 1);
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 32 32" fill="none" color={props.stroke ?? color} aria-hidden={props["aria-label"] || props["aria-labelledby"] ? undefined : true} className={`lucide cut-icon ${className ?? ""}`} {...props}>{artwork({ weight, maskId })}{children}</svg>;
  });
  Icon.displayName = name;
  return Icon;
}
