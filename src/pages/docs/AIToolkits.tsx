import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, MessageSquare, DollarSign, TrendingUp, Globe, Search } from 'lucide-react';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from '@/contexts/LanguageContext';

const AIToolkits = () => {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('aiToolkits.title')}</h1>
        <OptimizedImage src="/lovable-uploads/305d0557-94f8-46fe-b44e-b6b3a810d434.png" alt="DeHub AI interface showing tools and chat bot functionality" className="w-full rounded-lg shadow-lg mb-6" />
        <p className="text-lg text-muted-foreground leading-relaxed">{t('aiToolkits.subtitle')}</p>
      </div>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground flex items-center space-x-2">
            <Bot className="w-5 h-5 text-foreground" />
            <span>{t('aiToolkits.assistantTitle')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed mb-4">{t('aiToolkits.assistantDesc')}</p>
          <div className="text-sm text-muted-foreground">{t('aiToolkits.featuresInclude')}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { icon: MessageSquare, iconColor: 'text-foreground', title: t('aiToolkits.contentCreation'), desc: t('aiToolkits.contentCreationDesc') },
          { icon: Bot, iconColor: 'text-foreground', title: t('aiToolkits.automatedEngagement'), desc: t('aiToolkits.automatedEngagementDesc') },
          { icon: DollarSign, iconColor: 'text-foreground', title: t('aiToolkits.financeManagement'), desc: t('aiToolkits.financeManagementDesc') },
          { icon: TrendingUp, iconColor: 'text-foreground', title: t('aiToolkits.performanceAnalytics'), desc: t('aiToolkits.performanceAnalyticsDesc') },
          { icon: Globe, iconColor: 'text-foreground', title: t('aiToolkits.globalTranslation'), desc: t('aiToolkits.globalTranslationDesc') },
          { icon: Search, iconColor: 'text-foreground', title: t('aiToolkits.contentAnalysis'), desc: t('aiToolkits.contentAnalysisDesc') },
        ].map((item, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                <span>{item.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('aiToolkits.comingSoon')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{t('aiToolkits.comingSoonDesc')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIToolkits;
