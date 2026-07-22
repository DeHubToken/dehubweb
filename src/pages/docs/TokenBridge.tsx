import SEO from '@/components/SEO';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TokenBridge() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [copiedAddress, setCopiedAddress] = useState<string>('');

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast({
        title: t('tokenBridge.addressCopied'),
        description: t('tokenBridge.addressCopiedDesc'),
      });
      setTimeout(() => setCopiedAddress(''), 2000);
    } catch (err) {
      toast({
        title: t('tokenBridge.copyFailed'),
        description: t('tokenBridge.copyFailedDesc'),
        variant: "destructive",
      });
    }
  };

  const bridgeAddress = '0x11D79aE9a0F8a8f9Fcf5BE71e403ed203EC2394d';

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <SEO 
        title="Bridge - DeHub Documentation"
        description="Learn how to bridge DHB tokens between BASE and BNB chains with DeHub's cross-chain bridge solution."
        url="/docs/token/bridge"
      />
      
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-6">{t('tokenBridge.title')}</h1>
          <p className="text-lg text-muted-foreground mb-8">{t('tokenBridge.subtitle')}</p>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-lg p-6 border">
            <h2 className="text-2xl font-semibold mb-4">{t('tokenBridge.bridgeToBase')}</h2>
            <p className="mb-4">{t('tokenBridge.bridgeToBaseDesc')}</p>
            <div 
              className="bg-muted p-4 rounded-md font-mono text-sm break-all cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-between group"
              onClick={() => copyToClipboard(bridgeAddress)}
            >
              <span>{bridgeAddress}</span>
              {copiedAddress === bridgeAddress ? (
                <Check className="h-4 w-4 text-foreground" />
              ) : (
                <Copy className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>

          <div className="bg-card rounded-lg p-6 border">
            <h2 className="text-2xl font-semibold mb-4">{t('tokenBridge.bridgeToBnb')}</h2>
            <p className="mb-4">{t('tokenBridge.bridgeToBnbDesc')}</p>
            <div 
              className="bg-muted p-4 rounded-md font-mono text-sm break-all cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-between group"
              onClick={() => copyToClipboard(bridgeAddress)}
            >
              <span>{bridgeAddress}</span>
              {copiedAddress === bridgeAddress ? (
                <Check className="h-4 w-4 text-foreground" />
              ) : (
                <Copy className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>

          <div className="docs-glass rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">{t('tokenBridge.processingTime')}</h3>
            <p className="mb-4">{t('tokenBridge.processingTimeDesc')}</p>
            <p className="text-sm text-muted-foreground">{t('tokenBridge.automatedBridge')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
