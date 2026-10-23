import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The ALT pill on a described photo or video. The description is already the
 * image's alt attribute for screen readers; this is the same text for
 * everybody else, a tap away — the way Mastodon shows it.
 */
export function AltTextBadge({ text, className }: { text?: string; className?: string }) {
  const { t } = useTranslation();
  const description = text?.trim();
  if (!description) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-no-navigate
          aria-label={t('altText.show')}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className={cn(
            'z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm hover:bg-black/85',
            className,
          )}
        >
          {t('altText.badge')}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="max-w-xs whitespace-pre-wrap text-sm leading-snug"
        onClick={(e) => e.stopPropagation()}
      >
        {description}
      </PopoverContent>
    </Popover>
  );
}
