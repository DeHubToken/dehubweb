import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Shield, TrendingUp, AlertTriangle, DollarSign, Bot, TrendingDown, BarChart3, Target, Calculator } from 'lucide-react';
import AdvertisingPricing from '@/components/AdvertisingPricing';
import CampaignCreator from '@/components/advertising/CampaignCreator';
import CampaignAnalytics from '@/components/advertising/CampaignAnalytics';
import BudgetCalculator from '@/components/advertising/BudgetCalculator';
import { useLanguage } from '@/contexts/LanguageContext';

const Advertising = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('advertising.title')}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('advertising.subtitle')}</p>
      </div>

      {/* Live product CTA â€” the self-serve POVR Ads Manager */}
      <Card className="border-foreground/15 bg-foreground/[0.04]">
        <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">POVR Ads Manager is live</h3>
            <p className="text-sm text-muted-foreground">
              Create campaigns, target badge tiers, fund with DHB and track results in real time.
            </p>
          </div>
          <Link
            to="/app/ads"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground border border-foreground/10 transition-colors shrink-0"
          >
            Open Ads Manager â†’
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Eye className="w-5 h-5 text-primary" />
            <span>{t('advertising.povrTitle')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('advertising.povrDesc1')}</p>
          <p className="text-muted-foreground">{t('advertising.povrDesc2')}</p>
          <p className="text-muted-foreground">{t('advertising.povrDesc3')}</p>
          <p className="text-muted-foreground">{t('advertising.povrDesc4')}</p>
          <p className="text-muted-foreground font-semibold">{t('advertising.povrDesc5')}</p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <span>{t('advertising.problemTitle')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            {t('advertising.problemDesc')} <span className="font-semibold text-destructive">{t('advertising.problemAmount')}</span>{t('advertising.problemDesc2')}
          </p>
          
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-destructive" />
              {t('advertising.keyFigures')}
            </h4>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li className="flex items-start gap-2"><span className="text-destructive font-medium">{t('advertising.costs2023')}</span> {t('advertising.costs2023Desc')}</li>
              <li className="flex items-start gap-2"><span className="text-destructive font-medium">{t('advertising.projections2024')}</span> {t('advertising.projections2024Desc')}</li>
              <li className="flex items-start gap-2"><span className="text-destructive font-medium">{t('advertising.futureGrowth')}</span> {t('advertising.futureGrowthDesc')}</li>
              <li className="flex items-start gap-2"><span className="text-destructive font-medium">{t('advertising.spendLost')}</span> {t('advertising.spendLostDesc')}</li>
              <li className="flex items-start gap-2"><span className="text-destructive font-medium">{t('advertising.impact')}</span> {t('advertising.impactDesc')}</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-destructive" />
              {t('advertising.whyCostly')}
            </h4>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li><span className="font-medium">{t('advertising.sophisticatedBots')}</span> {t('advertising.sophisticatedBotsDesc')}</li>
              <li><span className="font-medium">{t('advertising.incentives')}</span> {t('advertising.incentivesDesc')}</li>
              <li><span className="font-medium">{t('advertising.followMoney')}</span> {t('advertising.followMoneyDesc')}</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-destructive" />
              {t('advertising.consequences')}
            </h4>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li><span className="font-medium">{t('advertising.wastedBudget')}</span> {t('advertising.wastedBudgetDesc')}</li>
              <li><span className="font-medium">{t('advertising.skewedData')}</span> {t('advertising.skewedDataDesc')}</li>
              <li><span className="font-medium">{t('advertising.lostRoi')}</span> {t('advertising.lostRoiDesc')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span>{t('advertising.howItWorks')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('advertising.howItWorksDesc1')}</p>
          <p className="text-muted-foreground">{t('advertising.howItWorksDesc2')}</p>
          <p className="text-muted-foreground">{t('advertising.howItWorksDesc3')}</p>
          <p className="text-muted-foreground">{t('advertising.howItWorksDesc4')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-primary" />
            <span>{t('advertising.preventFraud')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('advertising.preventFraudDesc1')}</p>
          <p className="text-muted-foreground">{t('advertising.preventFraudDesc2')}</p>
        </CardContent>
      </Card>

      <AdvertisingPricing />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>{t('advertising.dashboardPreview')}</span>
          </CardTitle>
          <CardDescription>{t('advertising.dashboardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="creator" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="creator" className="flex items-center justify-center gap-2">
                <Target className="w-4 h-4" />
                <span className="hidden sm:inline">{t('advertising.campaignCreator')}</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center justify-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('advertising.analytics')}</span>
              </TabsTrigger>
              <TabsTrigger value="calculator" className="flex items-center justify-center gap-2">
                <Calculator className="w-4 h-4" />
                <span className="hidden sm:inline">{t('advertising.budgetCalculator')}</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="creator" className="mt-6">
              <CampaignCreator />
            </TabsContent>
            <TabsContent value="analytics" className="mt-6">
              <CampaignAnalytics />
            </TabsContent>
            <TabsContent value="calculator" className="mt-6">
              <BudgetCalculator />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Advertising;
