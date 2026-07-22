import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import SEO from '@/components/SEO';
import { useLanguage } from '@/contexts/LanguageContext';

const FAQ = () => {
  const { t } = useLanguage();

  const faqKeys = Array.from({ length: 21 }, (_, i) => i + 1);

  return (
    <>
      <SEO 
        title={t('faq.title')} 
        description={t('faq.subtitle')} 
        url="/docs/faq" 
      />
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-4">{t('faq.title')}</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('faq.subtitle')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-foreground">{t('faq.commonQuestions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {faqKeys.map((i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border border-border rounded-lg px-4">
                  <AccordionTrigger className="text-left font-medium text-foreground hover:text-foreground py-4">
                    {t(`faq.q${i}`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
                    {t(`faq.a${i}`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="docs-glass">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">{t('faq.stillHaveQuestions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t('faq.stillHaveQuestionsDesc')}
            </p>
            <div className="space-y-2">
              <p className="text-muted-foreground">
                <strong>{t('faq.techSupport')}:</strong> <a href="mailto:tech@dehub.net" className="underline text-primary hover:text-primary/80">tech@dehub.net</a>
              </p>
              <p className="text-muted-foreground">
                <strong>{t('faq.followUs')}:</strong> <a href="https://x.com/dehub_official" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">@dehub_official</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default FAQ;
