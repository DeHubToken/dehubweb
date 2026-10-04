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
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { LiveTVSection } from '@/components/app/tv';
import { scrollDocumentTo } from '@/lib/document-scroll';

export default function TVPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    scrollDocumentTo(0);
  }, []);

  return (
    <div className="min-h-screen">
      <SEOHead title={t('tv.seoTitle')} description={t('tv.seoDescription')} url="https://dehub.io/app/tv" jsonLd={{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'DeHub Live TV', url: 'https://dehub.io/app/tv', applicationCategory: 'EntertainmentApplication', description: 'Watch free live TV channels from around the world.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, operatingSystem: 'Web' }} />
      <h1 className="sr-only">{t('tv.srHeading')}</h1>
      <PageIsland back icon="tv" title={t('tv.title')} />
      <PageBody>
        <LiveTVSection />
      </PageBody>
    </div>
  );
}
