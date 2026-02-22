import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { FundActions } from '@/components/app/command-centre/FundActions';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Button } from '@/components/ui/button';

export default function CommandCentrePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

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

      <Button
        variant="glass"
        className="w-full mt-4 py-4 rounded-xl gap-2 text-white"
        onClick={() => navigate('/app/wallet')}
      >
        <Wallet className="w-5 h-5" />
        Wallet
      </Button>
    </div>
  );
}
