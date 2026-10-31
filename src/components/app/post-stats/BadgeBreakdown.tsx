/**
 * Who saw a post, by the badge they held when they first saw it. Members with
 * no badge and signed-out visitors close the list, so the rows add up to
 * everyone the post reached.
 */

import { useTranslation } from 'react-i18next';
import { badgeImage } from '@/lib/staking-badges';
import type { PostStatsBadge } from '@/lib/api/dehub/post-stats';
import { fmt } from './stats-parts';

interface Row {
  key: string;
  name: string;
  image: string | null;
  people: number;
}

export function BadgeBreakdown({
  badges,
  signedOut,
  limit,
}: {
  badges: PostStatsBadge[];
  signedOut: number;
  /** Show at most this many badge rows (the rest fold into "Other badges"). */
  limit?: number;
}) {
  const { t } = useTranslation();
  const withBadge = badges.filter((b) => b.tier >= 0);
  const noBadge = badges.find((b) => b.tier < 0)?.people ?? 0;
  const shown = limit ? withBadge.slice(0, limit) : withBadge;
  const folded = limit ? withBadge.slice(limit).reduce((s, b) => s + b.people, 0) : 0;

  const rows: Row[] = [
    ...shown.map((b) => ({ key: `t${b.tier}`, name: b.name ?? '', image: badgeImage(b.name), people: b.people })),
    ...(folded ? [{ key: 'other', name: t('postStats.otherBadges', 'Other badges'), image: null, people: folded }] : []),
    ...(noBadge ? [{ key: 'none', name: t('postStats.noBadge', 'No badge'), image: null, people: noBadge }] : []),
    ...(signedOut ? [{ key: 'out', name: t('postStats.signedOutViewers', 'Signed out'), image: null, people: signedOut }] : []),
  ];
  const max = Math.max(1, ...rows.map((r) => r.people));

  if (!rows.length) {
    return <p className="text-xs text-white/50">{t('postStats.noViewersYet', 'Nobody has seen this post yet.')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2" aria-label={t('postStats.whoSawIt', 'Who saw it')}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[22px_minmax(0,1fr)_44px] items-center gap-2.5">
          {r.image ? (
            <img src={r.image} alt="" className="w-[22px] h-[22px] object-contain" />
          ) : (
            <span className="w-[22px] h-[22px] rounded-md bg-white/10" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="text-xs text-white truncate">{r.name}</div>
            <div className="h-1.5 mt-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${Math.max(3, (r.people / max) * 100)}%`, opacity: r.key === 'out' ? 0.45 : 1 }} />
            </div>
          </div>
          <span className="text-xs font-semibold text-white tabular-nums text-right">{fmt(r.people)}</span>
        </li>
      ))}
    </ul>
  );
}
