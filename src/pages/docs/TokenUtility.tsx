import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenUtility = () => {
  const { t } = useLanguage();

  const benefits = [
    t('tokenUtility.benefit1'),
    t('tokenUtility.benefit2'),
    t('tokenUtility.benefit3'),
    t('tokenUtility.benefit4'),
    t('tokenUtility.benefit5'),
    t('tokenUtility.benefit6'),
    t('tokenUtility.benefit7'),
    t('tokenUtility.benefit8'),
    t('tokenUtility.benefit9'),
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenUtility.title')}</h1>
        <h2 className="text-2xl font-semibold text-muted-foreground mb-6">{t('tokenUtility.subtitle')}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenUtility.benefitsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('tokenUtility.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenUtility.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenUtility;
