import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { DhbAmount } from '@/components/app/DhbAmount';

const TippingFlowchart = () => {
  const { t: _copy } = _useCopy();
  const tippingTiers = [
    { 
      threshold: "0", 
      effect: "No Live Display", 
      description: _copy("copy.10d2fe3df4f9", { defaultValue: "No visual effects on screen" }),
      emoji: "❌"
    },
    { 
      threshold: "1,000-9,999", 
      effect: "Love Heart Emoji Pop up on screen", 
      description: _copy("copy.7b06ece76fdb", { defaultValue: "Love heart emoji appears on stream" }),
      emoji: "❤️"
    },
    { 
      threshold: "10,000-24,999", 
      effect: "Box of Chocolate Emoji Pops Up on Screen", 
      description: _copy("copy.c7c0091104cf", { defaultValue: "Chocolate box emoji appears on stream" }),
      emoji: "🍫"
    },
    { 
      threshold: "25,000-49,999", 
      effect: "Bouquet of Flowers Emoji Pops up on screen", 
      description: _copy("copy.69354fad62aa", { defaultValue: "Flower bouquet emoji appears on stream" }),
      emoji: "💐"
    },
    { 
      threshold: "50,000-99,999", 
      effect: "Crown Emoji Pops up on screen", 
      description: _copy("copy.83f1384d68ba", { defaultValue: "Crown emoji appears on stream" }),
      emoji: "👑"
    },
    { 
      threshold: "100,000-199,999", 
      effect: "Magic Ring Emoji Pops up on screen", 
      description: _copy("copy.b18479b5ea82", { defaultValue: "Magic ring emoji appears on screen" }),
      emoji: "💍"
    },
    { 
      threshold: "200,000-299,999", 
      effect: "Spartans army run on screen", 
      description: _copy("copy.368808eaf27e", { defaultValue: "Spartan army animation plays" }),
      emoji: "⚔️"
    },
    { 
      threshold: "300,000-499,999", 
      effect: "Party starts, confetti flies, disco balls spin", 
      description: _copy("copy.25690b4e85fe", { defaultValue: "Full party animation with confetti and disco balls" }),
      emoji: "🎉"
    },
    { 
      threshold: "500,000-749,999", 
      effect: "Screen goes gold and coins drop from sky with sirens (3 seconds)", 
      description: _copy("copy.13da743a5959", { defaultValue: "Golden screen effect with falling coins and siren sounds" }),
      emoji: "🟡"
    },
    { 
      threshold: "750,000-999,999", 
      effect: "Screen goes gold and coins drop from sky with sirens (10 seconds)", 
      description: _copy("copy.acad2b08df0d", { defaultValue: "Extended golden screen effect with falling coins and siren sounds" }),
      emoji: "💰"
    },
    { 
      threshold: "1,000,000+", 
      effect: "All previous emojis together with extra confetti and party music", 
      description: _copy("copy.81d471a5e9d4", { defaultValue: "Ultimate celebration with all effects combined plus extra confetti and party music" }),
      emoji: "🎊"
    }
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-center">{_copy("copy.5eccd3810ba7", { defaultValue: "Tipping Animation System" })}</CardTitle>
        <p className="text-center text-sm text-muted-foreground">{_copy("copy.97954de3aa4d", { defaultValue: "Different tip amounts trigger different visual effects and animations on stream" })}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {tippingTiers.map((tier, index) => (
            <div key={tier.threshold} className="flex items-center justify-between p-4 rounded-lg docs-glass">
              <div className="flex items-center gap-4">
                <div className="text-2xl">{tier.emoji}</div>
                <div>
                  <span className="font-medium text-sm">{tier.effect}</span>
                  <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                </div>
              </div>
              <div className="text-right">
                <DhbAmount amount={tier.threshold} className="text-sm font-mono font-semibold" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TippingFlowchart;
