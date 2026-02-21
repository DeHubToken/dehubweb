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
 * Icons are preloaded at module level (use-preload-icons.ts),
 * so we render immediately — no loading gate needed.
 */
export function ProfileEmptyState({ iconSrc, iconAlt, title, subtitle, iconClassName }: ProfileEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <img src={iconSrc} alt={iconAlt} className={`w-16 h-16 mb-3 ${iconClassName ?? ''}`} />
      <p className="text-white text-lg font-medium">{title}</p>
      <p className="text-white/70 text-sm mt-1">{subtitle}</p>
    </div>
  );
}