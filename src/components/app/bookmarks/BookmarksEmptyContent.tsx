import { Bookmark, ThumbsUp, History, Clock, Image, Video, FileText, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BookmarkType } from '@/hooks/use-bookmarks';

const tabConfig: Record<BookmarkType, { icon: typeof Bookmark; colorClass: string; bgClass: string; titleKey: string; descKey: string }> = {
  all:     { icon: Bookmark,  colorClass: 'text-zinc-400',    bgClass: 'bg-zinc-800',        titleKey: 'bookmarks.noBookmarksYet',  descKey: 'bookmarks.startSaving' },
  liked:   { icon: ThumbsUp,  colorClass: 'text-pink-400',    bgClass: 'bg-pink-500/10',     titleKey: 'bookmarks.noLikedYet',      descKey: 'bookmarks.likedStartSaving' },
  history: { icon: History,   colorClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',     titleKey: 'bookmarks.noHistoryYet',    descKey: 'bookmarks.historyStartSaving' },
  recent:  { icon: Clock,     colorClass: 'text-amber-400',   bgClass: 'bg-amber-500/10',    titleKey: 'bookmarks.noRecentYet',     descKey: 'bookmarks.recentStartSaving' },
  ppv:     { icon: Ticket,    colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10',  titleKey: 'bookmarks.noPpvYet',        descKey: 'bookmarks.ppvStartSaving' },
  images:  { icon: Image,     colorClass: 'text-purple-400',  bgClass: 'bg-purple-500/10',   titleKey: 'bookmarks.noImagesYet',     descKey: 'bookmarks.imagesStartSaving' },
  videos:  { icon: Video,     colorClass: 'text-red-400',     bgClass: 'bg-red-500/10',      titleKey: 'bookmarks.noVideosYet',     descKey: 'bookmarks.videosStartSaving' },
  text:    { icon: FileText,  colorClass: 'text-cyan-400',    bgClass: 'bg-cyan-500/10',     titleKey: 'bookmarks.noTextYet',       descKey: 'bookmarks.textStartSaving' },
};

interface Props {
  activeTab: BookmarkType;
  searchQuery: string;
}

export function BookmarksEmptyContent({ activeTab, searchQuery }: Props) {
  const { t } = useTranslation();
  const config = tabConfig[activeTab] ?? tabConfig.all;
  const Icon = config.icon;

  return (
    <div className="text-center">
      <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6 ${config.bgClass}`}>
        <Icon className={`w-8 h-8 ${config.colorClass}`} />
      </div>
      <h2 className="text-xl font-bold text-white mb-3">
        {searchQuery ? t('bookmarks.noMatchingBookmarks') : t(config.titleKey)}
      </h2>
      <p className="text-zinc-500 max-w-sm mx-auto">
        {searchQuery ? t('bookmarks.noMatchSearch', { query: searchQuery }) : t(config.descKey)}
      </p>
    </div>
  );
}
