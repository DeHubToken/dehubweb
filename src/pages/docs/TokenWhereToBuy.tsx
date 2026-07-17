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
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-blue-800 dark:text-blue-200 leading-relaxed">{t('tokenWhereToBuy.dexNote')}</p>
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
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-semibold text-green-800 dark:text-green-200">{t('tokenWhereToBuy.dehubToken')}</h4>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm">{t('tokenWhereToBuy.dehubTokenDesc')}</p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200">{t('tokenWhereToBuy.instantPayments')}</h4>
                </div>
                <p className="text-blue-700 dark:text-blue-300 text-sm">{t('tokenWhereToBuy.instantPaymentsDesc')}</p>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <h4 className="font-semibold text-purple-800 dark:text-purple-200">{t('tokenWhereToBuy.secureGateway')}</h4>
                </div>
                <p className="text-purple-700 dark:text-purple-300 text-sm">{t('tokenWhereToBuy.secureGatewayDesc')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
        <CardHeader>
          <CardTitle className="text-xl text-yellow-800 dark:text-yellow-200">{t('tokenWhereToBuy.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-700 dark:text-yellow-300 leading-relaxed text-sm">{t('tokenWhereToBuy.disclaimerText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenWhereToBuy;
