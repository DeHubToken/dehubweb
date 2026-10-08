import { useCallback, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cdnImageSource } from '@/lib/media-url';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

type Claim = {
  slot: HTMLSpanElement;
  priority: number;
  props: ImageProps;
  loaded?: { src: string; width: number; height: number };
  failed?: boolean;
};
type Entry = { image: HTMLImageElement; claims: Claim[]; timer?: ReturnType<typeof setTimeout>; source?: string; fallback?: string; failed?: boolean };
const images = new Map<string, Entry>();

interface ImageProps extends Pick<HTMLAttributes<HTMLSpanElement>, 'onClick' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'> {
  mediaKey: string;
  priority?: number;
  src?: string;
  srcSet?: string;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  onImageLoad?: (image: HTMLImageElement) => void;
  onFailure?: (failed: boolean) => void;
  imageRef?: MutableRefObject<HTMLImageElement | null>;
}

function show(entry: Entry) {
  const claim = entry.claims.reduce<Claim | undefined>((top, next) =>
    !top || next.priority >= top.priority ? next : top, undefined);
  if (!claim) return;
  const { image } = entry;
  if (image.parentNode !== claim.slot) {
    const oldSlot = image.parentElement;
    const rect = image.getBoundingClientRect();
    if (oldSlot && rect.height > 0) {
      oldSlot.style.minHeight = `${rect.height}px`;
      oldSlot.style.width = `${rect.width}px`;
    }
    claim.slot.appendChild(image);
  }
  // Never strip a bitmap while another live claim still wants it shown.
  const fallback = entry.claims.find(c => c.props.src);
  const props = !claim.props.src && fallback ? { ...claim.props, src: fallback.props.src, srcSet: fallback.props.srcSet, sizes: fallback.props.sizes } : claim.props;
  if (props.src && entry.source !== props.src) {
    entry.source = props.src;
    entry.fallback = undefined;
    entry.failed = false;
  }
  const notifyFailure = () => {
    const failed = !!entry.failed;
    if (claim.failed === failed) return;
    claim.failed = failed;
    props.onFailure?.(failed);
  };
  notifyFailure();
  image.className = props.className ?? '';
  image.style.cssText = '';
  for (const [property, value] of Object.entries(props.style ?? {})) {
    if (value == null) continue;
    (image.style as any)[property] = typeof value === 'number' && !['aspectRatio', 'opacity', 'zIndex'].includes(property) ? `${value}px` : String(value);
  }
  if (entry.failed) image.style.visibility = 'hidden';
  if (props.imageRef) props.imageRef.current = image;
  image.loading = props.loading ?? 'lazy';
  image.setAttribute('fetchpriority', props.fetchPriority ?? 'auto');
  for (const [attribute, value] of Object.entries({ src: props.src ? entry.fallback ?? props.src : undefined, srcset: entry.fallback ? undefined : props.srcSet, sizes: props.sizes, width: props.width, height: props.height })) {
    if (value == null) image.removeAttribute(attribute);
    else if (image.getAttribute(attribute) !== String(value)) image.setAttribute(attribute, String(value));
  }
  const loaded = () => {
    entry.failed = false;
    notifyFailure();
    const rect = image.getBoundingClientRect();
    if (rect.height > 0 && claim.priority < 2) claim.slot.style.minHeight = `${rect.height}px`;
    if (!props.onImageLoad) return;
    const src = image.currentSrc || image.src;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (claim.loaded?.src === src && claim.loaded.width === width && claim.loaded.height === height) return;
    // Cached images are shown on every layout. Notify each owner once per bitmap
    // before its callback can schedule another render.
    claim.loaded = { src, width, height };
    props.onImageLoad(image);
  };
  image.onload = loaded;
  image.onerror = () => {
    const source = entry.source;
    if (!source) return;
    const original = cdnImageSource(source);
    if (!entry.fallback && original !== source) {
      entry.fallback = original;
      show(entry);
      return;
    }
    entry.failed = true;
    image.style.visibility = 'hidden';
    notifyFailure();
  };
  if (image.complete && image.naturalWidth) loaded();
}

/** Move the decoded image into the post/viewer slot and return it on close. */
export function HandoffImage(props: ImageProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const claimProps = { ...props, onFailure: setFailed };
  const surfaceActive = useContext(CachedPageActiveContext);
  const propsRef = useRef(claimProps);
  propsRef.current = claimProps;
  const held = useRef<{ entry: Entry; claim: Claim } | null>(null);
  const attach = useCallback((slot: HTMLSpanElement | null) => {
    const previous = held.current;
    if (previous) {
      previous.entry.claims = previous.entry.claims.filter(claim => claim !== previous.claim);
      held.current = null;
      if (previous.entry.claims.length) show(previous.entry);
      else {
        previous.entry.image.remove();
        previous.entry.timer = setTimeout(() => {
          if (previous.entry.claims.length) return;
          images.delete(props.mediaKey);
          previous.entry.image.removeAttribute('src');
          previous.entry.image.removeAttribute('srcset');
        }, 2000);
      }
    }
    if (!slot || !surfaceActive) return;
    let entry = images.get(props.mediaKey);
    if (!entry) {
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.draggable = false;
      entry = { image, claims: [] };
      images.set(props.mediaKey, entry);
    }
    clearTimeout(entry.timer);
    const claim = { slot, priority: propsRef.current.priority ?? 0, props: propsRef.current };
    entry.claims.push(claim);
    held.current = { entry, claim };
    show(entry);
  }, [props.mediaKey, surfaceActive]);
  useLayoutEffect(() => {
    if (!held.current) return;
    held.current.claim.props = claimProps;
    show(held.current.entry);
  });
  return <span ref={attach} data-image-slot onClick={props.onClick} onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerCancel}
    style={{ position: 'relative', display: 'flex', maxWidth: '100%', minWidth: failed ? 160 : undefined, minHeight: failed ? 160 : undefined, maxHeight: props.priority === 2 ? '100%' : undefined, width: props.style?.width, aspectRatio: props.style?.aspectRatio, backgroundColor: 'rgba(128,128,128,0.06)' }}>
    {failed && <button type="button" className="absolute left-1/2 top-1/2 z-10 min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-5 text-white"
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        const entry = held.current?.entry;
        if (!entry) return;
        entry.failed = false;
        entry.fallback = undefined;
        entry.image.removeAttribute('src');
        show(entry);
      }}>{t('common.retry')}</button>}
  </span>;
}
