import { useState, useEffect } from 'react';

interface ProfileEmptyStateProps {
  iconSrc: string;
  iconAlt: string;
  title: string;
  subtitle: string;
  /** Extra opacity class for the icon (e.g. "opacity-90") */
  iconClassName?: string;
}

/**
 * Empty-state card for profile tabs.
 * Waits for the 3D icon image to fully load before rendering,
 * so switching tabs never flashes the previous tab's icon.
 */
export function ProfileEmptyState({ iconSrc, iconAlt, title, subtitle, iconClassName }: ProfileEmptyStateProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.src = iconSrc;
    if (img.complete) {
      setReady(true);
      return;
    }
    img.onload = () => setReady(true);
    img.onerror = () => setReady(true); // show anyway on error
  }, [iconSrc]);

  if (!ready) {
    // Return an invisible placeholder with the same height to avoid layout shift
    return <div className="py-12" style={{ minHeight: 160 }} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <img src={iconSrc} alt={iconAlt} className={`w-16 h-16 mb-3 ${iconClassName ?? ''}`} />
      <p className="text-muted-foreground text-lg font-medium">{title}</p>
      <p className="text-muted-foreground/70 text-sm mt-1">{subtitle}</p>
    </div>
  );
}
