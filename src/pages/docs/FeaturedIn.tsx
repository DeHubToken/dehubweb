import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Newspaper } from "lucide-react";
import ExternalLink from "@/components/ui/cut-icons/open-externally";
import Quote from "@/components/ui/cut-icons/quote";
import { useLanguage } from '@/contexts/LanguageContext';


type PressFeature = {
  outlet: string;
  /** reach, headline and blurb are docs translation keys (src/i18n/en.ts featuredIn). */
  reach: string;
  headline: string;
  blurb: string;
  url: string;
  /** Set when `url` points at a Wayback capture because the publisher took the
   *  original down. Surfaces an "archived" note so a reader isn't surprised to
   *  land on web.archive.org, and flags the entry for anyone re-checking these
   *  links later. */
  archived?: boolean;
};

const features: PressFeature[] = [
  {
    outlet: 'US Weekly',
    reach: 'featuredIn.usWeeklyReach',
    headline: 'featuredIn.usWeeklyHeadline',
    blurb: 'featuredIn.usWeeklyBlurb',
    url: 'https://www.usmagazine.com/celebrity-news/news/meet-the-companies-driving-the-blue-ocean-frontier-of-blockchain/',
  },
  {
    outlet: 'Yahoo Finance',
    reach: 'featuredIn.yahooFinanceReach',
    headline: 'featuredIn.yahooFinanceHeadline',
    blurb: 'featuredIn.yahooFinanceBlurb',
    url: 'https://finance.yahoo.com/news/dehub-launching-portal-metaverse-022300594.html',
  },
  {
    outlet: 'Entrepreneur',
    reach: 'featuredIn.entrepreneurReach',
    // Entrepreneur has since pulled the piece — entrepreneur.com/article/420564
    // now 404s, so this pointed at a dead page. The article itself is intact in
    // the Wayback Machine (three captures, Feb–Jul 2022), which is a real,
    // checkable citation, so the entry stays and the link goes to the archive
    // rather than being deleted. If Entrepreneur restores it, swap the URL back
    // and drop `archived`.
    //
    // Headline and blurb were also wrong. The real piece is bylined Srivatsa KR
    // for Entrepreneur Asia Pacific (25 Feb 2022) and carries Entrepreneur's
    // "Opinions expressed by Entrepreneur contributors are their own" notice —
    // it is contributor coverage, not the founder interview this claimed.
    headline: 'featuredIn.entrepreneurHeadline',
    blurb: 'featuredIn.entrepreneurBlurb',
    url: 'https://web.archive.org/web/20220702152228/https://www.entrepreneur.com/article/420564',
    archived: true,
  },
  {
    outlet: 'Investing.com',
    reach: 'featuredIn.investingReach',
    headline: 'featuredIn.investingHeadline',
    blurb: 'featuredIn.investingBlurb',
    url: 'https://www.investing.com/news/cryptocurrency-news/dehubs-portal-to-the-metaverse-set-to-disrupt-the-entertainment-and-lifestyle-industry-2684073',
  },
];

const FeaturedIn = () => {
  const { t: _copy } = _useCopy();
  const { t } = useLanguage();
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground">{_copy("copy.dbc2def4603a", { defaultValue: "Featured In" })}</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">{_copy("copy.ee1c1eecf1b6", { defaultValue: "DeHub has been covered by some of the world's biggest and most trusted publications. Here are the articles putting a spotlight on our mission to democratise media." })}</p>
      </div>

      {/* PRESS FEATURES */}
      <div className="grid md:grid-cols-2 gap-6">
        {features.map((f) => (
          <Card key={f.outlet} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Newspaper className="w-5 h-5 shrink-0" />
                  {f.outlet}
                </CardTitle>
                <span className="text-xs bg-muted px-2 py-1 rounded whitespace-nowrap">{t(f.reach)}</span>
              </div>
              <CardDescription className="pt-2 text-base font-medium text-foreground/90 flex gap-2">
                <Quote className="w-4 h-4 shrink-0 mt-1 text-muted-foreground" />
                {t(f.headline)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 justify-between gap-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{t(f.blurb)}</p>
              <div className="flex flex-col gap-2 items-start">
                <Button asChild size="sm" className="w-full sm:w-auto self-start">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    {f.archived ? _copy("copy.3cc67cc8baef", { defaultValue: "Read the archived article" }) : _copy("copy.d70e40a0744a", { defaultValue: "Read the article" })}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {f.archived && (
                  <span className="text-xs text-muted-foreground">{_copy("copy.6ccae4bbf68d", { defaultValue: "The publisher has removed the original; this opens the Wayback Machine capture." })}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PRESS ENQUIRIES */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-5 h-5" />{_copy("copy.6cd2ed68db06", { defaultValue: "Press & media enquiries" })}</CardTitle>
          <CardDescription>{_copy("copy.1845043a09b8", { defaultValue: "Writing about DeHub or looking for assets, quotes or an interview? We'd love to help." })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Button asChild>
              <a href="mailto:marketing@dehub.net">{_copy("copy.44635127331a", { defaultValue: "Contact the team" })}</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/docs/brand-assets" className="flex items-center gap-2">{_copy("copy.5491b0ff70a2", { defaultValue: "Brand assets" })}</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeaturedIn;
