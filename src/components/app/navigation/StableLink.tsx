import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { stableNavigate } from '@/lib/client-navigate';

type StableLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Absolute in-app path, e.g. '/app/explore'. */
  to: string;
};

/**
 * An in-app link that does not re-render when the route changes.
 *
 * react-router's Link and NavLink read the current location (to resolve the
 * href and the active state), so every one of them re-renders on every
 * navigation. The app shell holds dozens; this keeps them still. Active state
 * comes from the caller, which already knows it. Modified clicks (new tab,
 * middle click) fall through to the browser like a normal link.
 */
export const StableLink = forwardRef<HTMLAnchorElement, StableLinkProps>(function StableLink(
  { to, onClick, target, ...rest },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    if (target && target !== '_self') return;
    e.preventDefault();
    stableNavigate(to);
  };
  return <a ref={ref} href={to} target={target} onClick={handleClick} {...rest} />;
});
