import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageSection, PageEmpty, KitButton } from '@/components/app/page-kit/PageKit';
import { Input } from '@/components/ui/input';
import { CATEGORIES, FEATURES, PLATFORMS, REVIEWED_ON, SOURCES, STATUS_LABELS, comparisonCoverage, entryFor, filterFeatures, type PlatformId, type ComparisonEntry } from '@/data/platform-comparison';

const PAGE_SIZE = 20;
export default function ComparePage() {
  const { t } = useTranslation();
  const copy = (key: string, fallback: string) => t(`comparison.${key}`, { defaultValue: fallback });
  const [params, setParams] = useSearchParams();
  const selected = params.get('platform');
  const platform: PlatformId | 'all' = selected === 'all' || PLATFORMS.some(p => p.id === selected) ? selected as PlatformId | 'all' : 'youtube';
  const category = CATEGORIES.includes(params.get('category') ?? '') ? params.get('category')! : 'all';
  const query = params.get('q') ?? '';
  const [visible, setVisible] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterFeatures(query, category), [query, category]);
  const peers = PLATFORMS.filter(p => platform === 'all' || p.id === platform);
  const coverage = comparisonCoverage(platform);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setVisible(PAGE_SIZE);
    setParams(next, { replace: true });
  };
  const cell = (entry: ComparisonEntry, name: string, restricted = false) => (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <h3 className="font-semibold text-foreground">{name}</h3>
        <span className="text-xs text-muted-foreground">{copy(`status.${entry.status}`, STATUS_LABELS[entry.status])}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{entry.note}</p>
      {restricted && <p className="text-xs leading-relaxed text-muted-foreground">{copy('ios', 'Purchase and reward actions are unavailable in the iOS app.')}</p>}
      {entry.source && SOURCES[entry.source] && <a className="inline-block text-xs underline underline-offset-4 hover:text-foreground" href={SOURCES[entry.source].url} target="_blank" rel="noopener noreferrer">{SOURCES[entry.source].title}</a>}
      {entry.relatedSources?.map(source => SOURCES[source] && <a key={source} className="block text-xs underline underline-offset-4 hover:text-foreground" href={SOURCES[source].url} target="_blank" rel="noopener noreferrer">{SOURCES[source].title}</a>)}
    </div>
  );
  return (
    <>
      <SEOHead title={copy('seoTitle', 'Compare DeHub with YouTube, X, Twitch and more')} description={copy('seoDescription', 'Compare DeHub features with YouTube, X, Kick, Twitch, Facebook, Instagram, TikTok, Rumble, Mastodon, Bluesky and Farcaster. Sources and conditions included.')} url="https://dehub.io/compare" />
      <PageIsland title={copy('title', 'Compare DeHub')} icon="glossary" back backFallback="/">
        <Input aria-label={copy('search', 'Search features')} placeholder={copy('search', 'Search features')} value={query} onChange={event => update('q', event.target.value)} />
      </PageIsland>
      <PageBody>
        <PageSection>
          <p className="text-xs text-muted-foreground">{copy('edition', 'English research edition')} · {REVIEWED_ON}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{copy('headline', 'Find your fit, feature by feature.')}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy('intro', 'Explore publishing, live streaming, creator tools, communities and ownership across DeHub and eleven other platforms.')}</p>
          <p className="mt-3 text-sm font-medium text-foreground">{FEATURES.length} {copy('features', 'features')} · {CATEGORIES.length} {copy('categories', 'categories')} · {PLATFORMS.length} {copy('platforms', 'other platforms')}</p>
        </PageSection>
        <PageSection>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">{copy('versus', 'Compare with')}
              <select className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-foreground" value={platform} onChange={event => update('platform', event.target.value)}>
                {PLATFORMS.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
                <option value="all">{copy('allPlatforms', 'All platforms')}</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">{copy('category', 'Feature category')}
              <select className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-foreground" value={category} onChange={event => update('category', event.target.value)}>
                <option value="all">{copy('allCategories', 'All categories')}</option>
                {CATEGORIES.map(c => <option value={c} key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <details className="mt-5 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">{copy('method', 'How to read this comparison')}</summary>
            <div className="mt-3 space-y-3 leading-relaxed">
              <p>{copy('methodBody', 'Documented means described by linked first-party documentation or implementation. Conditional means eligibility, device, region or a narrower feature applies. Related product means a companion app, integration or ecosystem implementation. Not verified is an open research item, never a claim that a feature is absent.')}</p>
              <p>{copy('scope', 'This is a growing catalogue of DeHub capabilities, not a score or an exhaustive audit of every competitor. Platform documentation can lag product changes. Older sources establish a feature, not its current price or limits.')}</p>
              <p>{copy('parity', 'DeHub web, Android and iOS capabilities differ. The iOS app does not offer crypto purchases or reward actions. Device-specific notes remain beside the relevant features. Documentation is not a guarantee of availability or earnings.')}</p>
              <p>{copy('auditLimit', 'DeHub coverage includes product documentation, web routes, native screens, settings and editor tools. Code references identify the reviewed revisions. Every feature has not been exercised in production or on every device, and competitor research is incomplete. Counts describe catalogue entries, not unique advantages or a feature score.')}</p>
              <a href="/feedback" className="inline-block underline underline-offset-4">{copy('correction', 'Suggest a correction')}</a>
            </div>
          </details>
        </PageSection>
        <p className="px-4 text-xs leading-relaxed text-muted-foreground">{coverage.verified} / {coverage.total} {copy('coverage', 'competitor entries have source evidence. Remaining entries need verification.')}</p>
        <p role="status" className="px-4 text-sm text-muted-foreground">{filtered.length} {copy('matching', 'matching features')}</p>
        {filtered.slice(0, visible).map(feature => <PageSection key={feature.id}>
          <div id={feature.id} className="scroll-mt-36">
            <p className="text-xs text-muted-foreground">{feature.category}</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{feature.name}</h2>
            <div className={`mt-4 grid gap-6 ${platform === 'all' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {cell(feature.dehub, 'DeHub', feature.iosRestricted)}
              {peers.map(peer => <div key={peer.id}>{cell(entryFor(feature, peer.id), peer.name)}</div>)}
            </div>
          </div>
        </PageSection>)}
        {filtered.length === 0 && <PageEmpty icon="search" title={copy('empty', 'No matching features')} body={copy('emptyBody', 'Try another phrase or clear the category filter.')} action={<KitButton onClick={() => { setParams({ platform }); setVisible(PAGE_SIZE); }}>{copy('reset', 'Clear filters')}</KitButton>} />}
        {visible < filtered.length && <div className="px-4 pb-6"><KitButton onClick={() => setVisible(value => value + PAGE_SIZE)}>{copy('more', 'Show more features')}</KitButton></div>}
        <PageSection title={copy('sources', 'Sources and coverage')}>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy('sourcesBody', 'Sources are linked beside each documented entry. Unverified cells remain visible so gaps cannot be mistaken for a platform disadvantage. Research reviewed on')} {REVIEWED_ON}.</p>
          <details className="mt-3"><summary className="cursor-pointer text-sm">{copy('sourceList', 'Browse all sources')}</summary><ul className="mt-3 space-y-2 text-sm">{Object.entries(SOURCES).map(([id, source]) => <li key={id}><a className="underline underline-offset-4" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></details>
        </PageSection>
      </PageBody>
    </>
  );
}
