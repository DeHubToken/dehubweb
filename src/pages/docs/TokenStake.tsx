import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Coins, Lock, TrendingUp, Users, Zap, Shield, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenStake = () => {
  const { t } = useLanguage();

  const userFlowItems = t('tokenStake.userFlowItems') as unknown as string[];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center space-x-4 mb-4">
          <h1 className="text-4xl font-bold text-foreground">{t('tokenStake.title')}</h1>
          <a href="https://dehub.net/staking" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-primary hover:text-primary/80 transition-colors text-sm font-medium bg-primary/10 px-3 py-1 rounded-lg hover:bg-primary/20">
            <span>{t('tokenStake.stakeNow')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('tokenStake.introDesc')}</p>
        <p className="text-lg text-muted-foreground leading-relaxed mt-4">{t('tokenStake.introDesc2')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-primary" />
            <span>{t('tokenStake.technicals')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{t('tokenStake.technicalsDesc1')}</p>
          <p className="text-muted-foreground">{t('tokenStake.technicalsDesc2')}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('tokenStake.tier1')}</span>
              <Badge variant="secondary">{t('tokenStake.tier1Rewards')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('tokenStake.tier1Desc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('tokenStake.tier2')}</span>
              <Badge variant="secondary">{t('tokenStake.tier2Rewards')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('tokenStake.tier2Desc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('tokenStake.tier3')}</span>
              <Badge variant="default">{t('tokenStake.tier3Rewards')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('tokenStake.tier3Desc')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-primary" />
            <span>{t('tokenStake.userFlow')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-muted-foreground">
            {Array.isArray(userFlowItems) && userFlowItems.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span>{t('tokenStake.rewardCalc')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('tokenStake.rewardCalcDesc1')}</p>
          <p className="text-muted-foreground">{t('tokenStake.rewardCalcDesc2')}</p>
          
          <div className="bg-primary/10 p-4 rounded-lg">
            <h4 className="font-semibold text-foreground mb-2">{t('tokenStake.calcFormula')}</h4>
            <div className="space-y-2 text-sm text-muted-foreground font-mono">
              <p>{t('tokenStake.formulaLine1')}</p>
              <p>{t('tokenStake.formulaLine2')}</p>
              <p>{t('tokenStake.formulaLine3')}</p>
              <p>{t('tokenStake.formulaLine4')}</p>
            </div>
          </div>

          <div className="bg-primary/5 p-4 rounded-lg">
            <h4 className="font-semibold text-foreground mb-2">{t('tokenStake.example')}</h4>
            <p className="text-sm text-muted-foreground">{t('tokenStake.exampleDesc')}</p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>• {t('tokenStake.exampleA')}</li>
              <li>• {t('tokenStake.exampleB')}</li>
              <li>• {t('tokenStake.exampleC')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-primary" />
            <span>{t('tokenStake.restakeRules')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('tokenStake.restakeDesc')}</p>
          
          <div className="docs-glass p-4 rounded-lg">
            <h4 className="font-semibold text-foreground mb-2">{t('tokenStake.importantNotes')}</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {t('tokenStake.restakeNote1')}</li>
              <li>• {t('tokenStake.restakeNote2')}</li>
              <li>• {t('tokenStake.restakeNote3')}</li>
              <li>• {t('tokenStake.restakeNote4')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Coins className="w-5 h-5 text-primary" />
            <span>{t('tokenStake.howToStake')}</span>
          </CardTitle>
          <CardDescription>{t('tokenStake.howToStakeDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[t('tokenStake.step1'), t('tokenStake.step2'), t('tokenStake.step3'), t('tokenStake.step4')].map((step, i) => (
              <div key={i} className="text-center p-4 bg-primary/10 rounded-lg">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">{i + 1}</div>
                <p className="font-semibold text-foreground">{step}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-4">{t('tokenStake.stakeNote')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('tokenStake.howRewardsGenerated')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{t('tokenStake.howRewardsDesc')}</p>
          <h4 className="font-semibold text-foreground mb-3">{t('tokenStake.feeSources')}</h4>
          <ul className="space-y-2 text-muted-foreground">
            <li>• {t('tokenStake.feeSource1')}</li>
            <li>• {t('tokenStake.feeSource2')}</li>
            <li>• {t('tokenStake.feeSource3')}</li>
            <li>• {t('tokenStake.feeSource4')}</li>
            <li>• {t('tokenStake.feeSource5')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-foreground">
            <Shield className="w-5 h-5" />
            <span>{t('tokenStake.disclaimer')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{t('tokenStake.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenStake;
