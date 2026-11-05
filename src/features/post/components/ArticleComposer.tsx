import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Heading1, Heading2, ImagePlus, Italic, List, ListOrdered, Loader2, PencilLine } from "lucide-react";
import Check from "@/components/ui/cut-icons/check";
import Eye from "@/components/ui/cut-icons/visibility";
import Link2 from "@/components/ui/cut-icons/link";
import Quote from "@/components/ui/cut-icons/quote";

import ArrowLeft from "@/components/ui/cut-icons/back";
import X from "@/components/ui/cut-icons/close";

import { toast } from 'sonner';
import {
  ARTICLE_BODY_MAX, ARTICLE_BODY_MIN, ARTICLE_CAPTION_MAX, ARTICLE_IMAGE_MAX, ARTICLE_RAW_MAX, ARTICLE_SUMMARY_MAX,
  articleImageMarkdown, articleImages, articleReadingMinutes, articleSummaryFromBody, articleTextLength, articleWordCount,
  removeArticleImage, setArticleImageCaption,
} from '@/lib/article';
import { uploadArticleImage } from '../lib/articleImages';
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
  { key: 'heading', icon: Heading1, before: '# ', after: '', get placeholder() { return _translateCopy("copy.b34f17f02ecf", { defaultValue: "Heading" }); }, block: true },
  { key: 'subheading', icon: Heading2, before: '## ', after: '', get placeholder() { return _translateCopy("copy.f593a11d4a56", { defaultValue: "Subheading" }); }, block: true },
  { key: 'bold', icon: Bold, before: '**', after: '**', get placeholder() { return _translateCopy("copy.fae745ccad9a", { defaultValue: "bold text" }); }, block: false },
  { key: 'italic', icon: Italic, before: '*', after: '*', get placeholder() { return _translateCopy("copy.5ca0a3629fd9", { defaultValue: "italic text" }); }, block: false },
  { key: 'quote', icon: Quote, before: '> ', after: '', get placeholder() { return _translateCopy("copy.eb4cdebd82bf", { defaultValue: "Quote" }); }, block: true },
  { key: 'bullets', icon: List, before: '- ', after: '', get placeholder() { return _translateCopy("copy.201333ac71bc", { defaultValue: "List item" }); }, block: true },
  { key: 'numbers', icon: ListOrdered, before: '1. ', after: '', get placeholder() { return _translateCopy("copy.201333ac71bc", { defaultValue: "List item" }); }, block: true },
  { key: 'link', icon: Link2, before: '[', after: '](https://)', get placeholder() { return _translateCopy("copy.9ccec3cf40d4", { defaultValue: "link text" }); }, block: false },
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
  const { t: _copy } = _useCopy();
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
  const textLength = articleTextLength(body);
  const images = articleImages(body);
  const bodyReady = textLength >= ARTICLE_BODY_MIN;
  const bodyTooLong = textLength > ARTICLE_BODY_MAX;
  const tooManyImages = images.length > ARTICLE_IMAGE_MAX;
  const canContinue = title.trim().length > 0 && bodyReady && !bodyTooLong && !tooManyImages;
  const [uploading, setUploading] = useState(0);
  // Latest body for uploads that finish after more typing.
  const bodyNow = useRef(body);
  bodyNow.current = body;

  /** Uploads picked pictures and puts each one where the cursor was. */
  const addImages = async (picked: FileList | null) => {
    const files = Array.from(picked ?? []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const room = ARTICLE_IMAGE_MAX - articleImages(bodyNow.current).length - uploading;
    if (room <= 0) {
      toast.error(t('articles.imageLimit', { count: ARTICLE_IMAGE_MAX, defaultValue: 'Articles can hold up to {{count}} images' }));
      return;
    }
    if (files.length > room) {
      toast.error(t('articles.imageLimitSome', { count: room, defaultValue: 'Only {{count}} more images fit in this article' }));
    }
    const take = files.slice(0, room);
    const editor = bodyRef.current;
    let at = editor && !preview ? editor.selectionEnd : bodyNow.current.length;
    setUploading(n => n + take.length);
    for (const file of take) {
      try {
        const url = await uploadArticleImage(file);
        const current = bodyNow.current;
        const pos = Math.min(at, current.length);
        const before = current.slice(0, pos).replace(/\n*$/, '');
        const after = current.slice(pos).replace(/^\n*/, '');
        const block = `${before ? '\n\n' : ''}${articleImageMarkdown(url)}\n\n`;
        const next = `${before}${block}${after}`;
        if (next.length > ARTICLE_RAW_MAX) throw new Error('too long');
        at = before.length + block.length;
        bodyNow.current = next;
        setBody(next);
      } catch {
        toast.error(t('articles.imageFailed', 'That image could not be added. Try another one.'));
      } finally {
        setUploading(n => n - 1);
      }
    }
  };
  const canPublish = canContinue && summary.trim().length > 0 && formReady && !isPosting;

  // The summary starts as the article's first paragraph until the writer
  // types their own. Text carried over from the post composer can be longer
  // than the summary cap, which would block publishing, so swap it out too.
  useEffect(() => {
    if (step !== 'publish' || summaryTouched.current) return;
    if (!summary.trim() || summary.length > ARTICLE_SUMMARY_MAX) setSummary(articleSummaryFromBody(body));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const format = (tool: Tool) => {
    const editor = bodyRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = body.slice(start, end) || tool.placeholder;
    const prefix = tool.block && start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    setBody(`${body.slice(0, start)}${prefix}${tool.before}${selected}${tool.after}${body.slice(end)}`.slice(0, ARTICLE_RAW_MAX));
    requestAnimationFrame(() => {
      editor.focus();
      const from = start + prefix.length + tool.before.length;
      editor.setSelectionRange(from, from + selected.length);
    });
  };

  const hint = uploading > 0
    ? t('articles.imagesUploading', { count: uploading, defaultValue: 'Adding images ({{count}})…' })
    : !title.trim()
      ? t('articles.needTitle', 'Add a title to continue')
      : !bodyReady
        ? t('articles.needBody', { count: ARTICLE_BODY_MIN - textLength, defaultValue: '{{count}} more characters to go' })
        : bodyTooLong
          ? t('articles.bodyTooLong', { count: textLength - ARTICLE_BODY_MAX, defaultValue: '{{count}} characters over the limit' })
          : tooManyImages
            ? t('articles.imageLimit', { count: ARTICLE_IMAGE_MAX, defaultValue: 'Articles can hold up to {{count}} images' })
            : null;

  if (step === 'publish') {
    return (
      <div data-article className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" data-swipe-back onClick={() => setStep('write')} className="article-tool" aria-label={t('articles.backToWriting', 'Back to writing')}><ArrowLeft /></button>
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
                <p className="article-meta text-[11px]">{_copy("copy.bf640b85d499", { defaultValue: "riftn.com · " })}{t('articles.minRead', { count: minutes, defaultValue: '{{count}} min read' })}</p>
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
              <span>{_copy("copy.d978a5522ce4", { defaultValue: "Confirming" })}</span>
              <button type="button" onClick={onAbandonMint} className="underline">{t('common.cancel', 'Cancel')}</button>
            </div>
          )}
          <button type="button" onClick={onPublish} disabled={!canPublish || uploading > 0} className="article-cta w-full py-3 text-[15px]">
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
        <button type="button" onClick={() => setStep('publish')} disabled={!canContinue || uploading > 0} className="article-cta py-1.5">{t('articles.next', 'Next')}</button>
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
                <label
                  className={`article-tool cursor-pointer${images.length >= ARTICLE_IMAGE_MAX ? ' pointer-events-none opacity-40' : ''}`}
                  aria-label={t('articles.format.image', 'Add images')}
                  title={t('articles.format.image', 'Add images')}
                  onMouseDown={e => e.preventDefault()}
                >
                  {uploading > 0 ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                    className="sr-only"
                    onChange={e => { void addImages(e.target.files); e.target.value = ''; }}
                  />
                </label>
              </div>
            </div>
            <textarea
              ref={bodyRef}
              id="article-body"
              value={body}
              onChange={e => setBody(e.target.value.slice(0, ARTICLE_RAW_MAX))}
              placeholder={t('articles.bodyPlaceholder', 'Tell your story. Select text and use the bar above for headings, bold, quotes and lists.')}
              aria-label={t('articles.bodyLabel', 'Article body')}
              className="article-input article-body mt-2 min-h-[40dvh] overflow-hidden"
            />
            {images.length > 0 && (
              <section className="mt-4" aria-label={t('articles.imagesLabel', 'Images')}>
                <p className="article-label mb-2">
                  {t('articles.imagesCount', { count: images.length, max: ARTICLE_IMAGE_MAX, defaultValue: 'Images · {{count}}/{{max}}' })}
                </p>
                <ul className="space-y-2">
                  {images.map(img => (
                    <li key={img.index} className="article-caption-row">
                      <img src={img.url} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                      <input
                        type="text"
                        value={img.caption}
                        maxLength={ARTICLE_CAPTION_MAX}
                        onChange={e => setBody(setArticleImageCaption(bodyNow.current, img.index, e.target.value))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                        placeholder={t('articles.captionPlaceholder', 'Add a caption')}
                        aria-label={t('articles.captionLabel', { n: img.index + 1, defaultValue: 'Caption for image {{n}}' })}
                        className="article-input min-w-0 flex-1 text-[15px]"
                      />
                      <button
                        type="button"
                        onClick={() => setBody(removeArticleImage(bodyNow.current, img.index))}
                        className="article-tool shrink-0"
                        aria-label={t('articles.removeInlineImage', { n: img.index + 1, defaultValue: 'Remove image {{n}}' })}
                      >
                        <X />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <p className="article-meta px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1 text-center text-xs tabular-nums">
        {hint ?? `${t('articles.wordCount', { count: words, defaultValue: '{{count}} words' })} · ${t('articles.minRead', { count: minutes, defaultValue: '{{count}} min read' })}`}
      </p>
    </div>
  );
}
