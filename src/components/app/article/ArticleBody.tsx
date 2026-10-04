import '@/styles/article.css';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { articleHeadings, articleSlug } from '@/lib/article';

// Lazy: the feed never renders an article body, so the parser stays out of
// the startup bundle.
const ReactMarkdown = lazy(() => import('react-markdown'));

interface ArticleBodyProps {
  body: string;
  className?: string;
}

/**
 * An article's markdown, set for reading. Colours, type and the accent come
 * from the `[data-article]` tokens in styles/article.css, so every theme
 * (paper included) reads without its own overrides. Headings carry the same
 * ids the contents list links to.
 */
export function ArticleBody({ body, className }: ArticleBodyProps) {
  const components = useMemo<Components>(() => {
    const byLine = new Map(articleHeadings(body).map(h => [h.line, h.id]));
    const heading = (Tag: 'h2' | 'h3' | 'h4') => ({ node, children }: { node?: { position?: { start: { line: number } } }; children?: ReactNode }) => {
      const line = node?.position?.start.line;
      const id = (line && byLine.get(line)) || articleSlug(String(children ?? ''));
      return <Tag id={id} className="article-heading">{children}</Tag>;
    };
    return {
      // One h1 per page belongs to the title, so the body's levels step down one.
      h1: heading('h2'),
      h2: heading('h3'),
      h3: heading('h4'),
      a: ({ href, children }) => (
        <a href={href} target={href?.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer nofollow">{children}</a>
      ),
      img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt || ''} loading="lazy" />,
    };
  }, [body]);

  return (
    <div className={['article-body', className].filter(Boolean).join(' ')}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{body}</p>}>
        <ReactMarkdown components={components}>{body}</ReactMarkdown>
      </Suspense>
    </div>
  );
}
