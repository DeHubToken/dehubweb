import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { SubscriptionsTab } from '@/components/app/command-centre/SubscriptionsTab';
import { TransactionsTab } from '@/components/app/command-centre/TransactionsTab';

const tabs = [
  { value: 'overview', labelKey: 'commandCentre.overview' },
  { value: 'subscriptions', labelKey: 'commandCentre.subscriptions' },
  { value: 'transactions', labelKey: 'commandCentre.transactions' },
] as const;

export default function CommandCentrePage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { t } = useTranslation();

  return (
    <div className="p-2 sm:p-3 pt-2 lg:pt-3 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('commandCentre.title')}</h1>
        <div className="flex gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-full sm:w-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`relative flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="command-centre-tab"
                    className="absolute inset-0 rounded-md bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'subscriptions' && <SubscriptionsTab />}
      {activeTab === 'transactions' && <TransactionsTab />}
    </div>
  );
}
