import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Coins, Heart, Lock, Sparkles, Trophy, ShoppingBag, PieChart, ArrowRightLeft } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenOverview = () => {
  const { t } = useLanguage();

  const useCases = [
    { icon: Heart, title: t('tokenOverview.useTippingTitle'), desc: t('tokenOverview.useTippingDesc') },
    { icon: Lock, title: t('tokenOverview.useContentTitle'), desc: t('tokenOverview.useContentDesc') },
    { icon: Trophy, title: t('tokenOverview.useRewardsTitle'), desc: t('tokenOverview.useRewardsDesc') },
    { icon: Sparkles, title: t('tokenOverview.useAiTitle'), desc: t('tokenOverview.useAiDesc') },
    { icon: ShoppingBag, title: t('tokenOverview.useCommerceTitle'), desc: t('tokenOverview.useCommerceDesc') },
    { icon: Coins, title: t('tokenOverview.useFeesTitle'), desc: t('tokenOverview.useFeesDesc') },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenOverview.title')}</h1>
        <h2 className="text-2xl font-semibold text-muted-foreground mb-6">{t('tokenOverview.subtitle')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenOverview.howItWorksTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.howItWorksDesc1')}</p>
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.howItWorksDesc2')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenOverview.useCasesTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {useCases.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start space-x-3">
                <Icon className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground mb-1">{title}</p>
                  <p className="text-muted-foreground leading-relaxed text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <PieChart className="w-5 h-5 flex-shrink-0" />
            {t('tokenOverview.profitShareTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.profitShareDesc1')}</p>
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.profitShareDesc2')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 flex-shrink-0" />
            {t('tokenOverview.pegTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.pegDesc1')}</p>
          <p className="text-muted-foreground leading-relaxed">{t('tokenOverview.pegDesc2')}</p>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('tokenOverview.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenOverview.disclaimerNoApy')}</p>
          <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenOverview.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenOverview;
