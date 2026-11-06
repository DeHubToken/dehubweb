/**
 * Profile reel
 * ============
 * On a phone, a tap on any post in a profile's grid opens that creator's posts
 * one by one in the shorts viewer, starting at the tapped one: videos play,
 * photos and comics page sideways, text posts read as a full-screen poster.
 *
 * This turns one /api/feed row into a viewer slide. Videos keep the normal
 * shorts mapping; everything else carries a `reelPost` the viewer draws with
 * PostSwipeSlide instead of a video player.
 *
 * @module lib/profile-reel
 */

import type { ShortVideo, ReelPost } from '@/types/feed.types';
import { mapToShortVideo } from '@/lib/short-video';
import { buildFeedImageUrls } from '@/lib/media-url';
import { isBrainrotPlayable } from '@/lib/brainrot-feed';

type Row = Record<string, any>;

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && !!v.trim());
  return typeof value === 'string' && value.trim() ? [value] : [];
}

/** Paid, held or subscriber-only, and not yet opened by this viewer. */
function isLockedFor(row: Row): boolean {
  if (row.isOwner || row.isUnlocked) return false;
  const info = row.streamInfo || {};
  if (row.is_ppv || info.isPayPerView) return true;
  if (info.isLockContent && Number(info.lockContentAmount) > 0) return true;
  if (row.isLocked) return true;
  return !!row.plansDetails?.length;
}

function imagesOf(row: Row): string[] {
  const raw = listOf(row.imageUrls).length ? listOf(row.imageUrls) : listOf(row.imageUrl);
  return buildFeedImageUrls(raw.filter((url) => /^https?:/i.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url))) || [];
}

/**
 * A video post. The first videos (2024) were minted before posts had a
 * postType, so theirs is empty: a video file on the row is what marks them.
 */
export function isReelVideo(row: Row): boolean {
  const type = row.postType;
  if (type === 'video' || type === 'short') return true;
  return !type && !!(row.videoUrl || row.videoExt);
}

/** One feed row as a viewer slide, or null when it has nothing to show. */
export function toReelShort(row: Row, index: number, bgId?: string | null): ShortVideo | null {
  const base = mapToShortVideo(row, index) as ShortVideo;
  const text = String(row.description || '').replace(/\[soundtrack:[^\]]*\]/g, '').trim();
  const title = String(row.name || row.title || '').trim();

  if (isReelVideo(row)) {
    if (isBrainrotPlayable(row)) return base;
    const reelPost: ReelPost = { kind: 'locked', cover: base.thumbnail || undefined };
    return { ...base, reelPost };
  }

  if (isLockedFor(row)) {
    const cover = imagesOf(row)[0];
    return { ...base, title, description: '', reelPost: { kind: 'locked', cover } };
  }

  if (row.articleBody) {
    const cover = row.articleImageUrl ? buildFeedImageUrls([row.articleImageUrl])?.[0] : undefined;
    return {
      ...base,
      title: '',
      description: '',
      reelPost: { kind: 'article', title: title || text.split('\n')[0], text: String(row.articleBody).slice(0, 600), cover },
    };
  }

  if (row.postType === 'feed-images') {
    const images = imagesOf(row);
    if (!images.length) return { ...base, title: '', description: '', reelPost: { kind: 'text', text: text || title, bgId: bgId || undefined } };
    if (row.layout === 'comic') {
      return {
        ...base,
        thumbnail: images[0],
        reelPost: {
          kind: 'comic',
          images,
          captions: listOf(row.mediaCaptions),
          alts: listOf(row.mediaDescriptions),
          border: row.comicBorder || undefined,
        },
      };
    }
    return { ...base, thumbnail: images[0], videoUrl: '', hlsUrl: undefined, reelPost: { kind: 'photo', images } };
  }

  // Text post: the words are the slide, so the caption under it stays empty.
  const words = text || title;
  if (!words) return null;
  return { ...base, title: '', description: '', reelPost: { kind: 'text', text: words, bgId: bgId || undefined } };
}

/** The whole list as slides, keeping the tapped row's position. */
export function toReelShorts(rows: Row[], bgId?: string | null): ShortVideo[] {
  const out: ShortVideo[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = String(row.tokenId ?? row.id ?? '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    const slide = toReelShort(row, index, bgId);
    if (slide) out.push(slide);
  });
  return out;
}
