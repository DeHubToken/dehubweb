import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Music Page
 * ==========
 * The public /music page: the same audio chart, music videos, radio and
 * stages as Home's Music tab, all from live data.
 *
 * @module pages/app/MusicPage
 */

import { useLocation, useSearchParams } from 'react-router-dom';
import { MusicFeed } from '@/components/app/feeds/MusicFeed';
import { SEOHead } from '@/components/SEOHead';

export default function MusicPage() {
  const { t: _copy } = _useCopy();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Home's radio carousel links to /music?tab=radio. MusicFeed follows the
  // param on every arrival, because this page stays mounted in
  // PersistentPageCache once visited.
  const onThisPage = location.pathname === '/music' || location.pathname === '/app/music';
  const tab = onThisPage ? searchParams.get('tab') : null;

  return (
    <div className="min-h-screen">
      <SEOHead title={_copy("copy.19760ad09dcb", { defaultValue: "Music: Listen & Discover on Riftn" })} description={_copy("copy.26458fb449be", { defaultValue: "Stream music, discover new artists, listen to live radio and watch music videos on Riftn, the decentralized open source media platform." })} url="https://riftn.com/music" jsonLd={{ '@context': 'https://schema.org', '@type': 'MusicPlaylist', name: 'Riftn Music', url: 'https://riftn.com/music', description: _copy("copy.ad1dab0c852d", { defaultValue: "Stream music, discover artists and listen to radio on Riftn." }) }} />
      <h1 className="sr-only">{_copy("copy.cc474c95c93b", { defaultValue: "Riftn Music — Decentralised Social Media, Censorship Resistant & Freedom of Speech" })}</h1>
      <MusicFeed showFilters tab={tab} tabRequest={location.key} />
    </div>
  );
}
