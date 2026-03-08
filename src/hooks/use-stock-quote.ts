import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PricePoint } from '@/hooks/use-token-chart';

export interface StockQuote {
  found: boolean;
  name: string;
  symbol: string;
  exchange: string;
  exchangeShort: string;
  currency: string;
  instrumentType: string;
  price: number | null;
  change24h: number | null;
  percentChange24h: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketCap: number | null;
  volume24h: number | null;
  chartData: PricePoint[];

  // 52-week
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekChangePercent: number | null;

  // Moving averages
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  fiftyDayAverageChangePercent: number | null;
  twoHundredDayAverageChangePercent: number | null;

  // Valuation
  trailingPE: number | null;
  forwardPE: number | null;
  epsTrailingTwelveMonths: number | null;
  epsForward: number | null;
  epsCurrentYear: number | null;
  priceToBook: number | null;
  bookValue: number | null;

  // Dividends
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: number | null;

  // Shares & float
  sharesOutstanding: number | null;
  floatShares: number | null;
  shortRatio: number | null;
  shortPercentOfFloat: number | null;

  // Trading
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  averageDailyVolume3Month: number | null;
  averageDailyVolume10Day: number | null;

  // Earnings & analyst
  earningsTimestamp: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;

  // Company
  sector: string | null;
  industry: string | null;

  // Revenue
  revenue: number | null;
  revenuePerShare: number | null;
  profitMargins: number | null;
  enterpriseValue: number | null;

  // Pre/post market
  preMarketPrice: number | null;
  preMarketChange: number | null;
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChange: number | null;
  postMarketChangePercent: number | null;
}

export function useStockQuote(query: string, enabled: boolean) {
  const symbol = query.trim().replace(/^\$/, '').toUpperCase();
  const isValidTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol);

  return useQuery<StockQuote | null>({
    queryKey: ['stock-quote', symbol],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('stock-quote', {
        body: { symbol },
      });
      if (error) {
        console.error('Stock quote error:', error);
        return null;
      }
      if (!data?.found) return null;
      return data as StockQuote;
    },
    enabled: enabled && isValidTicker && symbol.length >= 1,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}
