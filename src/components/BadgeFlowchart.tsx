import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const BadgeFlowchart = () => {
  const badges = [
    { threshold: "10,000", badge: "Crab Badge", color: "bg-muted", image: "/lovable-uploads/60bc125c-8efd-4058-9e12-7ca393df4fce.png" },
    { threshold: "25k", badge: "Lobster Badge", color: "bg-muted", image: "/lovable-uploads/2c7200c2-681e-4499-863b-ea24fdbdb70c.png" },
    { threshold: "50k", badge: "Piranha Badge", color: "bg-muted", image: "/lovable-uploads/38387f75-fd38-4380-9588-1f19f68d8435.png" },
    { threshold: "100k", badge: "Tortoise Badge", color: "bg-muted", image: "/lovable-uploads/fc47a759-390a-4f41-ba96-5bc0066e82b9.png" },
    { threshold: "250k", badge: "Cobra Badge", color: "bg-muted", image: "/lovable-uploads/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png" },
    { threshold: "500k", badge: "Octopus Badge", color: "bg-muted", image: "/lovable-uploads/8fcbb3f6-223d-4e2f-9d82-30082a175491.png" },
    { threshold: "1m", badge: "Crocodile Badge", color: "bg-muted", image: "/lovable-uploads/c84eee0a-97c7-4938-9b9c-c991c802593e.png" },
    { threshold: "2m", badge: "Dolphin Badge", color: "bg-muted", image: "/lovable-uploads/4558c158-75d9-40fc-adfa-41125344a48e.png" },
    { threshold: "3m", badge: "Tiger Shark Badge", color: "bg-muted", image: "/lovable-uploads/6be493f1-51b4-481b-9ca1-340c030b2ef8.png" },
    { threshold: "5m", badge: "Killer Whale Badge", color: "bg-muted", image: "/lovable-uploads/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png" },
    { threshold: "10m", badge: "Great White Shark Badge", color: "bg-muted", image: "/lovable-uploads/dfcc3420-f654-486b-bc94-f84f0209ba5c.png" },
    { threshold: "25m", badge: "Blue Whale Badge", color: "bg-muted", image: "/lovable-uploads/fb9dfd31-d278-49fa-8ec8-1eee9ab74aef.png" },
    { threshold: "50m", badge: "Megalodon Badge", color: "bg-muted", image: "/lovable-uploads/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png" }
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-center">Badge of Honour System</CardTitle>
        <p className="text-center text-sm text-muted-foreground">
          Badge system based on $DHB token holdings - higher holdings unlock exclusive badges and enhanced features
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {badges.map((badge, index) => (
            <div key={badge.threshold} className="flex items-center justify-between p-3 rounded-lg docs-glass">
              <div className="flex items-center gap-3">
                <img 
                  src={badge.image} 
                  alt={badge.badge}
                  className="w-8 h-8 object-contain dark:invert"
                />
                <span className="font-medium">{badge.badge}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono text-muted-foreground">
                  {badge.threshold}+ $DHB
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between p-3 rounded-lg docs-glass">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted border border-border"></div>
              <span className="font-medium text-muted-foreground">No Badge</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono text-muted-foreground">
                &lt; 10,000 $DHB
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BadgeFlowchart;
