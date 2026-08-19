/**
 * TV Page
 * =======
 * Dedicated page for browsing all TV channels.
 * 
 * @module pages/app/TVPage
 */

import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PageHeader } from '@/components/app/PageHeader';
import { LiveTVSection } from '@/components/app/tv';
import { scrollDocumentTo } from '@/lib/document-scroll';

export default function TVPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    scrollDocumentTo(0);
  }, []);

  return (
    <div className="min-h-screen">
      <SEOHead title="Live TV — Free Channels From Around the World" description="Watch free live TV channels from around the world on DeHub. News, sports, entertainment and more — streamed in the browser, no subscription needed." url="https://dehub.io/app/tv" jsonLd={{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'DeHub Live TV', url: 'https://dehub.io/app/tv', applicationCategory: 'EntertainmentApplication', description: 'Watch free live TV channels from around the world.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, operatingSystem: 'Web' }} />
      <h1 className="sr-only">DeHub Live TV — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      <PageHeader title={t('tv.title')} />
      <div className="p-2 sm:p-3">
        <LiveTVSection />
      </div>
    </div>
  );
}
