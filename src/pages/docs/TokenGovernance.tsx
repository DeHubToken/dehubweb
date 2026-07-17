import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Vote, Users, Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenGovernance = () => {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenGovernance.title')}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('tokenGovernance.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center space-x-2">
            <Vote className="w-5 h-5 text-blue-500" />
            <span>{t('tokenGovernance.fairVoting')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.fairVotingDesc')}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center space-x-2">
              <Shield className="w-5 h-5 text-red-500" />
              <span>{t('tokenGovernance.preventingWhales')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.preventingWhalesDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center space-x-2">
              <Users className="w-5 h-5 text-green-500" />
              <span>{t('tokenGovernance.encouragingEngagement')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.encouragingEngagementDesc')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenGovernance.solvingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed mb-4">{t('tokenGovernance.solvingDesc')}</p>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-blue-800 dark:text-blue-200 font-medium">{t('tokenGovernance.launchNote')}</p>
            <p className="text-blue-700 dark:text-blue-300 mt-2">{t('tokenGovernance.stayTuned')}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
        <CardHeader>
          <CardTitle className="text-xl text-yellow-800 dark:text-yellow-200">{t('tokenGovernance.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-700 dark:text-yellow-300 leading-relaxed text-sm">{t('tokenGovernance.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenGovernance;
