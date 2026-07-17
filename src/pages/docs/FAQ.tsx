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
          <h1 className="text-4xl font-bold text-slate-900 mb-4">{t('faq.title')}</h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            {t('faq.subtitle')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-slate-800">{t('faq.commonQuestions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {faqKeys.map((i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border border-slate-200 rounded-lg px-4">
                  <AccordionTrigger className="text-left font-medium text-slate-700 hover:text-slate-900 py-4">
                    {t(`faq.q${i}`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-600 pb-4 leading-relaxed">
                    {t(`faq.a${i}`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-xl text-blue-800">{t('faq.stillHaveQuestions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-blue-700 leading-relaxed mb-4">
              {t('faq.stillHaveQuestionsDesc')}
            </p>
            <div className="space-y-2">
              <p className="text-blue-600">
                <strong>{t('faq.techSupport')}:</strong> <a href="mailto:tech@dehub.net" className="underline hover:text-blue-800">tech@dehub.net</a>
              </p>
              <p className="text-blue-600">
                <strong>{t('faq.followUs')}:</strong> <a href="https://x.com/dehub_official" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-800">@dehub_official</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default FAQ;
