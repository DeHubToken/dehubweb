import { useMemo } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  formatPrice,
  justwatchUrl,
  type JustWatchOffer,
  type JustWatchProvider,
  type JustWatchTitleDetail,
} from '@/lib/api/justwatch';
import { JustWatchAttribution } from './JustWatchAttribution';

/** Order matters: this is the order the sections render in, cheapest-to-the-
 *  viewer first. A title included with a subscription they already hold beats
 *  a rental, so `flatrate` leads. */
const SECTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'flatrate', label: 'Stream', hint: 'Included with a subscription' },
  { key: 'free', label: 'Free', hint: 'Free to watch, usually with ads' },
  { key: 'rent', label: 'Rent', hint: 'Time-limited rental' },
  { key: 'buy', label: 'Buy', hint: 'Keep it permanently' },
];

const QUALITY_RANK: Record<string, number> = { sd: 0, hd: 1, '4k': 2, uhd: 2 };

function qualityLabel(presentationType: string | null): string | null {
  if (!presentationType) return null;
  const t = presentationType.toLowerCase();
  if (t === '4k' || t === 'uhd') return '4K';
  return t.toUpperCase();
}

/**
 * One row per provider per section. JustWatch returns a separate offer for
 * every quality tier, so an unfiltered list shows Apple TV four times over.
 * The cheapest offer wins the row, with quality shown as a tag — and where
 * price is absent (subscription and free tiers) the best quality wins instead.
 */
function pickBestPerProvider(offers: JustWatchOffer[]): JustWatchOffer[] {
  const byProvider = new Map<number | string, JustWatchOffer>();

  for (const offer of offers) {
    const key = offer.providerId ?? offer.url;
    const current = byProvider.get(key);
    if (!current) {
      byProvider.set(key, offer);
      continue;
    }

    const bothPriced = offer.retailPrice != null && current.retailPrice != null;
    if (bothPriced) {
      if (offer.retailPrice! < current.retailPrice!) byProvider.set(key, offer);
      continue;
    }

    const a = QUALITY_RANK[offer.presentationType?.toLowerCase() ?? ''] ?? -1;
    const b = QUALITY_RANK[current.presentationType?.toLowerCase() ?? ''] ?? -1;
    if (a > b) byProvider.set(key, offer);
  }

  return [...byProvider.values()].sort((a, b) => {
    if (a.retailPrice != null && b.retailPrice != null) return a.retailPrice - b.retailPrice;
    if (a.retailPrice != null) return -1;
    if (b.retailPrice != null) return 1;
    return 0;
  });
}

export function OfferPanel({
  detail,
  providers,
  locale,
  isLoading,
}: {
  detail: JustWatchTitleDetail | null | undefined;
  providers: JustWatchProvider[];
  locale: string;
  isLoading: boolean;
}) {
  const providerName = useMemo(() => {
    const map = new Map<number, JustWatchProvider>();
    for (const p of providers) map.set(p.id, p);
    return map;
  }, [providers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 p-10 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking where you can watch it…
      </div>
    );
  }

  if (!detail) return null;

  const grouped = SECTIONS.map((section) => ({
    ...section,
    offers: pickBestPerProvider(
      detail.offers.filter((o) => o.monetizationType === section.key),
    ),
  })).filter((section) => section.offers.length > 0);

  const attributionHref = justwatchUrl(detail.fullPath);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">
          {detail.title}
          {detail.year ? <span className="ml-2 font-normal text-zinc-500">{detail.year}</span> : null}
        </h2>
        {detail.shortDescription && (
          <p className="max-w-2xl text-sm leading-6 text-zinc-400">{detail.shortDescription}</p>
        )}
        {(detail.director || detail.runtime) && (
          <p className="text-xs text-zinc-600">
            {detail.director}
            {detail.director && detail.runtime ? ' · ' : ''}
            {detail.runtime ? `${detail.runtime} min` : ''}
          </p>
        )}
      </header>

      {grouped.length === 0 && detail.upcoming.length === 0 && (
        <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-500">
          Nothing streaming, renting or on sale in this country yet. Try another
          country — rights differ by territory.
        </p>
      )}

      {grouped.map((section) => (
        <section key={section.key} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-white">{section.label}</h3>
            <span className="text-xs text-zinc-600">{section.hint}</span>
          </div>

          <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {section.offers.map((offer) => {
              const provider = offer.providerId != null ? providerName.get(offer.providerId) : undefined;
              const price = formatPrice(offer.retailPrice, offer.currency, locale);
              const quality = qualityLabel(offer.presentationType);

              return (
                <li key={offer.url}>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5"
                  >
                    {provider?.icon ? (
                      <img
                        src={provider.icon}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-md bg-white/10" />
                    )}

                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {provider?.name ?? 'Watch now'}
                    </span>

                    {quality && (
                      <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-zinc-400">
                        {quality}
                      </span>
                    )}

                    <span className="shrink-0 text-sm font-medium text-white">
                      {price ?? (section.key === 'flatrate' ? 'Subscription' : 'Free')}
                    </span>

                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {detail.upcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Coming soon</h3>
          <ul className="space-y-1.5 rounded-xl border border-white/10 p-3">
            {detail.upcoming.map((u, i) => {
              const provider = u.providerId != null ? providerName.get(u.providerId) : undefined;
              return (
                <li key={`${u.providerId}-${u.from}-${i}`} className="text-sm text-zinc-400">
                  <span className="text-white">{provider?.name ?? u.releaseType ?? 'Release'}</span>
                  {u.from ? ` — from ${new Date(u.from).toLocaleDateString(locale.replace('_', '-'))}` : ''}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Required by the JustWatch partner terms — see JustWatchAttribution. */}
      <JustWatchAttribution href={attributionHref} />
    </div>
  );
}
