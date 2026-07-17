import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';

const Games = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('games.title')}</h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">{t('games.subtitle')}</p>
      </div>

      <div className="space-y-8">
        <div className="bg-card/50 rounded-lg p-6 border border-border">
          <p className="text-foreground/90 mb-4">{t('games.intro1')}</p>
          <p className="text-foreground/90 mb-4">{t('games.intro2')}</p>
          <p className="text-foreground/90">{t('games.intro3')}</p>
          <p className="text-foreground/90 mt-4 font-semibold">{t('games.intro4')}</p>
        </div>

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming">{t('games.tabUpcoming')}</TabsTrigger>
            <TabsTrigger value="released">{t('games.tabReleased')}</TabsTrigger>
            <TabsTrigger value="features">{t('games.tabFeatures')}</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-6">
            <div className="bg-card/50 rounded-lg p-6 border border-border">
              <h3 className="text-2xl font-semibold text-foreground mb-4">{t('games.upcomingTitle')}</h3>
              <div className="space-y-4">
                <h4 className="text-xl font-semibold text-foreground">{t('games.lcsTitle')}</h4>
                <p className="text-foreground/90">{t('games.lcsDesc')}</p>
                <div className="mt-4">
                  <span className="font-semibold text-foreground">{t('games.website')}: </span>
                  <a href="https://lastchadstanding.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">
                    lastchadstanding.com
                  </a>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="released" className="space-y-6">
            <div className="bg-card/50 rounded-lg p-6 border border-border">
              <h3 className="text-2xl font-semibold text-foreground mb-6">{t('games.releasedTitle')}</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">{t('games.whackTitle')}</h4>
                  <p className="text-foreground/90">{t('games.whackDesc')}</p>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">{t('games.gasTitle')}</h4>
                  <p className="text-foreground/90">{t('games.gasDesc')}</p>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">{t('games.rocketTitle')}</h4>
                  <p className="text-foreground/90">{t('games.rocketDesc')}</p>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">{t('games.streetTitle')}</h4>
                  <p className="text-foreground/90">{t('games.streetDesc')}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-foreground/90 mb-3">{t('games.playArcade')}</p>
                  <a href="https://arcade.dehub.net" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline font-semibold">
                    arcade.dehub.net
                  </a>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <div className="bg-card/50 rounded-lg p-6 border border-border">
              <h3 className="text-2xl font-semibold text-foreground mb-6">{t('games.featuresTitle')}</h3>
              <div className="space-y-4">
                {[t('games.feature1'), t('games.feature2'), t('games.feature3'), t('games.feature4')].map((feature, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <p className="text-foreground/90">{feature}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Games;
