import { useTranslation } from 'react-i18next';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import dehubCoin from '@/assets/dehub-coin.png';
import type { Community } from '@/hooks/use-communities';
import { communityKindOf, entryPriceOf } from '@/lib/community-kinds';
import { tokenLabel } from '@/lib/token-label';

/** "Channel · 1,000 tokens to join" under a group's or channel's member count. */
export function CommunityKindChip({ community }: { community: Community }) {
  const { t } = useTranslation();
  const kind = communityKindOf(community);
  if (kind === 'community') return null;
  const price = entryPriceOf(community);
  const Icon = kind === 'channel' ? Megaphone : Users;
  const label = kind === 'channel'
    ? t('communities.newChat.channel', { defaultValue: 'Channel' })
    : t('communities.newChat.group', { defaultValue: 'Group' });
  return (
    <p data-community-kind={kind} className="mt-1.5 mr-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-300">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
      {price > 0 && (
        <>
          <span aria-hidden>·</span>
          <img src={dehubCoin} alt="" className="w-3.5 h-3.5 shrink-0" />
          {t('communities.entry.chip', { defaultValue: '{{amount}} to join', amount: `${price.toLocaleString()} ${tokenLabel('DHB') || 'tokens'}` })}
        </>
      )}
    </p>
  );
}
