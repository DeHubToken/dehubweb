import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Target, DollarSign } from 'lucide-react';

const CampaignAnalytics = () => {
  const performanceData = [
    { date: '1/1', impressions: 12000, clicks: 384, spend: 180 },
    { date: '1/2', impressions: 15000, clicks: 450, spend: 225 },
    { date: '1/3', impressions: 18000, clicks: 612, spend: 270 },
    { date: '1/4', impressions: 14000, clicks: 420, spend: 210 },
    { date: '1/5', impressions: 20000, clicks: 700, spend: 300 },
    { date: '1/6', impressions: 22000, clicks: 770, spend: 330 },
    { date: '1/7', impressions: 19000, clicks: 665, spend: 285 }
  ];

  const tierPerformance = [
    { tier: 'Crab', impressions: 15000, clicks: 480, ctr: '3.2%', cost: '$300' },
    { tier: 'Lobster', impressions: 12000, clicks: 420, ctr: '3.5%', cost: '$450' },
    { tier: 'Piranha', impressions: 8000, clicks: 320, ctr: '4.0%', cost: '$400' },
    { tier: 'Tortoise', impressions: 5000, clicks: 225, ctr: '4.5%', cost: '$312' },
    { tier: 'Cobra', impressions: 3000, clicks: 150, ctr: '5.0%', cost: '$225' }
  ];

  const audienceBreakdown = [
    { name: 'Crab Badge', value: 35, color: '#f97316' },
    { name: 'Lobster Badge', value: 25, color: '#ef4444' },
    { name: 'Piranha Badge', value: 20, color: '#8b5cf6' },
    { name: 'Tortoise Badge', value: 12, color: '#22c55e' },
    { name: 'Cobra Badge', value: 8, color: '#374151' }
  ];

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold text-royal-blue">120K</p>
                <p className="text-xs text-green-600">+12% vs last week</p>
              </div>
              <Users className="w-8 h-8 text-middle-blue" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Click-through Rate</p>
                <p className="text-2xl font-bold text-royal-blue">3.8%</p>
                <p className="text-xs text-green-600">+0.5% vs last week</p>
              </div>
              <Target className="w-8 h-8 text-middle-blue" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold text-royal-blue">$1,687</p>
                <p className="text-xs text-red-600">+$200 vs last week</p>
              </div>
              <DollarSign className="w-8 h-8 text-middle-blue" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ROAS</p>
                <p className="text-2xl font-bold text-royal-blue">4.2x</p>
                <p className="text-xs text-green-600">+0.3x vs last week</p>
              </div>
              <TrendingUp className="w-8 h-8 text-middle-blue" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={audienceBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {audienceBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {audienceBreakdown.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-muted-foreground">{entry.name}: {entry.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance by Badge Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tierPerformance.map((tier, index) => (
              <div key={tier.tier} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-middle-blue to-royal-blue flex items-center justify-center text-white text-sm font-bold">
                    {tier.tier[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold">{tier.tier} Badge</h3>
                    <p className="text-sm text-muted-foreground">{tier.impressions.toLocaleString()} impressions</p>
                  </div>
                </div>
                <div className="flex items-center space-x-6 text-right">
                  <div>
                    <p className="text-sm text-muted-foreground">Clicks</p>
                    <p className="font-semibold">{tier.clicks}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">CTR</p>
                    <Badge variant="outline">{tier.ctr}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cost</p>
                    <p className="font-semibold">{tier.cost}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignAnalytics;
