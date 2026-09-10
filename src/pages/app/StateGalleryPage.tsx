import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppState } from '@/components/app/AppState';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import { useAppTheme } from '@/contexts/ThemeContext';

const THEMES = [
  'system', 'minimal', 'cosmic', 'hazy', 'swarms',
  'lavalamp', 'winter', 'war', 'osaka', 'jungle',
] as const;

const ICONS: ThemeIconKey[] = [
  'posts', 'images', 'videos', 'audio', 'messages', 'communities',
  'subscriptions', 'events', 'bookmarks', 'search', 'notifications', 'lock',
  'superpowers', 'dao', 'staking', 'bridge', 'buy',
];

export default function StateGalleryPage() {
  const { theme, setTheme } = useAppTheme();
  const [params, setParams] = useSearchParams();
  const requestedTheme = params.get('theme');

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

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Semantic icon family</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {ICONS.map((icon) => (
              <div key={icon} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <ThemedIcon icon={icon} alt="" className="h-12 w-12 object-contain" />
                <span className="max-w-full truncate text-[10px] capitalize text-zinc-500">{icon}</span>
              </div>
            ))}
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
