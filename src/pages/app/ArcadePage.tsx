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
 * Cards use each game's approved branding when available, otherwise a capture.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Swords, Upload } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { IslandAction, PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { SEOHead } from '@/components/SEOHead';
import { ArcadeLeaderboard } from '@/components/app/arcade/ArcadeLeaderboard';
import { ArcadeSubmissionForm } from '@/components/app/arcade/ArcadeSubmissionForm';
import { useAuth } from '@/contexts/AuthContext';
import { ARCADE_GAMES, type ArcadeGame } from '@/config/arcade-games';

/** The games that are a competition, in registry order. */
const RANKED_GAMES = ARCADE_GAMES.filter((game) => game.leaderboard);

function GameCard({ game }: { game: ArcadeGame }) {
  // Reduced motion gets the clip's poster as a plain image, never the loop.
  const reduceMotion = useReducedMotion();
  return (
    <div
      data-feed-item
      className="group flex flex-col overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06] transition-colors hover:ring-white/[0.14]"
    >
      <Link to={`/arcade/${game.slug}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
        <div className="relative aspect-video overflow-hidden bg-black">
          {!game.brand && game.artVideo && !reduceMotion ? (
            <video
              src={game.artVideo}
              poster={game.art}
              aria-label={game.artAlt}
              width={1280}
              height={720}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <img
              src={game.brand ?? game.art}
              alt={game.brand ? game.title : game.artAlt}
              width={1280}
              height={720}
              // Every card is above the fold on a desktop grid of three, so
              // lazy-loading them only delays the one thing the page is for.
              loading="eager"
              decoding="async"
              className={`h-full w-full ${game.brand ? 'object-contain' : 'object-cover'} transition-transform duration-500 group-hover:scale-[1.03]`}
            />
          )}
          {/* Keeps the title legible over whatever the capture happens to be. */}
          {!game.brand && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />}
          <div className={game.brand ? 'sr-only' : 'pointer-events-none absolute inset-x-0 bottom-0 p-4'}>
            <h2 className="text-lg font-semibold leading-tight text-white">{game.title}</h2>
          </div>
        </div>
      </Link>

      {/* flex-1 + mt-auto below: every card in a grid row stretches to the same
          height, and the button rides the bottom edge, so the Play buttons line
          up across the row. The registry keeps the descriptions to a matching
          length, so that alignment holds without the stretch having to absorb a
          ragged block of copy. */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-xs leading-relaxed text-zinc-400">{game.description}</p>

        <div className="mt-auto flex flex-col gap-2">
          <Link
            to={`/arcade/${game.slug}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
          >
            {game.slug === 'trenchstar' ? <img src="/trenchstar-game/icons/play.svg" width={24} height={24} alt="" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" />}
            {game.action}
          </Link>
          {game.onlineHref ? (
            <Link
              to={game.onlineHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <Swords className="h-3.5 w-3.5" />
              Wager
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ArcadePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const submissionOpen = searchParams.get('submit') === '1';
  const openSubmission = () => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set('submit', '1'); return next; });
  const closeSubmission = () => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete('submit'); return next; });
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [board, setBoard] = useState(RANKED_GAMES[0]?.slug ?? '');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('arcade.seoTitle')}
        description={t('arcade.seoDescription')}
        // The same card CLOUDFLARE_WORKER_SEO.js serves crawlers for /arcade.
        // Both variants must name one image: the worker declares it 1200x630,
        // and a scraper that ran the SPA instead would inherit that claim for
        // whatever this said.
        image="https://dehub.io/og/arcade.jpg"
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

      <PageIsland
        className="mx-auto max-w-4xl"
        icon="arcade"
        title={t('arcade.title')}
        actions={
          <IslandAction label="Submit a game" onClick={openSubmission}>
            <Upload className="h-[18px] w-[18px]" />
          </IslandAction>
        }
      >
        <p className="text-xs leading-relaxed text-zinc-400">
          {t('arcade.intro')}
        </p>
      </PageIsland>

      <PageBody className="mx-auto max-w-4xl">
        {/* Three to a row on desktop, and the equal-height cards put every Play
            button on the same baseline within a row. Deliberately not widened
            to four when the fourth game arrived: at this max-width that leaves
            each capture about 200px across, which is too small to read as a
            game rather than a thumbnail. A short second row is the cheaper
            trade. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ARCADE_GAMES.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>

        {/* The boards, under the games rather than above them: somebody who has
            not played yet wants the grid, and somebody who has knows to scroll.

            One switcher rather than two stacked boards. They are different
            games measured in different units — a chess rating and a distance
            down a street have no shared axis — so showing them side by side
            would invite a comparison that means nothing. */}
        {RANKED_GAMES.length > 0 ? (
          <section data-feed-item data-kit-section className="bg-zinc-900/60 p-4 ring-1 ring-white/[0.06]">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {RANKED_GAMES.map((game) => (
                <button
                  key={game.slug}
                  type="button"
                  onClick={() => setBoard(game.slug)}
                  aria-pressed={board === game.slug}
                  data-filter-chip
                  data-active={board === game.slug ? 'true' : 'false'}
                  className={
                    board === game.slug
                      ? 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black'
                      : 'rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700'
                  }
                >
                  {game.title}
                </button>
              ))}
            </div>
            <ArcadeLeaderboard slug={board} wallet={wallet} limit={10} />
          </section>
        ) : null}
      </PageBody>
      {submissionOpen && <ArcadeSubmissionForm onClose={closeSubmission} />}
    </div>
  );
}
