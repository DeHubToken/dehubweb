/**
 * Inline rendering for emoji that are not Unicode characters.
 *
 * `expandEmojiTokens` runs over the output of the text renderers
 * (renderTextWithLinks, renderChatTextWithLinks): every plain-string part is
 * scanned for `<:name:id>` and `:shortcode:` and those become <InlineEmoji>.
 * Links, mentions and tags are already elements by then, so a colon inside a
 * URL is never touched.
 *
 * Nothing loads until a message actually contains a candidate token, and a
 * token that resolves to nothing renders back as the exact text that was
 * typed.
 */

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { discordEmojiUrl, mayContainEmojiTokens, tokenizeEmoji } from '@/lib/emoji/tokens';
import { getLoadedEmojiIndex, loadEmojiIndex } from '@/lib/emoji/emoji-data';
import {
  customEmojisLoaded,
  getCustomEmoji,
  getCustomEmojis,
  loadCustomEmojis,
  subscribeCustomEmojis,
} from '@/lib/emoji/custom-emoji';

export function useCustomEmojis() {
  const list = useSyncExternalStore(subscribeCustomEmojis, getCustomEmojis, getCustomEmojis);
  useEffect(() => {
    if (!customEmojisLoaded()) void loadCustomEmojis();
  }, []);
  return list;
}

function useEmojiIndexReady() {
  const [ready, setReady] = useState(() => !!getLoadedEmojiIndex());
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadEmojiIndex().then(() => live && setReady(true), () => {});
    return () => { live = false; };
  }, [ready]);
  return ready;
}

export function EmojiImage({ src, name, className }: { src: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{`:${name}:`}</>;
  return (
    <img
      src={src}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn('inline-block h-[1.375em] w-auto max-w-[4em] object-contain align-[-0.3em] mx-[0.05em]', className)}
    />
  );
}

function ShortcodeEmoji({ code, raw, className }: { code: string; raw: string; className?: string }) {
  const indexReady = useEmojiIndexReady();
  useCustomEmojis();
  const standard = indexReady ? getLoadedEmojiIndex()?.byShortcode.get(code) : undefined;
  if (standard) return <>{standard.unicode}</>;
  const custom = getCustomEmoji(code);
  if (custom) return <EmojiImage src={custom.image_url} name={custom.shortcode} className={className} />;
  return <>{raw}</>;
}

/** One emoji given as a string that may be Unicode, `:code:` or `<:name:id>` — reaction chips use this. */
export function InlineEmoji({ value, className }: { value: string; className?: string }) {
  const tokens = tokenizeEmoji(value);
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === 'text' ? (
          <Fragment key={i}>{t.text}</Fragment>
        ) : t.kind === 'discord' ? (
          <EmojiImage key={i} src={discordEmojiUrl(t.id, t.animated)} name={t.name} className={className} />
        ) : (
          <ShortcodeEmoji key={i} code={t.code} raw={t.raw} className={className} />
        ),
      )}
    </>
  );
}

export function expandEmojiTokens(parts: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  parts.forEach((part, pi) => {
    if (typeof part !== 'string' || !mayContainEmojiTokens(part)) {
      out.push(part);
      return;
    }
    const tokens = tokenizeEmoji(part);
    if (tokens.length === 1 && tokens[0].kind === 'text') {
      out.push(part);
      return;
    }
    tokens.forEach((t, ti) => {
      if (t.kind === 'text') out.push(t.text);
      else if (t.kind === 'discord') out.push(<EmojiImage key={`em-${pi}-${ti}`} src={discordEmojiUrl(t.id, t.animated)} name={t.name} />);
      else out.push(<ShortcodeEmoji key={`em-${pi}-${ti}`} code={t.code} raw={t.raw} />);
    });
  });
  return out;
}
