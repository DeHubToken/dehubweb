/**
 * DescriptionWithLinks
 * =====================
 * A community description with its links shown the way posts show them: an
 * inline 🔗 that opens the link, plus tappable @mentions, $cashtags, #hashtags
 * and emails. Only the display changes — the stored description is untouched.
 */

import { renderTextWithLinks } from '@/components/app/TranslatableText';
import { cn } from '@/lib/utils';

/**
 * Markdown links (`[Sign up](https://…)`) read as their label followed by the
 * link, so the 🔗 lands right after the words it belongs to instead of inside
 * leftover brackets.
 */
export function prepareDescriptionText(text: string, singleLine = false): string {
  const out = text.replace(/\[([^\]\n]+)\]\(\s*(\S+?)\s*\)/g, '$1 $2');
  return singleLine ? out.replace(/\s+/g, ' ').trim() : out;
}

interface DescriptionWithLinksProps {
  text: string;
  className?: string;
  /** Cards and previews: one truncated line, line breaks folded into spaces. */
  singleLine?: boolean;
}

export function DescriptionWithLinks({ text, className, singleLine = false }: DescriptionWithLinksProps) {
  return (
    <p
      className={cn(
        singleLine ? 'truncate' : 'text-white text-sm whitespace-pre-wrap break-words',
        className,
      )}
    >
      {renderTextWithLinks(prepareDescriptionText(text, singleLine))}
    </p>
  );
}
