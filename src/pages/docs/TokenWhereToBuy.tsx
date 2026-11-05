import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from "lucide-react";
import Bell from "@/components/ui/cut-icons/alerts";

import { useLanguage } from '@/contexts/LanguageContext';

const TokenWhereToBuy = () => {
  const { t: _t } = _useCopy();
  const { t } = useLanguage();

  // The old token's exchange and contract links are gone. The new token is
  // not trading yet, so this page says so and points at the launch list.
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenWhereToBuy.title')}</h1>
      </div>

      <Card data-token-coming-soon>
        <CardContent className="p-6 sm:p-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {_t('tokenLaunch.eyebrow', 'Coming soon')}
          </span>
          <h2 className="mt-4 text-2xl font-bold text-foreground">{_t('tokenLaunch.title', 'Token launching soon')}</h2>
          <p className="mt-2 text-muted-foreground leading-relaxed max-w-md mx-auto">
            {_t('dhbListing.body', "Riftn tokens aren't trading yet. Get an email when trading opens.")}
          </p>
          <Link
            to="/buy"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {_t('tokenLaunch.notifyMe', 'Notify me')}
          </Link>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('tokenWhereToBuy.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenWhereToBuy.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenWhereToBuy;
