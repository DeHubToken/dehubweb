import { useTranslation } from 'react-i18next';
import { AppState } from '@/components/app/AppState';
import type { ThemeIconKey } from '@/components/app/war/WarHudIcon';
import type { BookmarkType } from '@/hooks/use-bookmarks';

const tabConfig: Record<BookmarkType, { icon: ThemeIconKey; titleKey: string; descKey: string }> = {
  all: { icon: 'bookmarks', titleKey: 'bookmarks.noBookmarksYet', descKey: 'bookmarks.startSaving' },
  liked: { icon: 'pinned', titleKey: 'bookmarks.noLikedYet', descKey: 'bookmarks.likedStartSaving' },
  history: { icon: 'stats', titleKey: 'bookmarks.noHistoryYet', descKey: 'bookmarks.historyStartSaving' },
  folders: { icon: 'bookmarks', titleKey: 'bookmarks.noBookmarksYet', descKey: 'bookmarks.startSaving' },
  recent: { icon: 'stats', titleKey: 'bookmarks.noRecentYet', descKey: 'bookmarks.recentStartSaving' },
  ppv: { icon: 'lock', titleKey: 'bookmarks.noPpvYet', descKey: 'bookmarks.ppvStartSaving' },
  images: { icon: 'images', titleKey: 'bookmarks.noImagesYet', descKey: 'bookmarks.imagesStartSaving' },
  videos: { icon: 'videos', titleKey: 'bookmarks.noVideosYet', descKey: 'bookmarks.videosStartSaving' },
  text: { icon: 'posts', titleKey: 'bookmarks.noTextYet', descKey: 'bookmarks.textStartSaving' },
};

interface Props {
  activeTab: BookmarkType;
  searchQuery: string;
}

export function BookmarksEmptyContent({ activeTab, searchQuery }: Props) {
  const { t } = useTranslation();
  const config = tabConfig[activeTab] ?? tabConfig.all;

  return (
    <AppState
      icon={searchQuery ? 'search' : config.icon}
      title={searchQuery ? t('bookmarks.noMatchingBookmarks') : t(config.titleKey)}
      description={searchQuery ? t('bookmarks.noMatchSearch', { query: searchQuery }) : t(config.descKey)}
      kind={searchQuery ? 'search-empty' : 'empty'}
      size="page"
    />
  );
}
