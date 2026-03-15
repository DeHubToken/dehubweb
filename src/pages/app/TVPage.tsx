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

export default function TVPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen">
      <SEOHead title="TV" description="Watch free live TV channels from around the world on DeHub." url="https://dehub.io/app/tv" />
      <PageHeader title={t('tv.title')} />
      <div className="p-2 sm:p-3">
        <LiveTVSection />
      </div>
    </div>
  );
}
