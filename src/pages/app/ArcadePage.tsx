/**
 * Arcade Page
 * ===========
 * The front door to every playable game in the app, at `/arcade`.
 *
 * Before this page the games were unlistable: each one was welded to a single
 * theme and only offered when a player pressed an arrow key while that theme
 * was active. Nothing enumerated them, so nobody who had not stumbled into the
 * War or Jungle theme knew they existed. This page reads `config/arcade-games`
 * and shows all of them, and the theme launchers stay exactly as they were — a
 * second, more theatrical way in.
 *
 * The cards carry real captures from the games rather than key art. A card that
 * promises more than the game delivers is worse than no card.
 */

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Play, Sparkles } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { ARCADE_GAMES, type ArcadeGame } from '@/config/arcade-games';

/** Copy for the "also lives in the <x> theme" line, keyed by theme id. */
const THEME_LABEL: Record<string, string> = {
  war: 'War theme',
  jungle: 'Jungle theme',
};

function GameCard({ game }: { game: ArcadeGame }) {
  const { t } = useTranslation();

  return (
    <div
      data-feed-item
      className="group overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06] transition-colors hover:ring-white/[0.14]"
    >
      <Link to={`/arcade/${game.slug}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
        <div className="relative aspect-video overflow-hidden bg-black">
          <img
            src={game.art}
            alt={game.artAlt}
            width={1280}
            height={720}
            // Every card is above the fold on a desktop grid of three, so
            // lazy-loading them only delays the one thing the page is for.
            loading="eager"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          {/* Keeps the title legible over whatever the capture happens to be. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <h2 className="text-lg font-semibold leading-tight text-white">{game.title}</h2>
            <p className="mt-0.5 text-xs text-zinc-300">{game.tagline}</p>
          </div>
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-zinc-400">{game.description}</p>

        <ul className="space-y-1">
          {game.controls.map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-zinc-500">
              {line}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Link
            to={`/arcade/${game.slug}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" />
            {game.action}
          </Link>

          {game.theme ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Sparkles className="h-3 w-3" />
              {t('arcade.alsoIn', { theme: THEME_LABEL[game.theme] ?? game.theme })}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ArcadePage() {
  const { t } = useTranslation();

  // Swallow the grid at the sticky header bento's top edge under the glass
  // themes, the same cut the home feed makes at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('arcade.seoTitle')}
        description={t('arcade.seoDescription')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'DeHub Arcade',
          url: 'https://dehub.io/arcade',
          hasPart: ARCADE_GAMES.map((game) => ({
            '@type': 'VideoGame',
            name: game.title,
            description: game.tagline,
            url: `https://dehub.io/arcade/${game.slug}`,
            image: `https://dehub.io${game.art}`,
            applicationCategory: 'Game',
            gamePlatform: 'Web browser',
            operatingSystem: 'Any',
          })),
        }}
      />

      <div
        data-feed-nav-outer
        className="sticky top-11 z-50 mx-auto max-w-4xl bg-black px-2 pb-0 pt-1 sm:px-3 sm:pt-1 lg:top-0 lg:pt-2"
      >
        <div data-page-bento className="space-y-2 rounded-2xl bg-zinc-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-6 w-6 text-white" />
            <h1 className="text-xl font-bold text-white">{t('arcade.title')}</h1>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            {t('arcade.intro')}
          </p>
        </div>
      </div>

      <div ref={contentRef} className="mx-auto max-w-4xl px-2 pb-24 pt-2 sm:px-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ARCADE_GAMES.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </div>
    </div>
  );
}
