import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import developerDocs from '@/data/developer-docs.json';

/**
 * The developer docs (/docs/developers, /docs/developers/mini-apps, /docs/auth,
 * /docs/webhooks, /docs/endpoints, /docs/examples, /docs/troubleshooting).
 *
 * Every page is data in src/data/developer-docs.json. The same file builds the
 * crawler copy in public/docs-content (scripts/build-developer-docs-content.mjs),
 * so what a person reads and what a search engine indexes cannot drift.
 */

type Block =
  | { p: string }
  | { code: string; lang?: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { cards: { title: string; to: string; body: string }[] };

interface Section {
  id: string;
  heading: string;
  blocks: Block[];
}

export interface DeveloperPage {
  route: string;
  section: string;
  title: string;
  seoTitle: string;
  description: string;
  intro: string;
  sections: Section[];
}

export const DEVELOPER_PAGES = developerDocs.pages as DeveloperPage[];

/** `code`, **bold** and [text](href) — the only inline marks the data uses. */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<code key={i++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{m[1]}</code>);
    } else if (m[2] !== undefined) {
      parts.push(<strong key={i++} className="font-semibold text-foreground">{m[2]}</strong>);
    } else {
      const href = m[4];
      const label = m[3];
      parts.push(
        href.startsWith('/') || href.startsWith('#') ? (
          <Link key={i++} to={href} className="text-foreground underline underline-offset-2 hover:opacity-80">{label}</Link>
        ) : (
          <a key={i++} href={href} target="_blank" rel="noopener" className="text-foreground underline underline-offset-2 hover:opacity-80">{label}</a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div className="relative docs-glass rounded-lg">
      <div className="flex items-center justify-between px-4 pt-2 text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-wide">{lang || 'code'}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted/60" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 pt-2 font-mono text-xs leading-relaxed text-foreground"><code>{code}</code></pre>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <p className="leading-relaxed text-muted-foreground"><Inline text={block.p} /></p>;
  if ('code' in block) return <CodeBlock code={block.code} lang={block.lang} />;
  if ('list' in block) {
    return (
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground marker:text-muted-foreground/60">
        {block.list.map((item, i) => <li key={i} className="leading-relaxed"><Inline text={item} /></li>)}
      </ul>
    );
  }
  if ('table' in block) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40">
            <tr>{block.table.head.map((h) => <th key={h} className="px-3 py-2 font-semibold text-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, r) => (
              <tr key={r} className="border-t border-border align-top">
                {row.map((cell, c) => <td key={c} className="px-3 py-2 text-muted-foreground"><Inline text={cell} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {block.cards.map((card) => (
        <Link key={card.to} to={card.to} className="block rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
          <h3 className="mb-1 font-semibold text-foreground">{card.title}</h3>
          <p className="text-sm text-muted-foreground">{card.body}</p>
        </Link>
      ))}
    </div>
  );
}

export default function DeveloperDoc({ route }: { route: string }) {
  const page = DEVELOPER_PAGES.find((p) => p.route === route);
  if (!page) return null;
  const hub = route === 'developers';
  return (
    <div className="max-w-4xl space-y-10">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Link to="/docs" className="hover:text-foreground">Docs</Link>
          <span>/</span>
          {hub ? <span className="text-foreground">Developers</span> : (
            <>
              <Link to="/docs/developers" className="hover:text-foreground">Developers</Link>
              <span>/</span>
              <span className="text-foreground">{page.title}</span>
            </>
          )}
        </div>
        <h1 className="text-4xl font-bold text-foreground">{page.title}</h1>
        <p className="text-xl leading-relaxed text-muted-foreground"><Inline text={page.intro} /></p>
        {page.sections.length > 2 && (
          <nav aria-label="On this page" className="flex flex-wrap gap-2 pt-1">
            {page.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                {s.heading}
              </a>
            ))}
          </nav>
        )}
      </div>
      {page.sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">{s.heading}</h2>
          {s.blocks.map((b, i) => <BlockView key={i} block={b} />)}
        </section>
      ))}
    </div>
  );
}
