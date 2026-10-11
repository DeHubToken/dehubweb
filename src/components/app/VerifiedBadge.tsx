import { useTranslation as _useCopy } from 'react-i18next';
import { cn } from '@/lib/utils';

interface VerifiedBadgeProps {
  className?: string;
}

export function VerifiedBadge({ className }: VerifiedBadgeProps) {
  const { t: _copy } = _useCopy();
  return (
    <svg
      className={cn('w-4 h-4 text-white flex-shrink-0 self-end', className)}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-label={_copy("copy.7ca9d36a6c25", { defaultValue: "Verified account" })}
    >
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );
}
