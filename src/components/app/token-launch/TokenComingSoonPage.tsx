import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { SEOHead } from '@/components/SEOHead';
import { TokenLaunchNotify } from '@/components/app/token-launch/TokenLaunchNotify';

/**
 * Every place someone could buy, sell or swap the token (Buy Tokens, the DEX,
 * a DEX pool) shows this while the new token is not trading: "Token launching
 * soon" and a Notify me signup, nothing else.
 */
export function TokenComingSoonPage({ path, title }: { path: string; title?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const url = `https://riftn.com${path}`;
  return (
    <div className="min-h-screen" data-token-coming-soon-page>
      <SEOHead
        title={t('tokenLaunch.seoTitle')}
        description={t('tokenLaunch.seoDescription')}
        url={url}
        jsonLd={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Riftn token launching soon', url, isPartOf: { '@type': 'WebSite', name: 'Riftn', url: 'https://riftn.com' } }}
      />
      <h1 className="sr-only">{t('tokenLaunch.title')}</h1>
      <PageIsland back onBack={() => navigate(-1)} icon="buy" title={title ?? t('buyCoins.title')} />
      <PageBody className="max-w-lg mx-auto">
        <TokenLaunchNotify />
      </PageBody>
    </div>
  );
}
