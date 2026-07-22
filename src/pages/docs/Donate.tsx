import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

const Donate = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [copiedAddress, setCopiedAddress] = React.useState<string | null>(null);

  const addresses = [
    {
      network: t('donate.evmNetwork'),
      address: '0x1759ceb6255dbebfe2c0c51edbcd29ad7efb9229',
      icon: '⟠'
    },
    {
      network: t('donate.btcNetwork'),
      address: 'bc1qldncd2fejalxjjpa4z5rhkd8rnd0lmchvpdxr2',
      icon: '₿'
    }
  ];

  const copyToClipboard = (address: string, network: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast({
      title: t('donate.addressCopied'),
      description: `${network} ${t('donate.addressCopiedDesc')}`,
    });
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full docs-glass mb-4">
          <Heart className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('donate.title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('donate.subtitle')}
        </p>
      </div>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-foreground font-exo">{t('donate.aboutTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>{t('donate.aboutP1')}</p>
          <p>{t('donate.aboutP2')}</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground font-exo">{t('donate.donationAddresses')}</h2>
        <div className="grid gap-4">
          {addresses.map((item) => (
            <Card key={item.network} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{item.icon}</span>
                    <h3 className="font-semibold text-foreground">{item.network}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm text-muted-foreground break-all bg-muted p-3 rounded-lg flex-1">
                      {item.address}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(item.address, item.network)}
                      className="shrink-0"
                    >
                      {copiedAddress === item.address ? (
                        <Check className="w-4 h-4 text-foreground" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="docs-glass">
        <CardContent className="p-6 text-center">
          <Heart className="w-8 h-8 text-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('donate.thankYou')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Donate;
