
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { DollarSign, TrendingUp, Users } from 'lucide-react';

const AdvertisingPricing = () => {
  // CPMs mirror the live POVR rates in src/lib/ads/povr.ts — value-scaled to
  // verified holdings, anchored at Crab $100 and Meglodon $25,000.
  const pricingTiers = [
    { threshold: "< 10,000", badge: "No Badge", cpm: "$10", multiplier: "1x", image: null, color: "bg-gray-300" },
    { threshold: "10,000+", badge: "Crab Badge", cpm: "$100", multiplier: "10x", image: "/lovable-uploads/60bc125c-8efd-4058-9e12-7ca393df4fce.png", color: "bg-orange-500" },
    { threshold: "25,000+", badge: "Lobster Badge", cpm: "$180", multiplier: "18x", image: "/lovable-uploads/2c7200c2-681e-4499-863b-ea24fdbdb70c.png", color: "bg-red-500" },
    { threshold: "50,000+", badge: "Piranha Badge", cpm: "$285", multiplier: "28x", image: "/lovable-uploads/38387f75-fd38-4380-9588-1f19f68d8435.png", color: "bg-purple-500" },
    { threshold: "100,000+", badge: "Tortoise Badge", cpm: "$450", multiplier: "45x", image: "/lovable-uploads/fc47a759-390a-4f41-ba96-5bc0066e82b9.png", color: "bg-green-600" },
    { threshold: "250,000+", badge: "Cobra Badge", cpm: "$800", multiplier: "80x", image: "/lovable-uploads/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png", color: "bg-gray-800" },
    { threshold: "500,000+", badge: "Octopus Badge", cpm: "$1,250", multiplier: "125x", image: "/lovable-uploads/8fcbb3f6-223d-4e2f-9d82-30082a175491.png", color: "bg-blue-600" },
    { threshold: "1,000,000+", badge: "Crocodite Badge", cpm: "$2,000", multiplier: "200x", image: "/lovable-uploads/c84eee0a-97c7-4938-9b9c-c991c802593e.png", color: "bg-green-800" },
    { threshold: "2,000,000+", badge: "Dolphin Badge", cpm: "$3,000", multiplier: "300x", image: "/lovable-uploads/4558c158-75d9-40fc-adfa-41125344a48e.png", color: "bg-cyan-500" },
    { threshold: "3,000,000+", badge: "Tiger Shark Badge", cpm: "$4,000", multiplier: "400x", image: "/lovable-uploads/6be493f1-51b4-481b-9ca1-340c030b2ef8.png", color: "bg-slate-600" },
    { threshold: "5,000,000+", badge: "Killer Whale Badge", cpm: "$5,500", multiplier: "550x", image: "/lovable-uploads/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png", color: "bg-gray-900" },
    { threshold: "10,000,000+", badge: "Great White Shark Badge", cpm: "$8,750", multiplier: "875x", image: "/lovable-uploads/dfcc3420-f654-486b-bc94-f84f0209ba5c.png", color: "bg-blue-800" },
    { threshold: "25,000,000+", badge: "Blue Whale Badge", cpm: "$16,000", multiplier: "1600x", image: "/lovable-uploads/fb9dfd31-d278-49fa-8ec8-1eee9ab74aef.png", color: "bg-indigo-700" },
    { threshold: "50,000,000+", badge: "Meglodon Badge", cpm: "$25,000", multiplier: "2500x", image: "/lovable-uploads/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png", color: "bg-purple-800" }
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
                            className="w-6 h-6 object-contain dark:invert"
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
