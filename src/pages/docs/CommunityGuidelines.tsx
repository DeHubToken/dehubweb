import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, Flag, Gavel, Eye, Mail } from 'lucide-react';
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

const CommunityGuidelines = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('communityGuidelines.title')}</h1>
        <div className="text-muted-foreground space-y-1 font-exo">
          <p><strong>{t('communityGuidelines.lastUpdated')}</strong> {t('communityGuidelines.lastUpdatedDate')}</p>
        </div>
        <p className="text-muted-foreground leading-relaxed font-exo">{t('communityGuidelines.intro')}</p>
      </div>

      <Section title={t('communityGuidelines.notAllowed')} icon={<Shield className="w-5 h-5" />}>
        <p>{t('communityGuidelines.notAllowedText')}</p>
        <ItemList items={Array.from({ length: 9 }, (_, i) => t(`communityGuidelines.notAllowedItem${i + 1}`))} />
      </Section>

      <Section title={t('communityGuidelines.adultContent')} icon={<Eye className="w-5 h-5" />}>
        <p>{t('communityGuidelines.adultContentText')}</p>
      </Section>

      <Section title={t('communityGuidelines.reporting')} icon={<Flag className="w-5 h-5" />}>
        <p>{t('communityGuidelines.reportingText')}</p>
        <ItemList items={Array.from({ length: 4 }, (_, i) => t(`communityGuidelines.reportingItem${i + 1}`))} />
      </Section>

      <Section title={t('communityGuidelines.whatHappensNext')} icon={<Users className="w-5 h-5" />}>
        <p>{t('communityGuidelines.whatHappensNextText')}</p>
        <ItemList items={Array.from({ length: 4 }, (_, i) => t(`communityGuidelines.whatHappensNextItem${i + 1}`))} />
      </Section>

      <Section title={t('communityGuidelines.appeals')} icon={<Gavel className="w-5 h-5" />}>
        <p>{t('communityGuidelines.appealsText')}</p>
      </Section>

      <Section title={t('communityGuidelines.contact')} icon={<Mail className="w-5 h-5" />}>
        <p>{t('communityGuidelines.contactText')}</p>
      </Section>
    </div>
  );
};

export default CommunityGuidelines;
