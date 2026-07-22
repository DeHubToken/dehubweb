import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, Calendar } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuarterData {
  id: string;
  title: string;
  items: string[];
  status: 'completed' | 'inProgress' | 'planned';
}

const QuarterBlock = ({ quarter, t }: { quarter: QuarterData; t: (key: string) => any }) => {
  const isCompleted = quarter.status === 'completed';
  const isInProgress = quarter.status === 'inProgress';
  const bgClass = isInProgress ? 'bg-muted/50' : isCompleted ? 'bg-muted/50' : 'bg-muted/30';
  const statusLabel = t(`roadmap.${quarter.status}`);
  const statusClass = 'bg-muted text-foreground border border-border';

  return (
    <div className={`flex items-start space-x-4 p-4 rounded-lg border ${bgClass}`}>
      <div className="flex-shrink-0">
        {isCompleted ? (
          <CheckCircle className="w-6 h-6 text-foreground" />
        ) : (
          <Calendar className={`w-6 h-6 ${isInProgress ? 'text-foreground' : 'text-muted-foreground'}`} />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">{quarter.title}</h3>
          <Badge variant="outline" className={statusClass}>{statusLabel}</Badge>
        </div>
        <div className="text-muted-foreground text-sm leading-relaxed space-y-1">
          {(Array.isArray(quarter.items) ? quarter.items : []).map((item, i) => (
            <div key={i} className="flex">
              <span className="mr-2 flex-shrink-0">•</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Roadmap = () => {
  const [selectedYear, setSelectedYear] = useState('2026');
  const { t } = useLanguage();

  const years: { value: string; label: string; yearTitle: string; quarters: QuarterData[] }[] = [
    {
      value: '2021', label: '21', yearTitle: t('roadmap.y2021'),
      quarters: [
        { id: 'q1-2021', title: t('roadmap.q1_2021'), items: t('roadmap.q1_2021_items') as unknown as string[], status: 'completed' },
        { id: 'q2-2021', title: t('roadmap.q2_2021'), items: t('roadmap.q2_2021_items') as unknown as string[], status: 'completed' },
        { id: 'q3-2021', title: t('roadmap.q3_2021'), items: t('roadmap.q3_2021_items') as unknown as string[], status: 'completed' },
        { id: 'q4-2021', title: t('roadmap.q4_2021'), items: t('roadmap.q4_2021_items') as unknown as string[], status: 'completed' },
      ],
    },
    {
      value: '2022', label: '22', yearTitle: t('roadmap.y2022'),
      quarters: [
        { id: 'q1-2022', title: t('roadmap.q1_2022'), items: t('roadmap.q1_2022_items') as unknown as string[], status: 'completed' },
        { id: 'q2-2022', title: t('roadmap.q2_2022'), items: t('roadmap.q2_2022_items') as unknown as string[], status: 'completed' },
        { id: 'q3-2022', title: t('roadmap.q3_2022'), items: t('roadmap.q3_2022_items') as unknown as string[], status: 'completed' },
        { id: 'q4-2022', title: t('roadmap.q4_2022'), items: t('roadmap.q4_2022_items') as unknown as string[], status: 'completed' },
      ],
    },
    {
      value: '2023', label: '23', yearTitle: t('roadmap.y2023'),
      quarters: [
        { id: 'q1-2023', title: t('roadmap.q1_2023'), items: t('roadmap.q1_2023_items') as unknown as string[], status: 'completed' },
        { id: 'q2-2023', title: t('roadmap.q2_2023'), items: t('roadmap.q2_2023_items') as unknown as string[], status: 'completed' },
        { id: 'q3-2023', title: t('roadmap.q3_2023'), items: t('roadmap.q3_2023_items') as unknown as string[], status: 'completed' },
        { id: 'q4-2023', title: t('roadmap.q4_2023'), items: t('roadmap.q4_2023_items') as unknown as string[], status: 'completed' },
      ],
    },
    {
      value: '2024', label: '24', yearTitle: t('roadmap.y2024'),
      quarters: [
        { id: 'q1-2024', title: t('roadmap.q1_2024'), items: t('roadmap.q1_2024_items') as unknown as string[], status: 'completed' },
        { id: 'q2-2024', title: t('roadmap.q2_2024'), items: t('roadmap.q2_2024_items') as unknown as string[], status: 'completed' },
        { id: 'q3-2024', title: t('roadmap.q3_2024'), items: t('roadmap.q3_2024_items') as unknown as string[], status: 'completed' },
        { id: 'q4-2024', title: t('roadmap.q4_2024'), items: t('roadmap.q4_2024_items') as unknown as string[], status: 'completed' },
      ],
    },
    {
      value: '2025', label: '25', yearTitle: t('roadmap.y2025'),
      quarters: [
        { id: 'q1-2025', title: t('roadmap.q1_2025'), items: t('roadmap.q1_2025_items') as unknown as string[], status: 'completed' },
        { id: 'q2-2025', title: t('roadmap.q2_2025'), items: t('roadmap.q2_2025_items') as unknown as string[], status: 'completed' },
        { id: 'q3-2025', title: t('roadmap.q3_2025'), items: t('roadmap.q3_2025_items') as unknown as string[], status: 'completed' },
        { id: 'q4-2025', title: t('roadmap.q4_2025'), items: t('roadmap.q4_2025_items') as unknown as string[], status: 'completed' },
      ],
    },
    {
      value: '2026', label: '26+', yearTitle: t('roadmap.y2026'),
      quarters: [
        { id: 'q1q2-2026', title: t('roadmap.q1q2_2026'), items: t('roadmap.q1q2_2026_items') as unknown as string[], status: 'inProgress' },
        { id: 'q2q4-2026', title: t('roadmap.q2q4_2026'), items: t('roadmap.q2q4_2026_items') as unknown as string[], status: 'planned' },
      ],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('roadmap.title')}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('roadmap.subtitle')}</p>
      </div>

      <Tabs value={selectedYear} onValueChange={setSelectedYear} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          {years.map((y) => (
            <TabsTrigger key={y.value} value={y.value} className="text-sm">{y.label}</TabsTrigger>
          ))}
        </TabsList>

        {years.map((year) => (
          <TabsContent key={year.value} value={year.value} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>{year.yearTitle}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {year.quarters.map((q) => (
                    <QuarterBlock key={q.id} quarter={q} t={t} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('roadmap.lookingAhead')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{t('roadmap.lookingAheadDesc')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Roadmap;
