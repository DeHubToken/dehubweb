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
    headline: "DeHub's “Redefining Vision”",
    blurb:
      'Founders Malik, Mike and Indi sat down with Entrepreneur for an interview and review of DeHub’s vision for a creator-owned economy.',
    url: 'https://www.entrepreneur.com/article/420564',
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
              <Button asChild size="sm" className="w-full sm:w-auto self-start">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  Read the article
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
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
