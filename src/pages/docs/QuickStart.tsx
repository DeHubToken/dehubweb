import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Getting started on DeHub as a user: account, profile, first post, earning,
 * badges and the wallet. Every step points at something that exists in the
 * app today; the deeper detail lives in the dApp guide it links to.
 */
const steps = [1, 2, 3, 4, 5, 6] as const;

const nextLinks = [
  { to: '/docs/dapps', title: 'quickStart.nextDappTitle', desc: 'quickStart.nextDappDesc' },
  { to: '/docs/dapps#badges', title: 'quickStart.nextBadgesTitle', desc: 'quickStart.nextBadgesDesc' },
  { to: '/docs/token/stake', title: 'quickStart.nextStakeTitle', desc: 'quickStart.nextStakeDesc' },
  { to: '/docs/faq', title: 'quickStart.nextFaqTitle', desc: 'quickStart.nextFaqDesc' },
];

const QuickStart = () => {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>{t('quickStart.breadcrumbDocs')}</span>
          <span>/</span>
          <span>{t('quickStart.breadcrumbGettingStarted')}</span>
          <span>/</span>
          <span className="text-foreground">{t('quickStart.title')}</span>
        </div>
        <h1 className="text-4xl font-bold text-foreground">{t('quickStart.title')}</h1>
        <p className="text-xl text-muted-foreground">{t('quickStart.subtitle')}</p>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center mb-3">
          <CheckCircle className="w-5 h-5 text-foreground mr-2" />
          <h3 className="text-lg font-semibold text-foreground">{t('quickStart.prerequisites')}</h3>
        </div>
        <ul className="space-y-2 text-muted-foreground">
          <li>• {t('quickStart.prereq1')}</li>
          <li>• {t('quickStart.prereq2')}</li>
          <li>• {t('quickStart.prereq3')}</li>
        </ul>
      </div>

      {steps.map((n) => (
        <div key={n} className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground flex items-center">
            <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">{n}</span>
            {t(`quickStart.step${n}Title`)}
          </h2>
          <p className="text-muted-foreground leading-relaxed">{t(`quickStart.step${n}Desc`)}</p>
        </div>
      ))}

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center">
          <CheckCircle className="w-6 h-6 text-foreground mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">{t('quickStart.congratulations')}</h3>
            <p className="text-muted-foreground">{t('quickStart.congratulationsDesc')}</p>
          </div>
        </div>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">{t('quickStart.whatsNext')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nextLinks.map((l) => (
            <Link key={l.to} to={l.to} className="block p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
              <h4 className="font-semibold text-foreground mb-2">{t(l.title)}</h4>
              <p className="text-muted-foreground text-sm">{t(l.desc)}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuickStart;
