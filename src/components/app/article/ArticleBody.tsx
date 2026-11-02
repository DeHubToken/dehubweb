import '@/styles/article.css';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { articleHeadings, articleLinkBlocks, articleSlug } from '@/lib/article';
import { FeedLinkPreviews } from '@/components/app/cards/FeedLinkPreviews';
import { parseDehubLink } from '@/lib/dehub-links';

// Lazy: the feed never renders an article body, so the parser stays out of
// the startup bundle.
const ReactMarkdown = lazy(() => import('react-markdown'));

type HastNode = { type: string; tagName?: string; value?: string; properties?: { href?: unknown }; children?: HastNode[] };

/** The outside address a paragraph holds when the paragraph is only that link. */
function soleOutsideLink(node: HastNode | undefined): string | null {
  const kids = (node?.children ?? []).filter(k => !(k.type === 'text' && !k.value?.trim()));
  const only = kids.length === 1 ? kids[0] : null;
  const href = only?.tagName === 'a' ? only.properties?.href : null;
  return typeof href === 'string' && /^https?:\/\//.test(href) && !parseDehubLink(href) ? href : null;
}

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
  const source = useMemo(() => articleLinkBlocks(body), [body]);
  const components = useMemo<Components>(() => {
    // Same ids as the contents list: ids come from heading text and order,
    // which the link pass never changes, only the line numbers.
    const byLine = new Map(articleHeadings(source).map(h => [h.line, h.id]));
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
      // A link on its own line gets the same preview card a post shows.
      p: ({ node, children }) => {
        const href = soleOutsideLink(node as HastNode | undefined);
        if (!href) return <p>{children}</p>;
        return (
          <div className="article-link-block">
            <p>{children}</p>
            <div className="article-link-card"><FeedLinkPreviews text={href} /></div>
          </div>
        );
      },
      img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt || ''} loading="lazy" />,
    };
  }, [source]);

  return (
    <div className={['article-body', className].filter(Boolean).join(' ')}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{body}</p>}>
        <ReactMarkdown components={components}>{source}</ReactMarkdown>
      </Suspense>
    </div>
  );
}
