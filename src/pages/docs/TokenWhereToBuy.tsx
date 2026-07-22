import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Zap, Shield, CreditCard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenWhereToBuy = () => {
  const { t } = useLanguage();

  const exchanges = [
    { name: "Uniswap", network: "Base", url: "https://app.uniswap.org/explore/tokens/base/0xd20ab1015f6a2de4a6fddebab270113f689c2f7c" },
    { name: "Pancakeswap", network: "BNB", url: "https://pancakeswap.finance/swap?inputCurrency=0x680d3113caf77b61b510f332d5ef4cf5b41a761d&outputCurrency=0x55d398326f99059ff775485246999027b3197955&ref=coingecko&user=Coingecko&discount=0&perps=false" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenWhereToBuy.title')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenWhereToBuy.dexs')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {exchanges.map((exchange, index) => (
              <a key={index} href={exchange.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
                <div>
                  <h4 className="font-semibold text-foreground">{exchange.network}</h4>
                  <p className="text-muted-foreground">{exchange.name}</p>
                </div>
                <ExternalLink className="w-5 h-5 text-muted-foreground" />
              </a>
            ))}
          </div>
          <div className="mt-6 p-4 docs-glass rounded-lg">
            <p className="text-muted-foreground leading-relaxed">{t('tokenWhereToBuy.dexNote')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenWhereToBuy.cexs')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <a href="https://www.coinbase.com/en-es/trade-crypto/dex" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
              <div>
                <h4 className="font-semibold text-foreground">Coinbase</h4>
                <p className="text-muted-foreground">{t('tokenWhereToBuy.centralizedDex')}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
            </a>
            <a href="https://www.mexc.com/dex/trade?pair_ca=0xebDeacaf03Ba54Eb18128FD1FD042bc747af9295&chain_id=8453&token_ca=0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c&from=search" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
              <div>
                <h4 className="font-semibold text-foreground">MEXC</h4>
                <p className="text-muted-foreground">{t('tokenWhereToBuy.centralizedDex')}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
            </a>
            <a href="https://www.okx.com/cedefi" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
              <div>
                <h4 className="font-semibold text-foreground">OKX CeDeFi</h4>
                <p className="text-muted-foreground">{t('tokenWhereToBuy.centralizedDefi')}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            {t('tokenWhereToBuy.direct')}
            <CreditCard className="w-5 h-5" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <a href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
              <div>
                <h4 className="font-semibold text-foreground">{t('tokenWhereToBuy.directPurchase')}</h4>
                <p className="text-muted-foreground">{t('tokenWhereToBuy.directPurchaseDesc')}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
            </a>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 docs-glass rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-foreground" />
                  <h4 className="font-semibold text-foreground">{t('tokenWhereToBuy.dehubToken')}</h4>
                </div>
                <p className="text-muted-foreground text-sm">{t('tokenWhereToBuy.dehubTokenDesc')}</p>
              </div>

              <div className="p-4 docs-glass rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-foreground" />
                  <h4 className="font-semibold text-foreground">{t('tokenWhereToBuy.instantPayments')}</h4>
                </div>
                <p className="text-muted-foreground text-sm">{t('tokenWhereToBuy.instantPaymentsDesc')}</p>
              </div>

              <div className="p-4 docs-glass rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-foreground" />
                  <h4 className="font-semibold text-foreground">{t('tokenWhereToBuy.secureGateway')}</h4>
                </div>
                <p className="text-muted-foreground text-sm">{t('tokenWhereToBuy.secureGatewayDesc')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('tokenWhereToBuy.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenWhereToBuy.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenWhereToBuy;
