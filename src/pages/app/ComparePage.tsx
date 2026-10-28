import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageSection, PageEmpty, KitButton } from '@/components/app/page-kit/PageKit';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CATEGORIES, FEATURES, PLATFORMS, COMPETITOR_REVIEWED_ON, SOURCES, STATUS_LABELS, entryFor, featureTotals, filterFeatures, markFor, type ComparisonFeature, type Mark, type PlatformId } from '@/data/platform-comparison';
import { BRAND_MARKS } from '@/data/platform-comparison-marks';
import { cn } from '@/lib/utils';

type Column = { id: PlatformId | 'dehub'; name: string; short: string };
const SHORT: Partial<Record<PlatformId, string>> = { x: 'X', instagram: 'Insta', facebook: 'Facebook', farcaster: 'Farcaster', mastodon: 'Mastodon' };
const ALL_TOTALS = featureTotals();
type View = 'all' | 'social' | 'lacks';
/** DeHub's built-in creator suite. Rivals ship these as separate apps or not at all, so Social only leaves them out. */
const EDITOR_CATEGORIES = new Set(['Video editing', 'Design and documents', 'Charts and data', 'Presentations and exports']);
const inView = (feature: ComparisonFeature, view: View) =>
  view === 'all' || (view === 'social' ? !EDITOR_CATEGORIES.has(feature.category) : markFor(entryFor(feature, 'dehub')) !== 'yes');
const percent = (part: number, whole: number) => `${whole ? Math.round((part / whole) * 100) : 0}%`;
/** DeHub first, then everyone else from most features to fewest. */
const COLUMNS: Column[] = [
  { id: 'dehub', name: 'DeHub', short: 'DeHub' },
  ...[...PLATFORMS].sort((a, b) => ALL_TOTALS[b.id].yes - ALL_TOTALS[a.id].yes).map(p => ({ id: p.id, name: p.name, short: SHORT[p.id] ?? p.name })),
];

function BrandMark({ id, className }: { id: string; className?: string }) {
  const mark = BRAND_MARKS[id];
  return (
    <svg viewBox={mark.viewBox} className={className} aria-hidden="true" style={{ color: mark.color ?? undefined }}>
      <path d={mark.d} fill="currentColor" />
    </svg>
  );
}

function MarkGlyph({ mark }: { mark: Mark }) {
  if (mark === 'yes') return <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (mark === 'partial') return <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" /></svg>;
  if (mark === 'no') return <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <span className="block h-1 w-1 rounded-full bg-current" aria-hidden="true" />;
}

/** Tints the DeHub column in the text colour, so it reads on dark and light themes alike. */
const DEHUB_TINT = { backgroundImage: 'linear-gradient(color-mix(in srgb, currentColor 9%, transparent), color-mix(in srgb, currentColor 9%, transparent))' };
const MARK_TONE: Record<Mark, string> = {
  yes: 'text-emerald-500',
  partial: 'text-amber-500',
  no: 'text-rose-500/80',
  unknown: 'text-zinc-400 opacity-40',
};

