import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowUp, Coins, ListOrdered, MessageSquare, Share2, Type } from 'lucide-react';
import { articleHeadings, articleReadingMinutes } from '@/lib/article';
import { ArticleBody } from './ArticleBody';

type TextSize = 's' | 'm' | 'l';
const SIZE_KEY = 'dehub.article.size';
const NEXT_SIZE: Record<TextSize, TextSize> = { s: 'm', m: 'l', l: 's' };

function readSize(): TextSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === 's' || v === 'l' ? v : 'm';
  } catch { return 'm'; }
}

interface ArticleReaderProps {
  title?: string;
  body: string;
  coverUrl?: string;
  createdAt?: string;
  /** The summary, already translated by the card. */
  children?: ReactNode;
  shareUrl: string;
  onComment: () => void;
  onTip?: () => void;
}

/**
 * An article on its own page: the cover with the title on it, reading time,
 * contents, the body set for reading, a reading-progress line along the top
 * and one glass pill for contents, text size, comments, tips and sharing.
 */
export function ArticleReader({ title, body, coverUrl, createdAt, children, shareUrl, onComment, onTip }: ArticleReaderProps) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const tocRef = useRef<HTMLDetailsElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<TextSize>(readSize);
  const [activeId, setActiveId] = useState<string | null>(null);
  const headings = useMemo(() => articleHeadings(body).filter(h => h.level <= 2), [body]);
  const minutes = articleReadingMinutes(body);
  const date = createdAt ? new Date(createdAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
    : null;
  const minutesLabel = t('articles.minRead', { count: minutes, defaultValue: '{{count}} min read' });

  // Progress line and the current section, from one passive scroll listener.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      if (barRef.current) barRef.current.style.transform = `scaleX(${done})`;
      let current: string | null = null;
      for (const h of headings) {
        const node = document.getElementById(h.id);
        if (node && node.getBoundingClientRect().top < 140) current = h.id;
      }
      setActiveId(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headings]);

  const cycleSize = () => {
    const next = NEXT_SIZE[size];
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, next); } catch { /* private mode */ }
  };

  const openContents = () => {
    const toc = tocRef.current;
    if (!toc) return;
    toc.open = true;
    toc.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: title || undefined, url: shareUrl }); return; }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('articles.linkCopied', 'Link copied'));
    } catch {
      toast.error(t('articles.linkCopyFailed', "Couldn't copy the link"));
    }
  };

  const meta = [dateLabel, minutesLabel].filter(Boolean).join(' · ');

  return (
    <article ref={rootRef} data-article data-size={size} className="relative">
      {createPortal(<div data-article aria-hidden><div ref={barRef} className="article-progress" style={{ transform: 'scaleX(0)' }} /></div>, document.body)}

      {coverUrl ? (
        <div className="article-cover aspect-[4/3] sm:aspect-[1.91/1]">
          <img src={coverUrl} alt="" decoding="async" fetchPriority="high" />
          <div className="article-cover-text sm:p-6">
            <span className="article-label">{t('articles.label', 'Article')}</span>
            {title && <h1 className="article-title mt-2 text-[27px] sm:text-[36px]">{title}</h1>}
            <p className="article-cover-meta mt-2 text-[13px]">{meta}</p>
          </div>
        </div>
      ) : (
        <header className="pt-1">
          <span className="article-label">{t('articles.label', 'Article')}</span>
          {title && <h1 className="article-title article-ink mt-2 text-[28px] sm:text-[38px]">{title}</h1>}
          <p className="article-meta mt-2 text-[13px]">{meta}</p>
        </header>
      )}

      <div className="mx-auto mt-5 max-w-[680px]">
        {children && <div className="article-serif article-ink-2 mb-5 italic leading-relaxed" style={{ fontSize: 'calc(var(--art-size) + 1px)' }}>{children}</div>}

        {headings.length >= 2 && (
          <details ref={tocRef} open className="article-toc mb-6 rounded-[var(--art-radius)] border border-[color:var(--art-line)] p-3">
            <summary className="article-label cursor-pointer list-none select-none">{t('articles.contents', 'In this article')}</summary>
            <nav className="mt-2" aria-label={t('articles.contents', 'In this article')}>
              {headings.map(h => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  data-active={activeId === h.id || undefined}
                  onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </details>
        )}

        <ArticleBody body={body} />
      </div>

      <div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 mt-8 flex justify-center lg:bottom-6">
        <div className="article-pill pointer-events-auto flex items-center gap-1 px-2 py-1.5" role="toolbar" aria-label={t('articles.tools', 'Article tools')}>
          {headings.length >= 2 && (
            <button type="button" onClick={openContents} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label={t('articles.contents', 'In this article')}><ListOrdered /></button>
          )}
          <button type="button" onClick={cycleSize} className="flex h-9 items-center gap-1 rounded-full px-2" aria-label={t('articles.textSize', 'Text size')}>
            <Type /><span className="text-[11px] font-semibold uppercase tabular-nums">{size === 'm' ? 'A' : size === 's' ? 'A−' : 'A+'}</span>
          </button>
          <button type="button" onClick={onComment} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label={t('articles.comments', 'Comments')}><MessageSquare /></button>
          {onTip && (
            <button type="button" onClick={onTip} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label={t('articles.tip', 'Tip the writer')}><Coins /></button>
          )}
          <button type="button" onClick={share} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label={t('articles.share', 'Share')}><Share2 /></button>
          <button
            type="button"
            onClick={() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex h-9 w-9 items-center justify-center rounded-full"
            aria-label={t('articles.backToTop', 'Back to top')}
          >
            <ArrowUp />
          </button>
        </div>
      </div>
    </article>
  );
}
