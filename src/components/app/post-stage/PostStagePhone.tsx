/**
 * Post page "Stage" — the phone (<640px) layout of the dedicated post page.
 *
 *   media, full width, with back / Ask AI / options floating on it
 *   creator row (followers + Follow), caption clamped with "more", meta row
 *   one five-tile bar: like · comments · repost & share · tip · save
 *   comments straight under it ("Comments N" + sort), composer docked to the
 *   bottom of the screen as liquid glass; the bottom nav is hidden here
 *   a mini player pinned to the top once the media scrolls away
 *
 * The cards are the same ones the feed uses. They read `PostStageContext` and
 * only change shape when it is provided, which happens here and nowhere else,
 * so the feed and the tablet/desktop post page are untouched.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { PostStageContext, type PostStageValue } from './post-stage-context';
import { StageMiniPlayer, type StageMediaKind } from './StageMiniPlayer';

interface PostStagePhoneProps {
  value: PostStageValue;
  /** The post card (media, creator, caption, meta, bar). */
  children: ReactNode;
  /** Comments, already in stage mode. */
  comments?: ReactNode;
  /** Related posts under the comments. */
  related?: ReactNode;
  kind: StageMediaKind;
  title: string;
  subtitle: string;
  thumbnail?: string;
  /** Text posts have no media to sit flush against, so they get a gutter. */
  padded?: boolean;
}

/** Body class that hides the app's phone chrome while the stage is up. */
export const POST_STAGE_BODY_CLASS = 'post-stage-mode';

export function PostStagePhone({ value, children, comments, related, kind, title, subtitle, thumbnail, padded }: PostStagePhoneProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add(POST_STAGE_BODY_CLASS);
    return () => document.body.classList.remove(POST_STAGE_BODY_CLASS);
  }, []);

  return (
    <>
      <div ref={rootRef} data-post-page data-post-stage={kind} className="flex flex-col">
        {/* Only the post itself is on the stage. The related posts below are
            ordinary feed cards and must not pick up its layout. */}
        <PostStageContext.Provider value={value}>
          <div data-stage-post className={padded ? 'px-3' : undefined}>
            {children}
          </div>
        </PostStageContext.Provider>
        {comments && (
          <div data-stage-comments className="px-3">
            {comments}
          </div>
        )}
        {related}
        {/* Room for the docked composer, so the last comment and the related
            posts can scroll clear of it. */}
        <div aria-hidden="true" className="h-[calc(5.5rem+env(safe-area-inset-bottom))] shrink-0" />
      </div>
      <StageMiniPlayer rootRef={rootRef} kind={kind} title={title} subtitle={subtitle} thumbnail={thumbnail} onBack={value.onBack} />
    </>
  );
}
