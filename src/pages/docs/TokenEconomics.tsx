import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { useLanguage } from '@/contexts/LanguageContext';

const TokenEconomics = () => {
  const { t } = useLanguage();

  const supplyData = [
    { name: t('tokenEconomics.communitySales'), value: 42, fill: '#1a1a1a' },
    { name: t('tokenEconomics.burn'), value: 42, fill: '#4a4a4a' },
    { name: t('tokenEconomics.team'), value: 8, fill: '#7a7a7a' },
    { name: t('tokenEconomics.operations'), value: 8, fill: '#b0b0b0' },
  ];

  const chartConfig = {
    community: { label: t('tokenEconomics.communitySales'), color: "#1a1a1a" },
    burn: { label: t('tokenEconomics.burn'), color: "#4a4a4a" },
    team: { label: t('tokenEconomics.team'), color: "#7a7a7a" },
    operations: { label: t('tokenEconomics.operations'), color: "#b0b0b0" },
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenEconomics.title')}</h1>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('tokenEconomics.supplyDistribution')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-bold text-foreground text-center text-sm">{t('tokenEconomics.totalSupply')}</p>
            <ChartContainer config={chartConfig} className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={supplyData} cx="50%" cy="50%" labelLine={false} label={({ value }) => `${value}%`} outerRadius={120} fill="#8884d8" dataKey="value">
                    {supplyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="text-sm font-medium">{payload[0].name}</div>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    content={(props) => {
                      const { payload } = props;
                      return (
                        <div className="flex flex-wrap justify-center gap-4 mt-4">
                          {payload?.map((entry: any, index: number) => (
                            <div key={`legend-${index}`} className="flex items-center gap-2">
                              <div className="w-10 h-6 flex items-center justify-center text-xs font-semibold rounded" style={{ backgroundColor: entry.color, color: parseInt(String(entry.color).slice(1, 3), 16) > 136 ? '#1a1a1a' : '#ffffff' }}>
                                {entry.payload.value}%
                              </div>
                              <span className="text-sm text-muted-foreground">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('tokenEconomics.dilutionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenEconomics.dilutionDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('tokenEconomics.salesTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenEconomics.salesDesc')}</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="text-xl text-yellow-800 dark:text-yellow-200">{t('tokenEconomics.disclaimer')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-yellow-700 dark:text-yellow-300 leading-relaxed text-sm">{t('tokenEconomics.disclaimerText')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TokenEconomics;
