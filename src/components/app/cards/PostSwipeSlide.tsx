/**
 * PostSwipeSlide
 * ==============
 * A non-video post as one full-screen slide of the profile reel (see
 * lib/profile-reel): a text post is a poster of its own words on the creator's
 * post background, photos page sideways, a comic is its collector-card deck, an
 * article shows its cover and opening lines, and a paid post shows a lock that
 * opens the post page to unlock it.
 *
 * The viewer's own chrome (back, like, comments, share, caption) sits on top,
 * so the slide keeps clear of the bottom and right edges.
 *
 * @module components/app/cards/PostSwipeSlide
 */

import { lazy, memo, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { ShortVideo } from '@/types/feed.types';
import { PostBgLayer, postBgHostProps } from '@/components/app/profile/PostBackground';
import { postBgById } from '@/lib/post-backgrounds';
import { closeBrainrotFeed } from '@/lib/brainrot-feed';
import { cn } from '@/lib/utils';

const ShortsPhotoPager = lazy(() => import('./ShortsPhotoPager').then((m) => ({ default: m.ShortsPhotoPager })));
const ComicDeck = lazy(() => import('@/components/app/comic/ComicDeck').then((m) => ({ default: m.ComicDeck })));

/** Words only: links shortened, markdown marks dropped, line breaks kept. */
function readable(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/(www\.)?/g, '')
    // A long link would fill the poster with an id; its first part says enough.
    .replace(/\b([a-z0-9-]+(\.[a-z0-9-]+)+\/\S{18,})/gi, (link: string) => `${link.slice(0, 26)}…`)
    .replace(/[*_`~>#]+/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Behind a text post when the creator has not picked a post background. */
const PLAIN_POSTER =
  'radial-gradient(120% 70% at 15% 8%, rgba(124,92,255,0.32) 0%, transparent 62%), radial-gradient(110% 70% at 95% 95%, rgba(34,150,190,0.26) 0%, transparent 60%), #0b0b11';

/** Short posts read big, long ones settle to a reading size. */
function posterSize(length: number): string {
  if (length <= 40) return 'text-[34px] leading-[1.16]';
  if (length <= 90) return 'text-[28px] leading-[1.18]';
  if (length <= 180) return 'text-[23px] leading-[1.26]';
  if (length <= 360) return 'text-[19px] leading-[1.38]';
  return 'text-[17px] leading-[1.45]';
}

function TextPoster({ short }: { short: ShortVideo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const post = short.reelPost!;
  const words = useMemo(() => readable(post.text || ''), [post.text]);
  const bg = postBgById(post.bgId);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    // Big type's descenders poke past the box by a few pixels; that is not a cut.
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 12);
  }, [words]);

  const openPost = () => {
    closeBrainrotFeed();
    navigate(`/app/post/${short.articleSlug || short.id}`, { state: { fromFeed: true } });
  };

  return (
    <div
      data-reel-text
      data-keep-dark={bg ? undefined : ''}
      className="absolute inset-0 flex flex-col justify-center"
      {...postBgHostProps(bg)}
      style={bg ? undefined : { color: '#fff', background: PLAIN_POSTER }}
    >
      <PostBgLayer bg={bg} />
      <div className="relative flex flex-col px-7 pb-[150px] pr-[76px] pt-[96px]">
        <span aria-hidden className="mb-2 select-none font-serif text-[64px] leading-[0.6] opacity-40">“</span>
        <p
          ref={bodyRef}
          className={cn(
            'shrink-0 whitespace-pre-line break-words font-semibold tracking-[-0.01em] [text-wrap:pretty]',
            posterSize(words.length),
            overflows && '[mask-image:linear-gradient(to_bottom,#000_78%,transparent)]',
          )}
          style={{ maxHeight: 'calc(100dvh - 330px)', overflow: 'hidden' }}
        >
          {words}
        </p>
        {/* Polls, quoted posts and link cards live on the post page; a long
            post continues there too. */}
        <button
          type="button"
          onClick={openPost}
          className={cn(
            'mt-4 self-start rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-md',
            overflows ? 'bg-white/20' : 'bg-white/10 opacity-80',
          )}
        >
          {overflows ? t('reel.readAll', 'Read all') : t('reel.openPost', 'Open post')}
        </button>
      </div>
    </div>
  );
}

function ArticleSlide({ short }: { short: ShortVideo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const post = short.reelPost!;
  return (
    <div data-reel-article className="absolute inset-0 flex flex-col justify-center bg-zinc-950 px-6 pb-[150px] pr-[76px] pt-[90px] text-white">
      {post.cover && <img src={post.cover} alt="" className="mb-5 aspect-[16/9] w-full rounded-2xl object-cover" />}
      <span className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{t('profile.articleShort', 'Article')}</span>
      <h2 className="text-[24px] font-bold leading-tight">{readable(post.title || '')}</h2>
      <p className="mt-3 line-clamp-4 text-[15px] leading-relaxed text-white/75">{readable(post.text || '')}</p>
      <button
        type="button"
        onClick={() => { closeBrainrotFeed(); navigate(`/app/post/${short.articleSlug || short.id}`, { state: { fromFeed: true } }); }}
        className="mt-5 self-start rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
      >
        {t('reel.readArticle', 'Read article')}
      </button>
    </div>
  );
}

function LockedSlide({ short }: { short: ShortVideo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cover = short.reelPost?.cover;
  return (
    <div data-reel-locked className="absolute inset-0 flex items-center justify-center overflow-hidden bg-zinc-950 text-white">
      {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />}
      <div className="relative flex flex-col items-center gap-3 px-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-md"><Lock className="h-6 w-6" /></span>
        <p className="text-base font-semibold">{t('profile.lockedPost', 'Locked post')}</p>
        <button
          type="button"
          onClick={() => { closeBrainrotFeed(); navigate(`/app/post/${short.articleSlug || short.id}`, { state: { fromFeed: true } }); }}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
        >
          {t('reel.openToUnlock', 'Open to unlock')}
        </button>
      </div>
    </div>
  );
}

export const PostSwipeSlide = memo(function PostSwipeSlide({ short, isActive }: { short: ShortVideo; isActive: boolean }) {
  const post = short.reelPost;
  if (!post) return null;
  if (post.kind === 'text') return <TextPoster short={short} />;
  if (post.kind === 'article') return <ArticleSlide short={short} />;
  if (post.kind === 'locked') return <LockedSlide short={short} />;
  const images = post.images || [];
  if (post.kind === 'comic') {
    return (
      <div data-reel-comic data-keep-dark className="absolute inset-0 flex items-center justify-center bg-black px-4 pb-[120px] pr-[64px] pt-[80px]">
        <div className="w-full max-w-[420px]">
          <Suspense fallback={<img src={images[0]} alt="" className="mx-auto max-h-[60dvh] rounded-xl object-contain" />}>
            {isActive || images.length < 2
              ? <ComicDeck images={images} captions={post.captions} descriptions={post.alts} border={post.border} aboveFold />
              : <img src={images[0]} alt="" className="mx-auto max-h-[60dvh] rounded-xl object-contain" />}
          </Suspense>
        </div>
      </div>
    );
  }
  // Photos: the same sideways pager photo shorts use.
  return (
    <div data-reel-photo data-keep-dark className="absolute inset-0 bg-black">
      <Suspense fallback={<img src={images[0]} alt="" className="h-full w-full object-contain" />}>
        <ShortsPhotoPager images={images} galleryKey={`reel:${short.id}`} />
      </Suspense>
    </div>
  );
});
