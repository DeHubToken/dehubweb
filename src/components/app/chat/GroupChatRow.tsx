/**
 * A group or channel in the Messages list. Tapping it opens its chat.
 */

import { useTranslation } from 'react-i18next';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import Lock from '@/components/ui/cut-icons/privacy';
import type { Community } from '@/hooks/use-communities';
import { communityKindOf, entryPriceOf } from '@/lib/community-kinds';
import { storageImage, deviceWidth } from '@/lib/media-url';
import dehubCoin from '@/assets/dehub-coin.png';

export function GroupChatRow({ community, onClick }: { community: Community; onClick: () => void }) {
  const { t } = useTranslation();
  const kind = communityKindOf(community);
  const KindIcon = kind === 'channel' ? Megaphone : Users;
  const price = entryPriceOf(community);
  const subtitle = kind === 'channel'
    ? t('communities.newChat.channelRow', { defaultValue: 'Channel · {{formattedCount}} members', count: community.member_count ?? 0, formattedCount: (community.member_count ?? 0).toLocaleString() })
    : t('communities.newChat.groupRow', { defaultValue: 'Group · {{formattedCount}} members', count: community.member_count ?? 0, formattedCount: (community.member_count ?? 0).toLocaleString() });

  return (
    <button
      type="button"
      onClick={onClick}
      data-group-chat-row={kind}
      className="w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left"
    >
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-white/[0.08] flex items-center justify-center">
        {community.avatar_url
          ? <img src={storageImage(community.avatar_url, deviceWidth(48))} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          : <KindIcon className="w-6 h-6 text-white/80" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-white truncate">
          <KindIcon className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          <span className="truncate">{community.name}</span>
          {community.is_private && <Lock className="w-3 h-3 shrink-0 text-zinc-500" />}
        </span>
        <p className="text-zinc-500 text-sm truncate flex items-center gap-1">
          {subtitle}
          {price > 0 && (
            <span className="inline-flex items-center gap-0.5">
              {' · '}<img src={dehubCoin} alt="" className="w-3 h-3" />{price.toLocaleString()}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
