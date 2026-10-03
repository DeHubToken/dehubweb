import { useCallback, useContext, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type MutableRefObject } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

type Claim = { slot: HTMLSpanElement; priority: number; props: ImageProps };
type Entry = { image: HTMLImageElement; claims: Claim[]; timer?: ReturnType<typeof setTimeout> };
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
  const props = claim.props;
  image.className = props.className ?? '';
  image.style.cssText = '';
  for (const [property, value] of Object.entries(props.style ?? {})) {
    if (value == null) continue;
    (image.style as any)[property] = typeof value === 'number' && !['aspectRatio', 'opacity', 'zIndex'].includes(property) ? `${value}px` : String(value);
  }
  if (props.imageRef) props.imageRef.current = image;
  image.loading = props.loading ?? 'lazy';
  image.setAttribute('fetchpriority', props.fetchPriority ?? 'auto');
  for (const [attribute, value] of Object.entries({ src: props.src, srcset: props.srcSet, sizes: props.sizes, width: props.width, height: props.height })) {
    if (value == null) image.removeAttribute(attribute);
    else if (image.getAttribute(attribute) !== String(value)) image.setAttribute(attribute, String(value));
  }
  const loaded = () => {
    const rect = image.getBoundingClientRect();
    if (rect.height > 0 && claim.priority < 2) claim.slot.style.minHeight = `${rect.height}px`;
    props.onImageLoad?.(image);
  };
  image.onload = loaded;
  if (image.complete && image.naturalWidth) loaded();
}

/** Move the decoded image into the post/viewer slot and return it on close. */
export function HandoffImage(props: ImageProps) {
  const surfaceActive = useContext(CachedPageActiveContext);
  const propsRef = useRef(props);
  propsRef.current = props;
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
    held.current.claim.props = props;
    show(held.current.entry);
  });
  return <span ref={attach} data-image-slot onClick={props.onClick} onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerCancel} style={{ display: 'flex', maxWidth: '100%', maxHeight: props.priority === 2 ? '100%' : undefined, width: props.style?.width, aspectRatio: props.style?.aspectRatio }} />;
}
