import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { articleReadingMinutes } from '@/lib/article';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

interface ArticleFeedCoverProps {
  title?: string;
  /** The summary, already translated by the card. */
  children?: ReactNode;
  body: string;
  coverUrl?: string;
  onOpen: () => void;
}

/**
 * An article in the feed: the cover with the title on it, reading time and
 * summary. Without a cover it falls back to a text headline, so an article
 * never looks like a plain post with a link under it.
 */
export function ArticleFeedCover({ title, children, body, coverUrl, onOpen }: ArticleFeedCoverProps) {
  const { t } = useTranslation();
  const minutes = articleReadingMinutes(body);
  const label = t('articles.cardLabel', { count: minutes, defaultValue: 'Article · {{count}} min read' });
  return (
    <div data-article className="space-y-3">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={title ? t('articles.readTitle', { title, defaultValue: 'Read "{{title}}"' }) : t('articles.read', 'Read article')}
      >
        {coverUrl ? (
          <div className="article-cover aspect-[16/10] sm:aspect-[1.91/1]">
            <img src={coverUrl} alt="" loading="lazy" decoding="async" />
            <div className="article-cover-text">
              <span className="article-label">{label}</span>
              {title && <h3 className="article-title mt-1.5 text-[21px] sm:text-[24px]">{title}</h3>}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-[var(--art-radius)] border border-[color:var(--art-line)] bg-[color:var(--art-wash)] p-4">
            {/* The book from each theme's own icon pack. */}
            <ThemedIcon icon="glossary" className="h-11 w-11 shrink-0 object-contain" />
            <div className="min-w-0">
              <span className="article-label">{label}</span>
              {title && <h3 className="article-title article-ink mt-1.5 text-[21px] sm:text-[24px]">{title}</h3>}
            </div>
          </div>
        )}
      </button>
      {children}
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="article-chip">
        <BookOpen className="h-4 w-4" aria-hidden />
        {t('articles.read', 'Read article')}
      </button>
    </div>
  );
}
