import React from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Overview = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">
          {t('overview.title')}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('overview.subtitle')}
        </p>
      </div>

      {/* Main Content */}
      <div className="bg-card rounded-2xl border border-border p-8">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-lg leading-relaxed text-foreground/80 mb-6">
            {t('overview.paragraph1')}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mb-6">
            {t('overview.paragraph2')}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mb-6">
            {t('overview.paragraph3')}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mb-6">
            {t('overview.paragraph4')}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mb-6">
            {t('overview.paragraph5')}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 mb-8">
            {t('overview.paragraph6')}
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="docs-glass rounded-xl p-6">
        <div className="flex items-start space-x-3">
          <Shield className="w-6 h-6 text-foreground mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-3">
              {t('overview.disclaimerTitle')}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t('overview.disclaimerText')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
