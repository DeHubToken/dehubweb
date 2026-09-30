import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppState } from '@/components/app/AppState';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { SeedPhraseBackup } from '@/components/app/wallet-setup/SeedPhraseBackup';
import { BackupReminderCard } from '@/components/app/wallet/BackupReminderBanner';
import { badgeImage } from '@/lib/staking-badges';

const BadgeShowcase = lazy(() => import('@/components/app/badge-showcase/BadgeShowcase'));

// The standard public BIP-39 test vector: owns nothing, safe to show.
const SAMPLE_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const THEMES = [
  'system', 'minimal', 'light', 'cosmic', 'hazy', 'swarms',
  'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror',
] as const;

const ICONS: ThemeIconKey[] = [
  'accounts', 'ads', 'arcade', 'assistant', 'audio', 'bookmarks', 'boost', 'bounties',
  'bridge', 'buy', 'careers', 'command', 'comment-anchor', 'communities', 'dao', 'deep-current',
  'email', 'events', 'features', 'flak-jacket', 'fractions', 'front-row', 'glossary', 'governance',
  'harpoon', 'home', 'images', 'live', 'lock', 'messages', 'notifications', 'pinned',
  'posts', 'precision-strike', 'profile', 'search', 'second-wind', 'settings', 'signal-flare', 'stages',
  'staking', 'stats', 'stores', 'subscriptions', 'superpowers', 'team-up', 'timeline-bomber', 'trend-jacker',
  'trophy', 'tv', 'usernames', 'videos', 'wand',
];

export default function StateGalleryPage() {
  const { theme, setTheme } = useAppTheme();
  const [params, setParams] = useSearchParams();
  const requestedTheme = params.get('theme');
  const [presses, setPresses] = useState(0);
  const [badge, setBadge] = useState<{ anchor: HTMLElement | null; promote: boolean; first?: boolean } | null>(null);
  const press = () => setPresses((count) => count + 1);

  useEffect(() => {
    if (requestedTheme && THEMES.includes(requestedTheme as typeof THEMES[number]) && requestedTheme !== theme) {
      setTheme(requestedTheme);
    }
  }, [requestedTheme, setTheme, theme]);

  const chooseTheme = (nextTheme: typeof THEMES[number]) => {
    setTheme(nextTheme);
    setParams({ theme: nextTheme }, { replace: true });
  };

  return (
    <main
      id="app-root"
      data-theme-gallery={theme}
      data-glass-page
      className="relative z-10 min-h-screen px-5 py-8 text-white sm:px-8"
      style={theme === 'cosmic' ? {
        backgroundColor: '#03030a',
        backgroundImage: 'radial-gradient(circle at 75% 5%, rgb(77 47 145 / 0.28), transparent 42%), radial-gradient(circle at 10% 80%, rgb(21 89 123 / 0.22), transparent 38%)',
      } : undefined}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Universal app states</p>
            <h1 className="mt-2 text-3xl font-semibold capitalize">{theme} theme</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">
              One semantic system, with the icon material owned by the active theme.
            </p>
          </div>
          <div className="flex max-w-2xl flex-wrap justify-end gap-2">
            {THEMES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseTheme(item)}
                className={`rounded-full border px-3 py-1.5 text-xs capitalize backdrop-blur-xl transition ${
                  item === theme ? 'border-white/35 bg-white/15' : 'border-white/10 bg-white/5 text-zinc-500'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <section data-page-bento data-badge-gallery className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <h2 className="mb-3 text-sm font-semibold">Badge animations</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex items-center gap-2 p-2" onClick={event => setBadge({ anchor: event.currentTarget.querySelector('img'), promote: false })}>
              <img src={badgeImage('Ghost Lobster') ?? ''} alt="" className="h-10 w-10" /> Open badge
            </button>
            <button className="flex items-center gap-2 p-2" onClick={event => setBadge({ anchor: event.currentTarget.querySelector('img'), promote: true })}>
              <img src={badgeImage('Crab') ?? ''} alt="" className="h-10 w-10" /> Promote badge
            </button>
            <button className="p-2" onClick={() => setBadge({ anchor: null, promote: true, first: true })}>First badge</button>
          </div>
        </section>
        {badge && <Suspense fallback={null}>
          <BadgeShowcase tier={badge.first ? 'Crab' : 'Ghost Lobster'} anchor={badge.anchor}
            promotedFrom={badge.promote ? badge.first ? null : 'Crab' : undefined} onClose={() => setBadge(null)} />
        </Suspense>}

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Semantic icon family</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8" data-theme-icon-grid>
            {ICONS.map((icon) => (
              <div key={icon} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <ThemedIcon icon={icon} alt="" className="h-12 w-12 object-contain" />
                <span className="max-w-full truncate text-[10px] capitalize text-zinc-500">{icon}</span>
              </div>
            ))}
          </div>
        </section>

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <h2 className="mb-3 text-sm font-semibold">Theme controls</h2>
          <div className="flex flex-wrap items-center gap-3" data-theme-control-grid>
            <Button onClick={press}>Primary</Button>
            <Button variant="secondary" onClick={press}>Secondary</Button>
            <Button variant="outline" onClick={press}>Outline</Button>
            <Button variant="glass" onClick={press}>Glass</Button>
            <Button variant="ghost" onClick={press}>Ghost</Button>
            <Button variant="destructive" onClick={press}>Destructive</Button>
            <Button disabled>Disabled</Button>
            <button className="rounded-xl bg-white px-4 py-2 text-black" onClick={press}>Neutral white</button>
            <button className="rounded-xl bg-zinc-800 px-4 py-2 text-white" onClick={press}>Neutral zinc</button>
            <button className="rounded-xl bg-red-600 px-4 py-2 text-white" onClick={press}>Semantic red</button>
            <button className="rounded-xl px-4 py-2 hover:bg-white/10" onClick={press}>Bare action</button>
          </div>
          <output aria-live="polite" className="mt-3 block text-xs">Actions fired: {presses}</output>
        </section>

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4" data-wallet-backup-gallery>
          <h2 className="mb-3 text-sm font-semibold">Wallet backup</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="signup" onFinished={press} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="settings" onFinished={press} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="signup" initialStage="check" onFinished={press} />
            </div>
          </div>
          <div className="mt-5 max-w-xl">
            <BackupReminderCard onBackUp={press} onLater={press} />
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="communities"
              title="No communities yet"
              description="Communities you join will appear here."
              size="section"
              primaryAction={{ label: 'Explore communities', onClick: () => undefined }}
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="search"
              title="No results found"
              description="Try a different search or remove a filter."
              kind="search-empty"
              size="section"
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="notifications"
              title="Content could not load"
              description="Check your connection and try again."
              kind="error"
              size="section"
              primaryAction={{ label: 'Try again', onClick: () => undefined }}
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="lock"
              title="Approval pending"
              description="This content appears after your request is approved."
              kind="restricted"
              size="section"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
