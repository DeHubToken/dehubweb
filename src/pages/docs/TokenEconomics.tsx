import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from 'next-themes';

// Recharts writes fills as SVG attributes, which cannot read CSS variables, so
// the ramp is picked per docs mode. Largest share gets the strongest contrast
// against the card it sits on: near-black on paper, near-white on dark/glass.
const RAMP = {
  light: ['#1a1a1a', '#4a4a4a', '#7a7a7a', '#a3a3a3'],
  dark: ['#f2f2f2', '#b8b8b8', '#808080', '#595959'],
} as const;

const TokenEconomics = () => {
  const { t } = useLanguage();
  const { resolvedTheme, forcedTheme } = useTheme();
  const isDark = (forcedTheme ?? resolvedTheme) !== 'light';
  const ramp = isDark ? RAMP.dark : RAMP.light;
  // Slice labels sit outside the pie on the card, so they take the page ink,
  // not their slice's fill (Recharts' default, which vanished on dark).
  const labelInk = isDark ? '#ffffff' : '#0a0a0a';

  const supplyData = [
    { name: t('tokenEconomics.communitySales'), value: 42, fill: ramp[0] },
    { name: t('tokenEconomics.burn'), value: 42, fill: ramp[1] },
    { name: t('tokenEconomics.team'), value: 8, fill: ramp[2] },
    { name: t('tokenEconomics.operations'), value: 8, fill: ramp[3] },
  ];

  const chartConfig = {
    community: { label: t('tokenEconomics.communitySales'), color: ramp[0] },
    burn: { label: t('tokenEconomics.burn'), color: ramp[1] },
    team: { label: t('tokenEconomics.team'), color: ramp[2] },
    operations: { label: t('tokenEconomics.operations'), color: ramp[3] },
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
                  <Pie data={supplyData} cx="50%" cy="50%" labelLine={false} label={({ value, x, y, textAnchor }) => (
                    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill={labelInk} fontSize={14} fontWeight={600}>{`${value}%`}</text>
                  )} outerRadius={120} fill="#8884d8" dataKey="value">
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

        <Card className="docs-glass">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">{t('tokenEconomics.disclaimer')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed text-sm">{t('tokenEconomics.disclaimerText')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TokenEconomics;
