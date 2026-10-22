import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { LiveStudio } from '@/components/app/live/studio/LiveStudio';

/**
 * Live Studio — a creator's alerts and widgets for their live streams.
 */
export default function LiveStudioPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const seo = (
    <SEOHead
      title={t('liveStudio.seoTitle')}
      description={t('liveStudio.seoDescription')}
      url="https://dehub.io/live-studio"
      image="https://dehub.io/og/live-studio.jpg"
      jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: t('liveStudio.title'),
        url: 'https://dehub.io/live-studio',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web, Android, iOS',
        description: t('liveStudio.seoDescription'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }}
    />
  );

  if (!isAuthenticated) {
    return (
      <>
        {seo}
        <AuthGate description={t('liveStudio.signIn')} />
      </>
    );
  }

  return (
    <div data-live-studio-page className="min-h-screen">
      {seo}
      <h1 className="sr-only">{t('liveStudio.h1')}</h1>
      <PageIsland icon="live" title={t('liveStudio.title')} subtitle={t('liveStudio.subtitle')} back backFallback="/app/settings" />
      <PageBody>
        <LiveStudio />
      </PageBody>
    </div>
  );
}
