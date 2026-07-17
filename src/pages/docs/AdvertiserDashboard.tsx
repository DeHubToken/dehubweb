import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Users, DollarSign, Target, Plus, Eye } from 'lucide-react';
import CampaignCreator from '@/components/advertising/CampaignCreator';
import CampaignAnalytics from '@/components/advertising/CampaignAnalytics';
import BudgetCalculator from '@/components/advertising/BudgetCalculator';
import { useLanguage } from '@/contexts/LanguageContext';

const AdvertiserDashboard = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview');

  const activeCampaigns = [
    { id: 1, name: 'Q4 Token Launch', status: 'Active', spend: '$2,450', impressions: '125K', ctr: '3.2%' },
    { id: 2, name: 'DeFi Protocol Beta', status: 'Active', spend: '$1,850', impressions: '89K', ctr: '4.1%' },
    { id: 3, name: 'NFT Collection Drop', status: 'Paused', spend: '$950', impressions: '45K', ctr: '2.8%' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-royal-blue font-exo mb-2">{t('advertiserDashboard.title')}</h1>
          <p className="text-royal-blue/80">{t('advertiserDashboard.subtitle')}</p>
        </div>
        <Button className="bg-middle-blue hover:bg-middle-blue/90 text-white" onClick={() => setActiveTab('create')}>
          <Plus className="w-4 h-4 mr-2" />
          {t('advertiserDashboard.newCampaign')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{t('advertiserDashboard.totalSpend')}</p><p className="text-2xl font-bold text-royal-blue">$5,250</p></div><DollarSign className="w-8 h-8 text-middle-blue" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{t('advertiserDashboard.impressions')}</p><p className="text-2xl font-bold text-royal-blue">259K</p></div><Eye className="w-8 h-8 text-middle-blue" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{t('advertiserDashboard.avgCtr')}</p><p className="text-2xl font-bold text-royal-blue">3.4%</p></div><Target className="w-8 h-8 text-middle-blue" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{t('advertiserDashboard.roas')}</p><p className="text-2xl font-bold text-royal-blue">4.2x</p></div><TrendingUp className="w-8 h-8 text-middle-blue" /></div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t('advertiserDashboard.overview')}</TabsTrigger>
          <TabsTrigger value="create">{t('advertiserDashboard.createCampaign')}</TabsTrigger>
          <TabsTrigger value="analytics">{t('advertiserDashboard.analytics')}</TabsTrigger>
          <TabsTrigger value="calculator">{t('advertiserDashboard.budgetCalculator')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('advertiserDashboard.activeCampaigns')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeCampaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold text-royal-blue">{campaign.name}</h3>
                      <p className="text-sm text-muted-foreground">{t('advertiserDashboard.status')}: {campaign.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{campaign.spend}</p>
                      <p className="text-sm text-muted-foreground">{campaign.impressions} {t('advertiserDashboard.impressions').toLowerCase()} • {campaign.ctr} CTR</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="create"><CampaignCreator /></TabsContent>
        <TabsContent value="analytics"><CampaignAnalytics /></TabsContent>
        <TabsContent value="calculator"><BudgetCalculator /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvertiserDashboard;
