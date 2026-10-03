import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Bold, Check, Eye, Heading1, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, PencilLine, Quote, X,
} from 'lucide-react';
import {
  ARTICLE_BODY_MAX, ARTICLE_BODY_MIN, ARTICLE_SUMMARY_MAX, articleReadingMinutes, articleSummaryFromBody, articleWordCount,
} from '@/lib/article';
import { ArticleBody } from '@/components/app/article/ArticleBody';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

interface ArticleComposerProps {
  title: string;
  setTitle: (v: string) => void;
  /** The post text, which for an article is its summary. */
  summary: string;
  setSummary: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  coverPreview: string;
  onCoverChange: (file: File | null) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  /** Everything else the form needs to post (wallet, quota, media) is ready. */
  formReady: boolean;
  isPosting: boolean;
  uploadProgress: number;
  mintAwaitingWallet: boolean;
  onAbandonMint: () => void;
}

type Tool = { key: string; icon: typeof Bold; before: string; after: string; placeholder: string; block: boolean };
const TOOLS: Tool[] = [
  { key: 'heading', icon: Heading1, before: '# ', after: '', placeholder: 'Heading', block: true },
  { key: 'subheading', icon: Heading2, before: '## ', after: '', placeholder: 'Subheading', block: true },
  { key: 'bold', icon: Bold, before: '**', after: '**', placeholder: 'bold text', block: false },
  { key: 'italic', icon: Italic, before: '*', after: '*', placeholder: 'italic text', block: false },
  { key: 'quote', icon: Quote, before: '> ', after: '', placeholder: 'Quote', block: true },
  { key: 'bullets', icon: List, before: '- ', after: '', placeholder: 'List item', block: true },
  { key: 'numbers', icon: ListOrdered, before: '1. ', after: '', placeholder: 'List item', block: true },
  { key: 'link', icon: Link2, before: '[', after: '](https://)', placeholder: 'link text', block: false },
];

/** Grows a textarea to its content so the page, not the box, scrolls. */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

/**
 * The article writer: its own clean page inside the composer. Cover first
 * (it is also the share card), then the title, then the body with a real
 * format bar. Summary and the share preview wait for the publish step, so
 * nobody has to write the summary before the article.
 */
