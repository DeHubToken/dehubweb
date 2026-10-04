import { useTranslation } from 'react-i18next';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';

export default function CommandCentrePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthGate description="Log in to access your wallet and manage your funds." />;
  }

  return (
    <div data-command-centre-page className="min-h-screen">
      <SEOHead title="Command — Your Dashboard & Wallet" description="Your command centre on DeHub. Manage your wallet, track balances, and oversee your account in one dashboard." url="https://dehub.io/app/command-centre" />
      <h1 className="sr-only">DeHub Command — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      <PageIsland icon="command" title={t('commandCentre.title')} />

      <PageBody>
        <OverviewTab />
      </PageBody>
    </div>
  );
}
