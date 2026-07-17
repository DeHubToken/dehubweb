import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, Zap, Globe, CreditCard } from 'lucide-react';
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

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="font-semibold text-foreground mb-2">{title}</h3>
    {children}
  </div>
);

const ItemList = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside space-y-1 ml-4">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const TermsOfService = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('termsOfService.title')}</h1>
        <div className="text-muted-foreground space-y-1 font-exo">
          <p><strong>{t('termsOfService.lastUpdated')}</strong> {t('termsOfService.lastUpdatedDate')}</p>
          <p><strong>{t('termsOfService.effective')}</strong> {t('termsOfService.effectiveDate')}</p>
        </div>
      </div>

      <Section title={t('termsOfService.welcomeTitle')} icon={<Globe className="w-6 h-6" />}>
        <p>{t('termsOfService.welcomeText')}</p>
      </Section>

      <Section title={t('termsOfService.ourService')}>
        <p>{t('termsOfService.ourServiceText1')}</p>
        <p>{t('termsOfService.ourServiceText2')}</p>
      </Section>

      <Section title={t('termsOfService.softwareDevelopers')}>
        <p>{t('termsOfService.softwareDevText1')}</p>
        <p>{t('termsOfService.softwareDevText2')}</p>
      </Section>

      <Section title={t('termsOfService.whoMayUse')}>
        <SubSection title={t('termsOfService.ageRequirements')}>
          <p>{t('termsOfService.ageRequirementsText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.parentPermission')}>
          <p>{t('termsOfService.parentPermissionText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.businesses')}>
          <p>{t('termsOfService.businessesText')}</p>
        </SubSection>
      </Section>

      <Section title={t('termsOfService.walletConnections')}>
        <p>{t('termsOfService.walletText1')}</p>
        <p>{t('termsOfService.walletText2')}</p>
        <ItemList items={[t('termsOfService.walletItem1'), t('termsOfService.walletItem2'), t('termsOfService.walletItem3')]} />
      </Section>

      <Section title={t('termsOfService.tokenPurchases')} icon={<CreditCard className="w-5 h-5" />}>
        <SubSection title={t('termsOfService.tokenUsage')}>
          <p>{t('termsOfService.tokenUsageText')}</p>
          <ItemList items={[t('termsOfService.tokenUsageItem1'), t('termsOfService.tokenUsageItem2'), t('termsOfService.tokenUsageItem3'), t('termsOfService.tokenUsageItem4')]} />
        </SubSection>
        <SubSection title={t('termsOfService.purchaseLimits')}>
          <p>{t('termsOfService.purchaseLimitsText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.refundsPolicy')}>
          <p>{t('termsOfService.refundsPolicyText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.feesAndGas')}>
          <p>{t('termsOfService.feesAndGasText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.fiatOnRamp')}>
          <p>{t('termsOfService.fiatOnRampText')}</p>
          <ItemList items={[t('termsOfService.fiatOnRampItem1'), t('termsOfService.fiatOnRampItem2'), t('termsOfService.fiatOnRampItem3'), t('termsOfService.fiatOnRampItem4'), t('termsOfService.fiatOnRampItem5')]} />
          <p className="mt-2">{t('termsOfService.fiatOnRampNote')}</p>
        </SubSection>
      </Section>

      <Section title={t('termsOfService.tokenProtection')} icon={<Shield className="w-5 h-5" />}>
        <SubSection title={t('termsOfService.burnMint')}>
          <p>{t('termsOfService.burnMintText')}</p>
        </SubSection>
      </Section>

      <Section title={t('termsOfService.permissionsRestrictions')}>
        <p>{t('termsOfService.permissionsText')}</p>
        <SubSection title={t('termsOfService.notAllowed')}>
          <ItemList items={Array.from({ length: 7 }, (_, i) => t(`termsOfService.notAllowedItem${i + 1}`))} />
        </SubSection>
      </Section>

      <Section title={t('termsOfService.monetizationRights')} icon={<Zap className="w-5 h-5" />}>
        <p className="font-semibold text-foreground">{t('termsOfService.monetizationPrinciple')}</p>
        <p>{t('termsOfService.monetizationText')}</p>
        <ItemList items={[t('termsOfService.monetizationItem1'), t('termsOfService.monetizationItem2'), t('termsOfService.monetizationItem3')]} />
        <p>{t('termsOfService.monetizationOwnership')}</p>
      </Section>

      <Section title={t('termsOfService.communityGovernance')} icon={<Users className="w-5 h-5" />}>
        <SubSection title={t('termsOfService.decentralizedModeration')}>
          <p>{t('termsOfService.decentralizedModerationText')}</p>
          <ItemList items={Array.from({ length: 4 }, (_, i) => t(`termsOfService.decentralizedModerationItem${i + 1}`))} />
        </SubSection>
        <SubSection title={t('termsOfService.contentRestrictions')}>
          <p>{t('termsOfService.contentRestrictionsText')}</p>
          <ItemList items={Array.from({ length: 3 }, (_, i) => t(`termsOfService.contentRestrictionsItem${i + 1}`))} />
        </SubSection>
      </Section>

      <Section title={t('termsOfService.rightsYouGrant')}>
        <p>{t('termsOfService.rightsYouGrantText')}</p>
        <SubSection title={t('termsOfService.licenseToDeHub')}>
          <p>{t('termsOfService.licenseToDeHubText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.licenseToOthers')}>
          <p>{t('termsOfService.licenseToOthersText')}</p>
        </SubSection>
      </Section>

      <Section title={t('termsOfService.accountManagement')}>
        <SubSection title={t('termsOfService.terminationByYou')}>
          <p>{t('termsOfService.terminationByYouText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.restrictionsByDeHub')}>
          <p>{t('termsOfService.restrictionsByDeHubText')}</p>
          <ItemList items={[t('termsOfService.restrictionsItem1'), t('termsOfService.restrictionsItem2'), t('termsOfService.restrictionsItem3')]} />
        </SubSection>
      </Section>

      <Section title={t('termsOfService.otherLegalTerms')}>
        <SubSection title={t('termsOfService.disclaimerTitle')}>
          <p>{t('termsOfService.disclaimerText')}</p>
        </SubSection>
        <SubSection title={t('termsOfService.limitationOfLiability')}>
          <p>{t('termsOfService.limitationText')}</p>
          <ItemList items={[t('termsOfService.limitationItem1'), t('termsOfService.limitationItem2'), t('termsOfService.limitationItem3'), t('termsOfService.limitationItem4')]} />
        </SubSection>
        <SubSection title={t('termsOfService.changesToAgreement')}>
          <p>{t('termsOfService.changesToAgreementText')}</p>
        </SubSection>
      </Section>

      <Section title={t('termsOfService.contact')}>
        <p>{t('termsOfService.contactText')}</p>
      </Section>
    </div>
  );
};

export default TermsOfService;
