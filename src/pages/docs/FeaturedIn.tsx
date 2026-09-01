import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Newspaper, ExternalLink, Quote } from 'lucide-react';

type PressFeature = {
  outlet: string;
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
    reach: '50M+ readers',
    headline: 'Meet the Companies Driving the Blue Ocean Frontier of Blockchain',
    blurb:
      'The celebrity and entertainment magazine featured DeHub among the companies pioneering the next frontier of blockchain — reaching a mainstream, off-chain audience most crypto projects never touch.',
    url: 'https://www.usmagazine.com/celebrity-news/news/meet-the-companies-driving-the-blue-ocean-frontier-of-blockchain/',
  },
  {
    outlet: 'Yahoo Finance',
    reach: "World's largest business news platform",
    headline: 'DeHub Launching Portal to the Metaverse',
    blurb:
      "A piece introducing DeHub's plans to build a portal to the metaverse and reshape entertainment, published on the world's largest business news platform.",
    url: 'https://finance.yahoo.com/news/dehub-launching-portal-metaverse-022300594.html',
  },
  {
    outlet: 'Entrepreneur',
    reach: '20M+ monthly users',
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
    headline: 'A User-Centric Entertainment EcoSystem that Empowers Creators and Consumers',
    blurb:
      'Entrepreneur Asia Pacific covered DeHub’s vision for a creator-owned entertainment economy — VR-ready sport, film, music and gaming built on NFT infrastructure, bootstrapped since 2021.',
    url: 'https://web.archive.org/web/20220702152228/https://www.entrepreneur.com/article/420564',
    archived: true,
  },
  {
    outlet: 'Investing.com',
    reach: '46M+ monthly users',
    headline: "DeHub's Portal to the Metaverse Set to Disrupt Entertainment & Lifestyle",
    blurb:
      'One of the most visited financial platforms in the world named DeHub a project of interest in the metaverse goldrush, set to disrupt the entertainment and lifestyle industries.',
    url: 'https://www.investing.com/news/cryptocurrency-news/dehubs-portal-to-the-metaverse-set-to-disrupt-the-entertainment-and-lifestyle-industry-2684073',
  },
];

const FeaturedIn = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground">Featured In</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          DeHub has been covered by some of the world's biggest and most trusted publications. Here are the articles putting a spotlight on our mission to democratise media.
        </p>
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
                <span className="text-xs bg-muted px-2 py-1 rounded whitespace-nowrap">{f.reach}</span>
              </div>
              <CardDescription className="pt-2 text-base font-medium text-foreground/90 flex gap-2">
                <Quote className="w-4 h-4 shrink-0 mt-1 text-muted-foreground" />
                {f.headline}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 justify-between gap-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{f.blurb}</p>
              <div className="flex flex-col gap-2 items-start">
                <Button asChild size="sm" className="w-full sm:w-auto self-start">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    {f.archived ? 'Read the archived article' : 'Read the article'}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {f.archived && (
                  <span className="text-xs text-muted-foreground">
                    The publisher has removed the original; this opens the Wayback Machine capture.
                  </span>
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
            <Newspaper className="w-5 h-5" />
            Press & media enquiries
          </CardTitle>
          <CardDescription>
            Writing about DeHub or looking for assets, quotes or an interview? We'd love to help.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Button asChild>
              <a href="mailto:marketing@dehub.net">Contact the team</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/docs/brand-assets" className="flex items-center gap-2">
                Brand assets
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeaturedIn;
