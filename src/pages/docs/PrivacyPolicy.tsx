import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, Key, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-xl font-exo flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4 text-muted-foreground leading-relaxed font-exo">
      {children}
    </CardContent>
  </Card>
);

const ItemList = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside space-y-1 ml-4">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const PrivacyPolicy = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('privacyPolicy.title')}</h1>
        <div className="text-muted-foreground space-y-1 font-exo">
          <p><strong>{t('privacyPolicy.lastUpdated')}</strong> {t('privacyPolicy.lastUpdatedDate')}</p>
          <p><strong>{t('privacyPolicy.effective')}</strong> {t('privacyPolicy.effectiveDate')}</p>
        </div>
      </div>

      <Section title={t('privacyPolicy.commitmentTitle')} icon={<Globe className="w-6 h-6" />}>
        <p>{t('privacyPolicy.commitmentText')}</p>
        <p className="font-semibold text-foreground">{t('privacyPolicy.corePrinciple')}</p>
      </Section>

      <Section title={t('privacyPolicy.dataCollection')}>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.whatWeDontCollect')}</h3>
          <ItemList items={Array.from({ length: 6 }, (_, i) => t(`privacyPolicy.dontCollectItem${i + 1}`))} />
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.blockchainData')}</h3>
          <p>{t('privacyPolicy.blockchainDataText')}</p>
          <ItemList items={Array.from({ length: 4 }, (_, i) => t(`privacyPolicy.blockchainItem${i + 1}`))} />
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.localStorage')}</h3>
          <p>{t('privacyPolicy.localStorageText')}</p>
          <ItemList items={Array.from({ length: 3 }, (_, i) => t(`privacyPolicy.localStorageItem${i + 1}`))} />
        </div>
      </Section>

      <Section title={t('privacyPolicy.contentModeration')} icon={<Users className="w-5 h-5" />}>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.communityGovernance')}</h3>
          <p>{t('privacyPolicy.communityGovernanceText')}</p>
          <ItemList items={Array.from({ length: 4 }, (_, i) => t(`privacyPolicy.governanceItem${i + 1}`))} />
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.legalCompliance')}</h3>
          <p>{t('privacyPolicy.legalComplianceText')}</p>
          <ItemList items={Array.from({ length: 3 }, (_, i) => t(`privacyPolicy.legalComplianceItem${i + 1}`))} />
        </div>
      </Section>

      <Section title={t('privacyPolicy.thirdPartyServices')}>
        <p>{t('privacyPolicy.thirdPartyText')}</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>{t('privacyPolicy.thirdPartyItem1Prefix')}</strong> {t('privacyPolicy.thirdPartyItem1')}</li>
          <li><strong>{t('privacyPolicy.thirdPartyItem2Prefix')}</strong> {t('privacyPolicy.thirdPartyItem2')}</li>
          <li><strong>{t('privacyPolicy.thirdPartyItem3Prefix')}</strong> {t('privacyPolicy.thirdPartyItem3')}</li>
        </ul>
        <p className="mt-3">{t('privacyPolicy.thirdPartyNote')}</p>
      </Section>

      <Section title={t('privacyPolicy.yourRights')} icon={<Key className="w-5 h-5" />}>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.dataSovereignty')}</h3>
          <ItemList items={Array.from({ length: 4 }, (_, i) => t(`privacyPolicy.dataSovereigntyItem${i + 1}`))} />
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('privacyPolicy.blockchainConsiderations')}</h3>
          <p>{t('privacyPolicy.blockchainConsiderationsText')}</p>
          <ItemList items={Array.from({ length: 3 }, (_, i) => t(`privacyPolicy.blockchainConsiderationsItem${i + 1}`))} />
        </div>
      </Section>

      <Section title={t('privacyPolicy.contactUpdates')}>
        <p>{t('privacyPolicy.contactText')}</p>
        <ItemList items={[t('privacyPolicy.contactItem1'), t('privacyPolicy.contactItem2'), t('privacyPolicy.contactItem3')]} />
        <p className="mt-4">{t('privacyPolicy.contactNote')}</p>
      </Section>

      <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/30">
        <CardHeader>
          <CardTitle className="text-xl text-orange-800 dark:text-orange-300 font-exo flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            {t('privacyPolicy.importantNotice')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-orange-700 dark:text-orange-400 font-exo">
          <p>{t('privacyPolicy.importantNoticeText')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyPolicy;
