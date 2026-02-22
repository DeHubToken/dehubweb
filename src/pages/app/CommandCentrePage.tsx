import { useTranslation } from 'react-i18next';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { FundActions } from '@/components/app/command-centre/FundActions';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';

export default function CommandCentrePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthGate description="Log in to access your wallet and manage your funds." />;
  }

  return (
    <div className="p-2 sm:p-3 pt-2 lg:pt-3 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[1.1rem] sm:text-[1.32rem] font-bold text-white">{t('commandCentre.title')}</h1>
        <FundActions />
      </div>

      <OverviewTab />
    </div>
  );
}
