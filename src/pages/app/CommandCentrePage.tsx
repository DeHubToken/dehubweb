import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OverviewTab } from '@/components/app/command-centre/OverviewTab';
import { SubscriptionsTab } from '@/components/app/command-centre/SubscriptionsTab';
import { TransactionsTab } from '@/components/app/command-centre/TransactionsTab';

export default function CommandCentrePage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-2 sm:p-3 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Command Center</h1>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList className="bg-zinc-900 border border-zinc-800 h-10">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="subscriptions" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
            >
              Subscriptions
            </TabsTrigger>
            <TabsTrigger 
              value="transactions" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
            >
              Transactions
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'subscriptions' && <SubscriptionsTab />}
      {activeTab === 'transactions' && <TransactionsTab />}
    </div>
  );
}
