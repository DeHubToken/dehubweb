import { useState, useEffect } from 'react';
import { getUsageSummary, getHourlyBreakdown, clearUsageData, type UsageSummary } from '@/lib/cloud-usage-tracker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Database, Zap, Radio, AlertTriangle, Trash2 } from 'lucide-react';

type TimeWindow = '1h' | '6h' | '24h';

const WINDOW_MS: Record<TimeWindow, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export function CloudUsageDashboard() {
  const [window, setWindow] = useState<TimeWindow>('1h');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [hourly, setHourly] = useState<ReturnType<typeof getHourlyBreakdown>>([]);

  useEffect(() => {
    const refresh = () => {
      setSummary(getUsageSummary(WINDOW_MS[window]));
      setHourly(getHourlyBreakdown());
    };
    refresh();
    const interval = setInterval(refresh, 10_000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [window]);

  if (!summary) return null;

  const statusColor = summary.requestsPerMinute > 20 ? 'destructive' : summary.requestsPerMinute > 10 ? 'secondary' : 'outline';

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Cloud Usage Tracker
          </CardTitle>
          <div className="flex items-center gap-2">
            {(['1h', '6h', '24h'] as TimeWindow[]).map((w) => (
              <Button
                key={w}
                variant={window === w ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setWindow(w)}
              >
                {w}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground"
              onClick={() => {
                clearUsageData();
                setSummary(getUsageSummary(WINDOW_MS[window]));
                setHourly(getHourlyBreakdown());
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard icon={<Activity className="h-3.5 w-3.5" />} label="Total" value={summary.totalRequests} />
          <StatCard icon={<Database className="h-3.5 w-3.5" />} label="REST" value={summary.restQueries} />
          <StatCard icon={<Zap className="h-3.5 w-3.5" />} label="Functions" value={summary.edgeFunctionCalls} />
          <StatCard icon={<Radio className="h-3.5 w-3.5" />} label="Realtime" value={summary.realtimeEvents} />
          <StatCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Errors" value={summary.errors} variant={summary.errors > 0 ? 'error' : undefined} />
        </div>

        {/* Rate */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rate:</span>
          <Badge variant={statusColor} className="text-xs">
            {summary.requestsPerMinute} req/min
          </Badge>
          {summary.requestsPerMinute > 20 && (
            <span className="text-destructive text-xs">⚠ High usage</span>
          )}
        </div>

        {/* Hourly Chart */}
        {hourly.length > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly}>
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Requests" />
                <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} name="Errors" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Targets */}
        {summary.topTargets.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Top Targets</p>
            {summary.topTargets.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {t.type}
                  </Badge>
                  <span className="truncate text-foreground">{t.target}</span>
                </div>
                <span className="text-muted-foreground font-mono">{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ icon, label, value, variant }: { icon: React.ReactNode; label: string; value: number; variant?: 'error' }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${variant === 'error' && value > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-border/50 bg-background/50'}`}>
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${variant === 'error' && value > 0 ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
