/**
 * Communities on phones, clean list concept (?concept=clean).
 *
 * Sort words under the pill (Top, New, Hot), then "Yours" and the rest as
 * one line per community: square avatar, name, members and the first words of
 * the description. No banners bleeding through cards, no clock chips.
 *
 * @module components/app/clean/CommunitiesClean
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import Users from '@/components/ui/cut-icons/communities';
import Lock from '@/components/ui/cut-icons/privacy';
import ChevronRight from '@/components/ui/cut-icons/next';
import type { Community } from '@/hooks/use-communities';
import { storageImage, deviceWidth } from '@/lib/media-url';
import { CleanMore, CleanRow, CleanSection, CleanWords } from './CleanKit';

const COLLAPSED = 12;

function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function CommunityLine({
  community,
  role,
  unread,
  onOpen,
}: {
  community: Community;
  role?: string;
  unread?: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const desc = (community.description || '').replace(/\s+/g, ' ').trim();
  return (
    <CleanRow
      onClick={onOpen}
      lead={
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[12px] bg-zinc-800">
          {community.avatar_url ? (
            <img src={storageImage(community.avatar_url, deviceWidth(44))} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="flex h-full w-full items-center justify-center"><Users className="h-5 w-5 text-zinc-500" /></span>
          )}
        </span>
      }
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{community.name}</span>
          {community.is_private && <Lock className="h-3 w-3 shrink-0 text-zinc-500" />}
          {role === 'owner' && <Crown className="h-3 w-3 shrink-0 text-amber-400/80" />}
        </span>
      }
      sub={`${compact(community.member_count)} ${t('communities.members')}${desc ? ` · ${desc}` : ''}`}
      trail={
        unread ? (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-black">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
        )
      }
    />
  );
}

export default function CommunitiesClean({
  mine,
  others,
  roleMap,
  unreadFor,
  sortMode,
  onSort,
  onOpen,
}: {
  mine: Community[];
  others: Community[];
  roleMap: Record<string, string>;
  unreadFor: (c: Community) => number;
  sortMode: 'top' | 'new' | 'hot';
  onSort: (mode: 'top' | 'new' | 'hot') => void;
  onOpen: (c: Community) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // A deleted community keeps its row until the sweep; nobody can join it.
  const rest = others.filter((c) => c.name !== 'Deleted community');
  const shown = open ? rest : rest.slice(0, COLLAPSED);
  const restTitle =
    sortMode === 'new'
      ? t('copy.18fdd549b2ed', { defaultValue: 'New' })
      : sortMode === 'hot'
        ? t('copy.0ec53894d032', { defaultValue: 'Hot' })
        : t('clean.popular', { defaultValue: 'Popular' });

  return (
    <div data-clean-communities>
      <CleanWords<'top' | 'new' | 'hot'>
        layoutId="communities-clean-sort"
        value={sortMode}
        onChange={onSort}
        items={[
          { id: 'top', label: t('clean.top', { defaultValue: 'Top' }) },
          { id: 'new', label: t('copy.18fdd549b2ed', { defaultValue: 'New' }) },
          { id: 'hot', label: t('copy.0ec53894d032', { defaultValue: 'Hot' }) },
        ]}
      />
      <div className="divide-y divide-zinc-800/60">
        {mine.length > 0 && (
          <CleanSection icon="profile" title={t('communities.joined')}>
            {mine.map((c) => (
              <CommunityLine key={c.id} community={c} role={roleMap[c.id]} unread={unreadFor(c)} onOpen={() => onOpen(c)} />
            ))}
          </CleanSection>
        )}
        <CleanSection icon="communities" title={restTitle}>
          {shown.map((c) => (
            <CommunityLine key={c.id} community={c} onOpen={() => onOpen(c)} />
          ))}
          {!open && rest.length > COLLAPSED && (
            <CleanMore onClick={() => setOpen(true)}>
              {t('copy.a40947644c97', { defaultValue: '+{{value1}} more', value1: rest.length - COLLAPSED })}
            </CleanMore>
          )}
        </CleanSection>
      </div>
    </div>
  );
}
