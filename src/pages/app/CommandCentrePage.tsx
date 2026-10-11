import { useTranslation as _useCopy } from 'react-i18next';
import { useTranslation } from 'react-i18next';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';

export default function CommandCentrePage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthGate description={_copy("copy.0b215a003c68", { defaultValue: "Log in to access your wallet and manage your funds." })} />;
  }

  return (
    <div data-command-centre-page className="min-h-screen">
      <SEOHead title={_copy("copy.a2364c207356", { defaultValue: "Command — Your Dashboard & Wallet" })} description={_copy("copy.d97180b4753f", { defaultValue: "Your command centre on DeHub. Manage your wallet, track balances, and oversee your account in one dashboard." })} url="https://dehub.io/app/command-centre" />
      <h1 className="sr-only">{_copy("copy.064512ec24f9", { defaultValue: "DeHub Command — Decentralised Social Media, Censorship Resistant & Freedom of Speech" })}</h1>
      <PageIsland icon="command" title={t('commandCentre.title')} />

      <PageBody>
        <OverviewTab />
      </PageBody>
    </div>
  );
}
