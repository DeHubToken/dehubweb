/**
 * TV Page
 * =======
 * Dedicated page for browsing all TV channels.
 * 
 * @module pages/app/TVPage
 */

import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/app/PageHeader';
import { LiveTVSection } from '@/components/app/tv';

export default function TVPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen">
      <PageHeader title={t('tv.title')} />
      <div className="p-2 sm:p-3">
        <LiveTVSection />
      </div>
    </div>
  );
}
