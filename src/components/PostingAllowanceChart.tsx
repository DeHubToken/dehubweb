import { translateCopy as _translateCopy } from '@/i18n/copy';
import { TranslationText } from '@/components/TranslationText';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { DhbCoin } from '@/components/app/DhbAmount';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { badgeImage } from '@/lib/staking-badges';

/**
 * The daily home-feed allowance, drawn as a ladder.
 *
 * Posting is never limited or charged; a badge decides how many text posts and
 * how much media reach the public home feed each day, and anything past that
 * goes to the creator's profile. A table alone hides the shape of the ladder — the apex tiers break away rather than continuing the
 * straight line — so the bar is the point of this component and the numbers sit
 * beside it rather than replacing it.
 *
 * The figures mirror `POST_QUOTA_TIERS` in the backend
 * (`src/post-quota/post-quota.constants.ts`), which is the authority. They are
 * written out rather than fetched: this is a documentation page describing a
 * published policy, and a docs page that renders differently depending on
 * whether an API answered is worse than one that is occasionally a deploy
 * behind. If the backend table changes, change this one in the same PR.
 *
 * Badge art is the same set the fee-tier list on this page already uses.
 */

interface AllowanceTier {
  name: string;
  /** Minimum DHB held plus staked. */
  threshold: string;
  postsPerDay: number;
  gbPerDay: number;
  image: string | null;
}

const TIERS: AllowanceTier[] = [
  { get name() { return _translateCopy("copy.a39a305fab8b", { defaultValue: "No badge" }); }, threshold: '< 10,000', postsPerDay: 1, gbPerDay: 1, image: null },
  { name: 'Crab', threshold: '10,000+', postsPerDay: 2, gbPerDay: 1.1, image: badgeImage('Crab') },
  { name: 'Ghost Lobster', threshold: '25k+', postsPerDay: 2, gbPerDay: 1.2, image: badgeImage('Ghost Lobster') },
  { name: 'Piranha', threshold: '50k+', postsPerDay: 2, gbPerDay: 1.3, image: badgeImage('Piranha') },
  { name: 'Giant Tortoise', threshold: '100k+', postsPerDay: 3, gbPerDay: 1.4, image: badgeImage('Giant Tortoise') },
  { name: 'King Cobra', threshold: '250k+', postsPerDay: 3, gbPerDay: 1.5, image: badgeImage('King Cobra') },
  { name: 'Octopus', threshold: '500k+', postsPerDay: 3, gbPerDay: 1.6, image: badgeImage('Octopus') },
  { name: 'Crocodile', threshold: '1m+', postsPerDay: 3, gbPerDay: 1.7, image: badgeImage('Crocodile') },
  { name: 'Dolphin', threshold: '2m+', postsPerDay: 4, gbPerDay: 1.8, image: badgeImage('Dolphin') },
  { name: 'Tiger Shark', threshold: '3m+', postsPerDay: 5, gbPerDay: 1.9, image: badgeImage('Tiger Shark') },
  { name: 'Great White Shark', threshold: '5m+', postsPerDay: 6, gbPerDay: 2, image: badgeImage('Great White Shark') },
  { name: 'Killer Whale', threshold: '10m+', postsPerDay: 7, gbPerDay: 2.5, image: badgeImage('Killer Whale') },
  { name: 'Blue Whale', threshold: '25m+', postsPerDay: 8, gbPerDay: 5, image: badgeImage('Blue Whale') },
  { name: 'Megalodon', threshold: '50m+', postsPerDay: 9, gbPerDay: 10, image: badgeImage('Megalodon') },
];

const MAX_GB = TIERS[TIERS.length - 1].gbPerDay;

const gbLabel = (gb: number) => (Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`);

const AllowanceFootnote = () => {
  const { t } = useTranslation();
  return <p className="text-xs text-muted-foreground mt-4 font-exo">{t('postingAllowance.footnote')}</p>;
};

const PostingAllowanceChart = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle className="text-center font-exo"><TranslationText name="copy.bfec166eea05" fallback={"Daily home feed allowance by badge"} /></CardTitle>
      <p className="text-center text-sm text-muted-foreground font-exo"><TranslationText name="copy.23c4bdbfc9f8" fallback={"Post as much as you like. The bar is the data that reaches the home feed each day; past it, posts go to your profile."} /></p>
    </CardHeader>
    <CardContent>
      <div className="grid gap-2">
        {TIERS.map((tier) => (
          <div key={tier.name} className="p-3 rounded-lg docs-glass">
            <div className="flex items-center gap-3">
              {tier.image ? (
                <img
                  src={tier.image}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="w-8 h-8 object-contain flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex-shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground font-exo truncate">{tier.name}</span>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                    {tier.threshold} <DhbCoin />
                  </span>
                </div>

                {/* The bar. Width is the share of the top tier's allowance, so the
                    step up at Great White / Blue Whale / Megalodon reads at a glance. */}
                <div
                  className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden"
                  role="img"
                  aria-label={_translateCopy("copy.d300f01abdea", { defaultValue: "{{value1}} of media and {{value2}} text posts on the home feed per day", value1: gbLabel(tier.gbPerDay), value2: tier.postsPerDay })}
                >
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${Math.max(2, (tier.gbPerDay / MAX_GB) * 100)}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm text-foreground font-exo">
                    <strong className="font-semibold">{gbLabel(tier.gbPerDay)}</strong>
                    <span className="text-muted-foreground"><TranslationText name="copy.fe2026f79566" fallback={" media"} /></span>
                    <span className="text-muted-foreground"> · </span>
                    <strong className="font-semibold">{tier.postsPerDay}</strong>
                    <span className="text-muted-foreground"><TranslationText name="copy.a092b4b19981" fallback={" text posts"} /></span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AllowanceFootnote />
    </CardContent>
  </Card>
);

export default PostingAllowanceChart;