export default function ComparePage() {
  const { t } = useTranslation();
  const copy = (key: string, fallback: string, vars: Record<string, string | number> = {}) => t(`comparison.${key}`, { defaultValue: fallback, ...vars });
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const view: View = params.get('view') === 'social' || params.get('view') === 'lacks' ? params.get('view') as View : 'all';
  const [open, setOpen] = useState<ComparisonFeature | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => filterFeatures(query, 'all').filter(feature => inView(feature, view)), [query, view]);
  const totals = useMemo(() => (query || view !== 'all' ? featureTotals(filtered) : ALL_TOTALS), [filtered, query, view]);
  const groups = useMemo(() => CATEGORIES.map(category => {
    const rows = filtered.filter(f => f.category === category);
    return { category, rows, totals: featureTotals(rows) };
  }).filter(g => g.rows.length), [filtered]);
  const allCollapsed = groups.length > 0 && groups.every(g => collapsed.has(g.category));
  const toggleGroup = (category: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(category)) next.delete(category); else next.add(category);
    return next;
  });
  const social = useMemo(() => featureTotals(FEATURES.filter(feature => inView(feature, 'social'))), []);
  const socialCount = FEATURES.filter(feature => inView(feature, 'social')).length;
  const lacking = FEATURES.filter(feature => inView(feature, 'lacks')).length;
  const rivals = COLUMNS.filter(c => c.id !== 'dehub');
  const runnerUp = rivals.reduce((top, c) => (ALL_TOTALS[c.id].yes > ALL_TOTALS[top.id].yes ? c : top), rivals[0]);
  const socialRunnerUp = rivals.reduce((top, c) => (social[c.id].yes > social[top.id].yes ? c : top), rivals[0]);
  const best = Math.max(...COLUMNS.map(c => totals[c.id].yes), 1);
  const markLabel: Record<Mark, string> = {
    yes: copy('markYes', 'Has it'),
    partial: copy('markPartial', 'Partly, or through a separate app'),
    no: copy('markNo', 'Not offered'),
    unknown: copy('markUnknown', 'Not found in their docs'),
  };
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  };
  const setView = (value: View) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('view'); else next.set('view', value);
    setParams(next, { replace: true });
  };
  const views: { id: View; label: string }[] = [
    { id: 'all', label: copy('viewAll', 'All features') },
    { id: 'social', label: copy('viewSocial', 'Social only') },
    { id: 'lacks', label: copy('viewLacks', 'What DeHub lacks') },
  ];

  return (
    <>
      <SEOHead
        title={copy('seoTitle', 'DeHub vs YouTube, X, TikTok, Twitch and more: every feature compared')}
        description={copy('seoDescription', `One chart of ${FEATURES.length} features across DeHub, YouTube, X, Kick, Twitch, Facebook, Instagram, TikTok, Rumble, Mastodon, Bluesky and Farcaster. See who has the most.`)}
        url="https://dehub.io/compare"
        image="https://dehub.io/og/compare.jpg"
      />
      <PageIsland title={copy('title', 'Compare DeHub')} icon="glossary" back backFallback="/">
        <input type="search" aria-label={copy('search', 'Search features')} placeholder={copy('search', 'Search features')} value={query} onChange={event => setQuery(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
      </PageIsland>
      <PageBody>
        <PageSection>
          <h2 className="text-2xl font-semibold tracking-tight text-white">{copy('matrixHeadline', 'Who has the most features?')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {copy('matrixIntroRival', '{{count}} features, gathered from every platform’s own help pages, not only from DeHub’s list. DeHub has {{dehub}} ({{dehubShare}}), and {{rival}} is next with {{rivalCount}} ({{rivalShare}}). DeHub still lacks {{lacking}} of them.', {
              count: FEATURES.length, dehub: ALL_TOTALS.dehub.yes, dehubShare: percent(ALL_TOTALS.dehub.yes, FEATURES.length),
              rival: runnerUp.name, rivalCount: ALL_TOTALS[runnerUp.id].yes, rivalShare: percent(ALL_TOTALS[runnerUp.id].yes, FEATURES.length), lacking,
            })}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {copy('matrixSocialNote', 'About {{editor}} rows are DeHub’s built-in editor, design, chart and presentation tools, which the others ship as separate apps or not at all. Leave them out and it is {{dehub}} of {{count}} for DeHub against {{rivalCount}} for {{rival}}.', {
              editor: FEATURES.length - socialCount, dehub: social.dehub.yes, count: socialCount, rival: socialRunnerUp.name, rivalCount: social[socialRunnerUp.id].yes,
            })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={copy('viewLabel', 'Which features to show')}>
            {views.map(option => (
              <button key={option.id} type="button" aria-pressed={view === option.id} onClick={() => setView(option.id)} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', view === option.id ? 'border-white bg-white text-black' : 'border-white/15 text-zinc-300 hover:border-white/40 hover:text-white')}>
                {view === option.id && <svg viewBox="0 0 16 16" className="-ml-0.5 mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {option.label}
              </button>
            ))}
            <button type="button" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(g => g.category)))} className="ml-auto rounded-full px-2 py-1 text-xs text-zinc-400 underline-offset-4 hover:text-white hover:underline">
              {allCollapsed ? copy('expandAll', 'Open all sections') : copy('collapseAll', 'Close all sections')}
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-400">
            {(['yes', 'partial', 'no', 'unknown'] as Mark[]).map(mark => (
              <li key={mark} className="flex items-center gap-1.5"><span className={cn('grid h-4 w-4 place-items-center', MARK_TONE[mark])}><MarkGlyph mark={mark} /></span>{markLabel[mark]}</li>
            ))}
          </ul>
        </PageSection>

        {filtered.length === 0 ? (
          <PageEmpty icon="search" title={copy('empty', 'No matching features')} body={copy('emptyBody', 'Try another word.')} action={<KitButton onClick={() => setParams(new URLSearchParams(), { replace: true })}>{copy('reset', 'Clear search')}</KitButton>} />
        ) : (
          <div data-compare-matrix data-kit-flat-skip className="relative max-h-[calc(100dvh-9.5rem)] overflow-auto overscroll-x-contain rounded-xl border border-white/10 bg-zinc-950 lg:max-h-[calc(100dvh-7rem)]">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-30 w-[136px] min-w-[136px] border-b border-r border-white/10 bg-zinc-950 px-3 py-2 text-left align-bottom text-[11px] font-medium text-zinc-400 sm:w-[190px] sm:min-w-[190px]">
                    {filtered.length} {copy('features', 'features')}
                  </th>
                  {COLUMNS.map(col => {
                    const total = totals[col.id];
                    const dehub = col.id === 'dehub';
                    return (
                      <th key={col.id} scope="col" title={col.name} className={cn('sticky top-0 z-20 w-[58px] min-w-[58px] border-b border-white/10 px-1 pb-2 pt-2.5 align-bottom font-normal', 'bg-zinc-950')} style={dehub ? DEHUB_TINT : undefined}>
                        <div className="flex flex-col items-center gap-1">
                          <span className={cn('grid h-7 w-7 place-items-center rounded-full', dehub ? 'bg-white text-black' : 'bg-white/[0.08] text-white')}>
                            <BrandMark id={col.id} className={dehub ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
                          </span>
                          <span className={cn('max-w-[54px] truncate text-[10px] leading-none', dehub ? 'font-semibold text-white' : 'text-zinc-400')}>{col.short}</span>
                          <span className={cn('tabular-nums leading-none', dehub ? 'text-[15px] font-bold text-white' : 'text-[13px] font-semibold text-zinc-200')}>{total.yes}</span>
                          <span className="text-[9.5px] tabular-nums leading-none text-zinc-500" title={copy('shareHint', 'Share of every feature in the chart')}>{percent(total.yes, filtered.length)}</span>
                          <span className="block h-1 w-9 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                            <span className={cn('block h-full rounded-full', dehub ? 'bg-emerald-500' : 'bg-white/45')} style={{ width: `${Math.max(4, (total.yes / best) * 100)}%` }} />
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <Fragment key={group.category}>
                    <tr>
                      <th scope="rowgroup" className="sticky left-0 z-10 border-b border-r border-white/10 bg-zinc-900 p-0 text-left">
                        <button type="button" aria-expanded={!collapsed.has(group.category)} onClick={() => toggleGroup(group.category)} className="flex w-full items-center gap-1.5 px-3 pb-1.5 pt-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-400 hover:text-white">
                          <svg viewBox="0 0 16 16" className={cn('h-3 w-3 shrink-0 transition-transform', collapsed.has(group.category) && '-rotate-90')} aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <span className="min-w-0 flex-1">{group.category}</span>
                          <span className="font-normal normal-case tracking-normal text-zinc-500">{group.rows.length}</span>
                        </button>
                      </th>
                      {COLUMNS.map(col => (
                        <td key={col.id} className="border-b border-white/10 bg-zinc-900 px-1 pb-1.5 pt-3 text-center text-[11px] tabular-nums text-zinc-400" style={col.id === 'dehub' ? DEHUB_TINT : undefined} title={`${col.name}: ${group.totals[col.id].yes} / ${group.rows.length}`}>
                          {group.totals[col.id].yes}
                        </td>
                      ))}
                    </tr>
                    {!collapsed.has(group.category) && group.rows.map(feature => (
                      <tr key={feature.id} className="group">
                        <th scope="row" className="sticky left-0 z-10 border-b border-r border-white/10 bg-zinc-950 p-0 text-left font-normal group-hover:bg-zinc-900">
                          <button type="button" onClick={() => setOpen(feature)} className="block w-full px-3 py-2 text-left text-[12.5px] leading-snug text-white sm:text-[13px]">
                            {feature.name}
                          </button>
                        </th>
                        {COLUMNS.map(col => {
                          const entry = entryFor(feature, col.id);
                          const mark = markFor(entry);
                          return (
                            <td key={col.id} className={cn('border-b border-white/10 p-0 text-center group-hover:bg-white/[0.04]')} style={col.id === 'dehub' ? DEHUB_TINT : undefined}>
                              <button type="button" onClick={() => setOpen(feature)} title={`${col.name}: ${markLabel[mark]}`} aria-label={`${feature.name}, ${col.name}: ${markLabel[mark]}`} className={cn('grid h-9 w-full place-items-center', MARK_TONE[mark])}>
                                <MarkGlyph mark={mark} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PageSection className="mt-3">
          <details className="text-sm text-zinc-400">
            <summary className="cursor-pointer font-medium text-white">{copy('method', 'How to read this chart')}</summary>
            <div className="mt-3 space-y-3 leading-relaxed">
              <p>{copy('rivalMethod', 'How the list was built: we went through each platform’s own help centre, creator, premium, ads and developer pages and listed what they offer, then ticked every platform, DeHub included, against the whole list. DeHub gets a cross wherever it lacks something. Rival rows link to the help page they came from.')}</p>
              <p>{copy('matrixMethod', 'A tick means the platform documents the feature, sometimes with conditions such as eligibility or region. A half circle means it is only available through a separate app or has been announced. A cross means their docs say it is not offered. A dot means we could not find it in their official docs, which is not proof it is missing. Tap any feature for the details and sources.')}</p>
              <p>{copy('parity', 'DeHub web, Android and iOS capabilities differ. The iOS app does not offer crypto purchases or reward actions.')}</p>
              <p>{copy('peerReviewDate', 'Competitor documentation reviewed:')} {COMPETITOR_REVIEWED_ON}</p>
              <a href="/feedback" className="inline-block underline underline-offset-4">{copy('correction', 'Suggest a correction')}</a>
            </div>
          </details>
        </PageSection>
      </PageBody>

      <Dialog open={!!open} onOpenChange={value => { if (!value) setOpen(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">{open.name}</DialogTitle>
                <DialogDescription>{open.category}</DialogDescription>
              </DialogHeader>
              <ul className="space-y-3">
                {COLUMNS.map(col => {
                  const entry = entryFor(open, col.id);
                  const mark = markFor(entry);
                  const source = entry.source ? SOURCES[entry.source] : undefined;
                  return (
                    <li key={col.id} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white"><BrandMark id={col.id} className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-white">{col.name}<span className={cn('grid h-4 w-4 place-items-center', MARK_TONE[mark])}><MarkGlyph mark={mark} /></span><span className="text-xs font-normal text-zinc-400">{copy(`status.${entry.status}`, STATUS_LABELS[entry.status])}</span></p>
                        {mark !== 'unknown' && <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{entry.note}</p>}
                        {col.id === 'dehub' && open.iosRestricted && <p className="mt-0.5 text-xs text-zinc-400">{copy('ios', 'Purchase and reward actions are unavailable in the iOS app.')}</p>}
                        {source && mark !== 'unknown' && <a className="mt-0.5 inline-block text-xs text-zinc-300 underline underline-offset-4 hover:text-white" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
