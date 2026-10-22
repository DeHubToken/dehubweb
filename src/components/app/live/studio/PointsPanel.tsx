/**
 * Live Studio's loyal viewers: the creator's top viewers by points — a point
 * for every minute watched and one per 100 DHB paid. Nothing a click can farm.
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { buildAvatarUrl } from '@/lib/media-url';
import { getPointsBoard } from '@/lib/api/dehub/live-subathon';

export function PointsPanel({ address }: { address: string | null | undefined }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['points-board', address, 10],
    queryFn: () => getPointsBoard(address || '', 10),
    enabled: !!address,
    staleTime: 60_000,
  });

  return (
    <PageSection title={t('liveStudio.points.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.points.intro')}</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : !data?.length ? (
        <p className="text-sm text-zinc-500">{t('liveStudio.points.empty')}</p>
      ) : (
        <ol className="space-y-1.5">
          {data.map((r, i) => (
            <li key={r.address} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-center text-zinc-500">{i + 1}</span>
              <img src={buildAvatarUrl(r.address, r.avatarImageUrl)} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />
              <span className="min-w-0 flex-1 truncate text-white">{r.displayName || r.username || `${r.address.slice(0, 6)}…`}</span>
              <span className="tabular-nums text-zinc-300">{t('liveOverlay.points', { count: r.points, formatted: r.points.toLocaleString() })}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-zinc-500">{t('liveStudio.points.widgetHint')}</p>
    </PageSection>
  );
}
