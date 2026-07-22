import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Terms = () => {
  const { t } = useLanguage();

  const paragraphs = Array.from({ length: 9 }, (_, i) => t(`legalDisclaimer.paragraph${i + 1}`));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('legalDisclaimer.title')}</h1>
        <div className="text-muted-foreground space-y-1 font-exo">
          <p><strong>{t('legalDisclaimer.lastUpdated')}</strong> {t('legalDisclaimer.lastUpdatedDate')}</p>
          <p><strong>{t('legalDisclaimer.effective')}</strong> {t('legalDisclaimer.effectiveDate')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-exo">{t('legalDisclaimer.heading')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-muted-foreground leading-relaxed font-exo">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground font-exo flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            {t('legalDisclaimer.importantNotice')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground font-exo">
          <p className="font-semibold mb-2">{t('legalDisclaimer.disclaimer')}</p>
          <p>{t('legalDisclaimer.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Terms;
