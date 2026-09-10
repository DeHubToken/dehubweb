
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { badgeImage } from '@/lib/staking-badges';

const AdvertisingPricing = () => {
  // CPMs mirror the live POVR rates in src/lib/ads/povr.ts — value-scaled to
  // verified holdings, anchored at Crab $100 and Meglodon $25,000.
  const pricingTiers = [
    { threshold: "< 10,000", badge: "No Badge", cpm: "$10", multiplier: "1x", image: null, color: "bg-gray-300" },
    { threshold: "10,000+", badge: "Crab Badge", cpm: "$100", multiplier: "10x", image: badgeImage('Crab'), color: "bg-orange-500" },
    { threshold: "25,000+", badge: "Lobster Badge", cpm: "$180", multiplier: "18x", image: badgeImage('Lobster'), color: "bg-red-500" },
    { threshold: "50,000+", badge: "Piranha Badge", cpm: "$285", multiplier: "28x", image: badgeImage('Piranha'), color: "bg-purple-500" },
    { threshold: "100,000+", badge: "Tortoise Badge", cpm: "$450", multiplier: "45x", image: badgeImage('Tortoise'), color: "bg-green-600" },
    { threshold: "250,000+", badge: "Cobra Badge", cpm: "$800", multiplier: "80x", image: badgeImage('Cobra'), color: "bg-gray-800" },
    { threshold: "500,000+", badge: "Octopus Badge", cpm: "$1,250", multiplier: "125x", image: badgeImage('Octopus'), color: "bg-blue-600" },
    { threshold: "1,000,000+", badge: "Crocodite Badge", cpm: "$2,000", multiplier: "200x", image: badgeImage('Crocodite'), color: "bg-green-800" },
    { threshold: "2,000,000+", badge: "Dolphin Badge", cpm: "$3,000", multiplier: "300x", image: badgeImage('Dolphin'), color: "bg-cyan-500" },
    { threshold: "3,000,000+", badge: "Tiger Shark Badge", cpm: "$4,000", multiplier: "400x", image: badgeImage('Tiger Shark'), color: "bg-slate-600" },
    { threshold: "5,000,000+", badge: "Killer Whale Badge", cpm: "$5,500", multiplier: "550x", image: badgeImage('Killer Whale'), color: "bg-gray-900" },
    { threshold: "10,000,000+", badge: "Great White Shark Badge", cpm: "$8,750", multiplier: "875x", image: badgeImage('Great White Shark'), color: "bg-blue-800" },
    { threshold: "25,000,000+", badge: "Blue Whale Badge", cpm: "$16,000", multiplier: "1600x", image: badgeImage('Blue Whale'), color: "bg-indigo-700" },
    { threshold: "50,000,000+", badge: "Meglodon Badge", cpm: "$25,000", multiplier: "2500x", image: badgeImage('Meglodon'), color: "bg-purple-800" }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-medium-silver" />
            <span>POVR Advertising Pricing System</span>
          </CardTitle>
          <p className="text-gray-700">
            Our linear tier-based pricing system ensures fair and scalable advertising costs based on audience value. The value is priced in USD for ease of management however payments will be prompted in $DHB at the time of execution.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Badge Tier</TableHead>
                  <TableHead>Holdings Required</TableHead>
                  <TableHead>CPM Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingTiers.map((tier, index) => (
                  <TableRow key={tier.badge} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {tier.image ? (
                          <img 
                            src={tier.image} 
                            alt={tier.badge}
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-300"></div>
                        )}
                        <span className="font-medium">{tier.badge}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{tier.threshold} $DHB</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {tier.cpm}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-medium-silver" />
              <span>Pricing Benefits</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-medium-silver mt-2"></div>
              <p className="text-sm text-gray-700">
                <strong>Value-scaled pricing:</strong> CPMs grow with verified on-chain holdings — from $100 (Crab) to $25,000 (Meglodon)
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-medium-silver mt-2"></div>
              <p className="text-sm text-gray-700">
                <strong>Fair pricing:</strong> Costs reflect actual audience value and purchasing power
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-medium-silver mt-2"></div>
              <p className="text-sm text-gray-700">
                <strong>Fraud protection:</strong> POVR verification ensures real, valuable audiences
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-medium-silver mt-2"></div>
              <p className="text-sm text-gray-700">
                <strong>Scalable targeting:</strong> Choose specific tiers or ranges for optimal ROI
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-medium-silver" />
              <span>Package Options</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg border bg-muted/20">
              <h4 className="font-semibold text-sm">Multi-Tier Targeting</h4>
              <p className="text-xs text-muted-foreground">Target multiple badge tiers with blended CPM rates</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/20">
              <h4 className="font-semibold text-sm">Volume Discounts</h4>
              <p className="text-xs text-muted-foreground">5-15% discounts for campaigns over $10K spend</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/20">
              <h4 className="font-semibold text-sm">Premium Placement</h4>
              <p className="text-xs text-muted-foreground">Featured positioning with 1.5x CPM premium</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/20">
              <h4 className="font-semibold text-sm">Real-time Bidding</h4>
              <p className="text-xs text-muted-foreground">Dynamic pricing based on competition and demand</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdvertisingPricing;
