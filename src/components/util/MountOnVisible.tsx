import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * MountOnVisible
 * Renders `placeholder` (or a min-height spacer) until the wrapper scrolls
 * near the viewport, then mounts `children`. Children stay mounted afterwards.
 */
export function MountOnVisible({
  children,
  placeholder,
  minHeight = 400,
  rootMargin = '600px',
  className,
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className} style={visible ? undefined : { minHeight }}>
      {visible ? children : placeholder ?? null}
    </div>
  );
}
