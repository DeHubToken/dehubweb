import { useTranslation } from 'react-i18next';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { FundActions } from '@/components/app/command-centre/FundActions';

export default function CommandCentrePage() {
  const { t } = useTranslation();

  return (
    <div className="p-2 sm:p-3 pt-2 lg:pt-3 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('commandCentre.title')}</h1>
        <FundActions />
      </div>

      <OverviewTab />
    </div>
  );
}