export function ArticleComposer(props: ArticleComposerProps) {
  const {
    title, setTitle, summary, setSummary, body, setBody, coverPreview, onCoverChange,
    onSaveDraft, onPublish, formReady, isPosting, uploadProgress, mintAwaitingWallet, onAbandonMint,
  } = props;
  const { t } = useTranslation();
  const [step, setStep] = useState<'write' | 'publish'>('write');
  const [preview, setPreview] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const summaryTouched = useRef(false);
  useAutoGrow(titleRef, title);
  useAutoGrow(bodyRef, preview ? '' : body);

  const words = articleWordCount(body);
  const minutes = articleReadingMinutes(body);
  const bodyReady = body.trim().length >= ARTICLE_BODY_MIN;
  const canContinue = title.trim().length > 0 && bodyReady;
  const canPublish = canContinue && summary.trim().length > 0 && formReady && !isPosting;

  // The summary starts as the article's first paragraph until the writer
  // types their own.
  useEffect(() => {
    if (step !== 'publish' || summaryTouched.current) return;
    if (!summary.trim()) setSummary(articleSummaryFromBody(body));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const format = (tool: Tool) => {
    const editor = bodyRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = body.slice(start, end) || tool.placeholder;
    const prefix = tool.block && start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    setBody(`${body.slice(0, start)}${prefix}${tool.before}${selected}${tool.after}${body.slice(end)}`.slice(0, ARTICLE_BODY_MAX));
    requestAnimationFrame(() => {
      editor.focus();
      const from = start + prefix.length + tool.before.length;
      editor.setSelectionRange(from, from + selected.length);
    });
  };

  const hint = !title.trim()
    ? t('articles.needTitle', 'Add a title to continue')
    : !bodyReady
      ? t('articles.needBody', { count: ARTICLE_BODY_MIN - body.trim().length, defaultValue: '{{count}} more characters to go' })
      : null;

  if (step === 'publish') {
    return (
      <div data-article className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" onClick={() => setStep('write')} className="article-tool" aria-label={t('articles.backToWriting', 'Back to writing')}><ArrowLeft /></button>
          <h2 className="article-ink text-base font-semibold">{t('articles.readyTitle', 'Ready to publish')}</h2>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <section>
            <p className="article-label mb-2">{t('articles.sharePreview', 'How it looks when shared')}</p>
            <div className="overflow-hidden rounded-[var(--art-radius)] border border-[color:var(--art-line)]">
              {coverPreview
                ? <img src={coverPreview} alt="" className="aspect-[1.91/1] w-full object-cover" />
                : <div className="article-meta flex aspect-[1.91/1] items-center justify-center bg-[color:var(--art-wash)] px-6 text-center text-sm">{t('articles.noCoverShare', 'No cover yet. Links will show without an image.')}</div>}
              <div className="space-y-1 p-3">
                <p className="article-ink line-clamp-1 text-sm font-semibold">{title.trim()}</p>
                <p className="article-meta line-clamp-2 text-xs">{summary.trim() || t('articles.summaryPlaceholder', 'A sentence or two about your article')}</p>
                <p className="article-meta text-[11px]">dehub.io · {t('articles.minRead', { count: minutes, defaultValue: '{{count}} min read' })}</p>
              </div>
            </div>
          </section>
          <section>
            <label htmlFor="article-summary" className="article-label mb-2 block">{t('articles.summaryLabel', 'Summary · shown in the feed and link previews')}</label>
            <textarea
              id="article-summary"
              value={summary}
              onChange={e => { summaryTouched.current = true; setSummary(e.target.value.slice(0, ARTICLE_SUMMARY_MAX)); }}
              rows={4}
              placeholder={t('articles.summaryPlaceholder', 'A sentence or two about your article')}
              className="article-input rounded-[calc(var(--art-radius)*0.75)] border border-[color:var(--art-line)] p-3 text-[15px] leading-relaxed focus:border-[color:var(--art-accent)]"
            />
            <p className="article-meta mt-1 text-right text-[11px] tabular-nums">{summary.length}/{ARTICLE_SUMMARY_MAX}</p>
          </section>
        </div>
        <div className="space-y-2 border-t border-[color:var(--art-line)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          {isPosting && uploadProgress > 0 && (
            <div className="h-1 overflow-hidden rounded-full bg-[color:var(--art-wash)]"><div className="h-full bg-[color:var(--art-accent)] transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
          )}
          {mintAwaitingWallet && (
            <div className="article-meta flex items-center justify-between text-xs">
              <span>{t('upload.stageConfirming', 'Confirming')}</span>
              <button type="button" onClick={onAbandonMint} className="underline">{t('common.cancel', 'Cancel')}</button>
            </div>
          )}
          <button type="button" onClick={onPublish} disabled={!canPublish} className="article-cta w-full py-3 text-[15px]">
            {isPosting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {isPosting ? t('articles.publishing', 'Publishing…') : t('articles.publish', 'Publish article')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-article className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 whitespace-nowrap px-4 py-2">
        <button type="button" onClick={onSaveDraft} disabled={!title.trim() && !body.trim()} className="article-chip ml-auto py-1.5 disabled:opacity-40">{t('articles.saveDraft', 'Save draft')}</button>
        <button type="button" onClick={() => setPreview(p => !p)} aria-pressed={preview} className="article-chip py-1.5">
          {preview ? <PencilLine className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          {preview ? t('articles.edit', 'Edit') : t('articles.preview', 'Preview')}
        </button>
        <button type="button" onClick={() => setStep('publish')} disabled={!canContinue} className="article-cta py-1.5">{t('articles.next', 'Next')}</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {coverPreview ? (
          <div className="article-cover aspect-[1.91/1]">
            <img src={coverPreview} alt="" />
            <div className="absolute bottom-3 left-3 right-3 z-[1] flex items-center gap-2">
              <label className="article-pill flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs" style={{ color: "#fff" }}>
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />{t('articles.changeCover', 'Change cover')}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => onCoverChange(e.target.files?.[0] || null)} />
              </label>
              <button type="button" onClick={() => onCoverChange(null)} className="article-pill ml-auto flex h-8 w-8 items-center justify-center" style={{ color: "#fff" }} aria-label={t('articles.removeCover', 'Remove cover')}><X className="h-4 w-4" /></button>
            </div>
          </div>
        ) : (
          <label className="article-drop flex aspect-[3/1] cursor-pointer flex-col items-center justify-center gap-1.5 px-4 text-center text-sm">
            <ThemedIcon icon="images" className="h-10 w-10 object-contain" />
            <span className="article-ink-2 font-medium">{t('articles.addCover', 'Add a cover')}</span>
            <span className="text-xs">{t('articles.coverHint', 'It sits on top of your article and is the picture people see when it is shared')}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => onCoverChange(e.target.files?.[0] || null)} />
          </label>
        )}

        {preview ? (
          <div className="pt-5">
            <h1 className="article-title article-ink mb-4 text-[28px]">{title.trim() || t('articles.titlePlaceholder', 'Title')}</h1>
            {body.trim() ? <ArticleBody body={body} /> : <p className="article-meta">{t('articles.previewEmpty', 'Nothing to preview yet.')}</p>}
          </div>
        ) : (
          <>
            <textarea
              ref={titleRef}
              id="article-title"
              value={title}
              onChange={e => setTitle(e.target.value.replace(/\n/g, ' ').slice(0, 150))}
              rows={1}
              placeholder={t('articles.titlePlaceholder', 'Title')}
              aria-label={t('articles.titleLabel', 'Article title')}
              className="article-input article-title mt-5 overflow-hidden text-3xl"
            />
            <div className="sticky top-0 z-10 -mx-4 mt-2 flex items-center gap-0.5 overflow-x-auto bg-transparent px-3 py-1" role="toolbar" aria-label={t('articles.formatting', 'Formatting')}>
              <div className="article-pill flex items-center gap-0.5 px-1.5 py-1">
                {TOOLS.map(tool => (
                  <button
                    key={tool.key}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => format(tool)}
                    className="article-tool"
                    aria-label={t(`articles.format.${tool.key}`, tool.key)}
                    title={t(`articles.format.${tool.key}`, tool.key)}
                  >
                    <tool.icon />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={bodyRef}
              id="article-body"
              value={body}
              onChange={e => setBody(e.target.value.slice(0, ARTICLE_BODY_MAX))}
              placeholder={t('articles.bodyPlaceholder', 'Tell your story. Select text and use the bar above for headings, bold, quotes and lists.')}
              aria-label={t('articles.bodyLabel', 'Article body')}
              className="article-input article-body mt-2 min-h-[40dvh] overflow-hidden"
            />
          </>
        )}
      </div>
      <p className="article-meta px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1 text-center text-xs tabular-nums">
        {hint ?? `${t('articles.wordCount', { count: words, defaultValue: '{{count}} words' })} · ${t('articles.minRead', { count: minutes, defaultValue: '{{count}} min read' })}`}
      </p>
    </div>
  );
}
