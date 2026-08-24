import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

/**
 * The daily posting allowance, drawn as a ladder.
 *
 * Two things are true of every row and both matter: a badge buys a bigger free
 * allowance AND a cheaper rate on whatever runs past it. A table alone hides
 * the shape of the first — the apex tiers break away rather than continuing the
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
  dhbPerTextPost: number;
  dhbPerGb: number;
  image: string | null;
}

const TIERS: AllowanceTier[] = [
  { name: 'No badge', threshold: '< 10,000', postsPerDay: 10, gbPerDay: 1, dhbPerTextPost: 100, dhbPerGb: 2000, image: null },
  { name: 'Crab', threshold: '10,000+', postsPerDay: 11, gbPerDay: 1.1, dhbPerTextPost: 95, dhbPerGb: 1900, image: '/lovable-uploads/60bc125c-8efd-4058-9e12-7ca393df4fce.png' },
  { name: 'Lobster', threshold: '25k+', postsPerDay: 12, gbPerDay: 1.2, dhbPerTextPost: 93, dhbPerGb: 1860, image: '/lovable-uploads/2c7200c2-681e-4499-863b-ea24fdbdb70c.png' },
  { name: 'Piranha', threshold: '50k+', postsPerDay: 13, gbPerDay: 1.3, dhbPerTextPost: 91, dhbPerGb: 1820, image: '/lovable-uploads/38387f75-fd38-4380-9588-1f19f68d8435.png' },
  { name: 'Tortoise', threshold: '100k+', postsPerDay: 14, gbPerDay: 1.4, dhbPerTextPost: 89, dhbPerGb: 1780, image: '/lovable-uploads/fc47a759-390a-4f41-ba96-5bc0066e82b9.png' },
  { name: 'Cobra', threshold: '250k+', postsPerDay: 15, gbPerDay: 1.5, dhbPerTextPost: 87, dhbPerGb: 1740, image: '/lovable-uploads/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png' },
  { name: 'Octopus', threshold: '500k+', postsPerDay: 16, gbPerDay: 1.6, dhbPerTextPost: 85, dhbPerGb: 1700, image: '/lovable-uploads/8fcbb3f6-223d-4e2f-9d82-30082a175491.png' },
  { name: 'Crocodile', threshold: '1m+', postsPerDay: 17, gbPerDay: 1.7, dhbPerTextPost: 83, dhbPerGb: 1660, image: '/lovable-uploads/c84eee0a-97c7-4938-9b9c-c991c802593e.png' },
  { name: 'Dolphin', threshold: '2m+', postsPerDay: 18, gbPerDay: 1.8, dhbPerTextPost: 81, dhbPerGb: 1620, image: '/lovable-uploads/4558c158-75d9-40fc-adfa-41125344a48e.png' },
  { name: 'Tiger Shark', threshold: '3m+', postsPerDay: 19, gbPerDay: 1.9, dhbPerTextPost: 79, dhbPerGb: 1580, image: '/lovable-uploads/6be493f1-51b4-481b-9ca1-340c030b2ef8.png' },
  { name: 'Killer Whale', threshold: '5m+', postsPerDay: 20, gbPerDay: 2, dhbPerTextPost: 77, dhbPerGb: 1540, image: '/lovable-uploads/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png' },
  { name: 'Great White Shark', threshold: '10m+', postsPerDay: 25, gbPerDay: 2.5, dhbPerTextPost: 75, dhbPerGb: 1500, image: '/lovable-uploads/dfcc3420-f654-486b-bc94-f84f0209ba5c.png' },
  { name: 'Blue Whale', threshold: '25m+', postsPerDay: 50, gbPerDay: 5, dhbPerTextPost: 73, dhbPerGb: 1460, image: '/lovable-uploads/bc6b4bb7-aa43-4015-adb0-194568cc0858.png' },
  { name: 'Megalodon', threshold: '50m+', postsPerDay: 100, gbPerDay: 10, dhbPerTextPost: 70, dhbPerGb: 1400, image: '/lovable-uploads/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png' },
];

const MAX_GB = TIERS[TIERS.length - 1].gbPerDay;

/** DHB is sold at a fixed $0.001, so a price in DHB is a price in cents ÷ 10. */
const DHB_USD = 0.001;

const usd = (dhb: number) => {
  const value = dhb * DHB_USD;
  return value < 1 ? `${(value * 100).toFixed(1).replace(/\.0$/, '')}c` : `$${value.toFixed(2)}`;
};

const gbLabel = (gb: number) => (Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`);

const PostingAllowanceChart = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle className="text-center font-exo">Daily posting allowance by badge</CardTitle>
      <p className="text-center text-sm text-muted-foreground font-exo">
        Free every day. The bar is the data allowance; the price on the right is what anything past
        it costs.
      </p>
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
                  className="w-8 h-8 object-contain dark:invert flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex-shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground font-exo truncate">{tier.name}</span>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                    {tier.threshold} DHB
                  </span>
                </div>

                {/* The bar. Width is the share of the top tier's allowance, so the
                    step up at Great White / Blue Whale / Megalodon reads at a glance. */}
                <div
                  className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden"
                  role="img"
                  aria-label={`${gbLabel(tier.gbPerDay)} of media and ${tier.postsPerDay} text posts free per day`}
                >
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${Math.max(2, (tier.gbPerDay / MAX_GB) * 100)}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm text-foreground font-exo">
                    <strong className="font-semibold">{gbLabel(tier.gbPerDay)}</strong>
                    <span className="text-muted-foreground"> media</span>
                    <span className="text-muted-foreground"> · </span>
                    <strong className="font-semibold">{tier.postsPerDay}</strong>
                    <span className="text-muted-foreground"> text posts</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    then {tier.dhbPerGb.toLocaleString()} DHB/GB ({usd(tier.dhbPerGb)}) ·{' '}
                    {tier.dhbPerTextPost} DHB/post ({usd(tier.dhbPerTextPost)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4 font-exo">
        Badge tier is your DHB held plus staked on BNB Chain and Base — the same balance your badge
        is drawn from. Allowances reset at 00:00 UTC. A gigabyte here is 1,024 MB.
      </p>
    </CardContent>
  </Card>
);

export default PostingAllowanceChart;
