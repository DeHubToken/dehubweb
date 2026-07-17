import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Bug } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenSecurity = () => {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenSecurity.title')}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('tokenSecurity.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenSecurity.contractSecurity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-start space-x-4 p-4 bg-muted rounded-lg border">
              <Shield className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-foreground mb-1">{t('tokenSecurity.audit')}</h4>
                <p className="text-muted-foreground">
                  <a href="https://skynet.certik.com/projects/dehub?__cf_chl_rt_tk=N_M44mFcDWKtLmLVGNEC1rDps5hWVdQyhr3m1jLOTNM-1748707726-1.0.1.1-dfgolPAmeQ8KnvRDO3y0pFse0jC2Q1ro5bKRvE5WJPo" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">
                    Certik
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-muted rounded-lg border">
              <Bug className="w-6 h-6 text-blue-500 mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-foreground mb-1">{t('tokenSecurity.bugBounty')}</h4>
                <p className="text-muted-foreground">
                  <a href="mailto:tech@dehub.net" className="text-primary hover:text-primary/80 underline">
                    tech@dehub.net
                  </a>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
        <CardHeader>
          <CardTitle className="text-xl text-yellow-800 dark:text-yellow-200">{t('tokenSecurity.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-700 dark:text-yellow-300 leading-relaxed text-sm">{t('tokenSecurity.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenSecurity;
