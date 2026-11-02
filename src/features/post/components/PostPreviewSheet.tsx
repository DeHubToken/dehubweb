/**
 * "Preview" in the composer: the post drawn by the real feed card, so the
 * crop, the photo height cap and the edited pictures look exactly as they
 * will once posted. Read-only; nothing in it reacts to taps.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { extractAvatarPath, buildAvatarUrl } from '@/lib/media-url';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { cn } from '@/lib/utils';
import type { ImagePost, TextPost, VideoItem } from '@/types/feed.types';
import type { MediaFile } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  title: string;
  media: MediaFile[];
}

const PREVIEW_ID = 'composer-preview';

export function PostPreviewSheet({ open, onOpenChange, text, title, media }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [width, setWidth] = useState<'phone' | 'desktop'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'phone' : 'desktop',
  );

  const card = useMemo(() => {
    if (!open) return null;
    const username = user?.username || user?.displayName || 'You';
    const avatar = buildAvatarUrl(user?.address || '', extractAvatarPath(user as Record<string, any>)) || '';
    const now = new Date().toISOString();
    const justNow = t('copy.66f53417d3b7', { defaultValue: 'Just now' });
    const body = text.trim();
    const heading = title.trim() || body.split('\n')[0] || '';
    const video = media.find((m) => m.type === 'video');
    const images = media.filter((m) => m.type === 'image');
    if (video) {
      const v: VideoItem = {
        id: PREVIEW_ID, type: 'video',
        thumbnail: video.thumbnail || video.preview, videoUrl: video.preview,
        duration: video.duration ? `${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')}` : '0:00',
        title: heading, description: body, channel: username, channelAvatar: avatar, verified: false,
        views: '0', uploadedAgo: justNow, creatorId: user?.address, creatorUsername: username,
        creatorBadgeBalance: user?.badgeBalance, createdAt: now,
        isLiked: false, likeCount: 0, dislikeCount: 0, commentCount: 0, isOptimistic: true,
      };
      return <VideoCard video={v} />;
    }
    if (images.length) {
      const p: ImagePost = {
        id: PREVIEW_ID, type: 'image', username, verified: false, avatar,
        image: images[0].preview, imageUrls: images.map((m) => m.preview),
        title: heading, description: body, caption: body,
        likes: 0, dislikes: 0, comments: 0, views: '0', timeAgo: justNow,
        creatorId: user?.address, creatorUsername: username, creatorBadgeBalance: user?.badgeBalance,
        isLiked: false, createdAt: now, isOptimistic: true,
      };
      return <ImageCard post={p} />;
    }
    const p: TextPost = {
      id: PREVIEW_ID, type: 'post',
      author: {
        id: user?.address || '', name: user?.displayName || username, handle: `@${username}`,
        verified: false, avatarSeed: avatar || undefined, badgeBalance: user?.badgeBalance,
      },
      content: body, views: '0', createdAt: now,
      stats: { comments: 0, reposts: 0, likes: 0, dislikes: 0 }, isOptimistic: true,
    };
    return <PostCard post={p} />;
  }, [open, user, text, title, media, t]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10 max-h-[92dvh]">
        <DrawerHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/10">
          <DrawerTitle className="text-white">{t('upload.preview.title', { defaultValue: 'Preview' })}</DrawerTitle>
          <div className="hidden md:flex rounded-full bg-white/10 p-0.5 text-xs" role="tablist">
            {(['phone', 'desktop'] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="tab"
                aria-selected={width === w}
                onClick={() => setWidth(w)}
                className={cn('rounded-full px-3 py-1 text-white/70', width === w && 'bg-white text-black')}
              >
                {w === 'phone'
                  ? t('upload.preview.phone', { defaultValue: 'Phone' })
                  : t('upload.preview.desktop', { defaultValue: 'Desktop' })}
              </button>
            ))}
          </div>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 py-4">
          <div
            className={cn('mx-auto pointer-events-none select-none', width === 'phone' ? 'max-w-[400px]' : 'max-w-[640px]')}
            aria-hidden="true"
          >
            {card}
          </div>
          <p className="mt-3 text-center text-xs text-white/60">
            {t('upload.preview.hint', { defaultValue: 'This is how your post will look in the feed.' })}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
