import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { badgeImage } from '@/lib/staking-badges';

/**
 * The Badge of Honour ladder, for the docs dApp page.
 *
 * Two numbers per rung, because two things are true at once. The DOLLAR cost is
 * the invariant the peg preserves — Megalodon is about $50,000 whatever DHB is
 * trading at. The DHB figure is the reference ladder: what that dollar cost
 * asks for at the $0.001 anchor `BADGE_PRICE_ANCHOR` was written against, and
 * what the app actually asks for is that ladder scaled by anchor ÷ live price.
 * Showing only the DHB column (which this did until the peg landed) reads as a
 * fixed requirement, which is exactly what it stopped being.
 *
 * The weight column is the same ladder again: what a view or a reaction from
 * that tier counts for, one above the badgeless account's single count.
 */
const BadgeFlowchart = () => {
  const badges = [
    { threshold: "10,000", usd: "$10", badge: "Crab Badge", color: "bg-muted", image: badgeImage('Crab') },
    { threshold: "25k", usd: "$25", badge: "Lobster Badge", color: "bg-muted", image: badgeImage('Lobster') },
    { threshold: "50k", usd: "$50", badge: "Piranha Badge", color: "bg-muted", image: badgeImage('Piranha') },
    { threshold: "100k", usd: "$100", badge: "Tortoise Badge", color: "bg-muted", image: badgeImage('Tortoise') },
    { threshold: "250k", usd: "$250", badge: "Cobra Badge", color: "bg-muted", image: badgeImage('Cobra') },
    { threshold: "500k", usd: "$500", badge: "Octopus Badge", color: "bg-muted", image: badgeImage('Octopus') },
    { threshold: "1m", usd: "$1,000", badge: "Crocodile Badge", color: "bg-muted", image: badgeImage('Crocodite') },
    { threshold: "2m", usd: "$2,000", badge: "Dolphin Badge", color: "bg-muted", image: badgeImage('Dolphin') },
    { threshold: "3m", usd: "$3,000", badge: "Tiger Shark Badge", color: "bg-muted", image: badgeImage('Tiger Shark') },
    { threshold: "5m", usd: "$5,000", badge: "Killer Whale Badge", color: "bg-muted", image: badgeImage('Killer Whale') },
    { threshold: "10m", usd: "$10,000", badge: "Great White Shark Badge", color: "bg-muted", image: badgeImage('Great White Shark') },
    { threshold: "25m", usd: "$25,000", badge: "Blue Whale Badge", color: "bg-muted", image: badgeImage('Blue Whale') },
    { threshold: "50m", usd: "$50,000", badge: "Megalodon Badge", color: "bg-muted", image: badgeImage('Meglodon') }
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-center">Badge of Honour System</CardTitle>
        <p className="text-center text-sm text-muted-foreground">
          Each tier costs a fixed amount in dollars. The DHB beside it is what that
          costs at the $0.001 reference price — the app asks for that figure scaled
          to the live price, and never for more than it, so a falling price cannot
          raise the bar or take back a tier you have already earned.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {badges.map((badge, index) => (
            <div key={badge.threshold} className="flex items-center justify-between gap-3 p-3 rounded-lg docs-glass">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={badge.image}
                  alt={badge.badge}
                  className="w-8 h-8 object-contain shrink-0"
                />
                <span className="font-medium truncate">{badge.badge}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-mono text-foreground">{badge.usd}</span>
                <span className="block text-xs font-mono text-muted-foreground">
                  {badge.threshold} $DHB · ×{index + 2} weight
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg docs-glass">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-muted border border-border shrink-0"></div>
              <span className="font-medium text-muted-foreground truncate">No Badge</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-mono text-muted-foreground">under $10</span>
              <span className="block text-xs font-mono text-muted-foreground">
                &lt; 10,000 $DHB · ×1 weight
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BadgeFlowchart;
