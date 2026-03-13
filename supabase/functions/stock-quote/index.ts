const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    if (!symbol || typeof symbol !== 'string') {
      return new Response(JSON.stringify({ found: false, error: 'Missing symbol' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clean = symbol.replace(/^\$/, '').toUpperCase().slice(0, 10);

    // Fetch chart + quote in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=1d&interval=5m&includePrePost=false`;
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(clean)}`;

    const [chartRes, quoteRes] = await Promise.all([
      fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(quoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    ]);

    let result: any = null;
    let meta: any = {};
    let chartData: { time: number; price: number }[] = [];

    if (chartRes.ok) {
      const data = await chartRes.json();
      result = data?.chart?.result?.[0];
      if (result) {
        meta = result.meta || {};
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        chartData = timestamps.map((t: number, i: number) => ({
          time: t * 1000,
          price: closes[i] ?? null,
        })).filter((p: { time: number; price: number | null }) => p.price !== null);
      }
    } else {
      const text = await chartRes.text();
      console.error('Yahoo Finance chart error:', chartRes.status, text);
    }

    // Extract rich quote data
    let q: Record<string, unknown> | null = null;
    try {
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        q = quoteData?.quoteResponse?.result?.[0] ?? null;
      } else {
        await quoteRes.text();
      }
    } catch (e) {
      console.error('Quote fetch error:', e);
    }

    // If neither chart nor quote found anything, bail
    if (!result && !q) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use quote data as fallback for meta if chart failed
    if (!result && q) {
      meta = {
        symbol: q.symbol,
        shortName: q.shortName || q.longName,
        regularMarketPrice: q.regularMarketPrice,
        chartPreviousClose: q.regularMarketPreviousClose,
        previousClose: q.regularMarketPreviousClose,
        currency: q.currency || 'USD',
        exchangeName: q.exchange,
        fullExchangeName: q.fullExchangeName,
        instrumentType: q.quoteType || '',
      };
    }

    const instrumentType = (meta.instrumentType || (q?.quoteType as string) || '').toUpperCase();

    const validTypes = ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'FUTURE'];
    if (!validTypes.includes(instrumentType)) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const change24h = price && previousClose ? price - previousClose : null;
    const percentChange24h = price && previousClose ? ((price - previousClose) / previousClose) * 100 : null;

    // Build chart data
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const chartData = timestamps.map((t: number, i: number) => ({
      time: t * 1000,
      price: closes[i] ?? null,
    })).filter((p: { time: number; price: number | null }) => p.price !== null);

    // Extract rich quote data
    let q: Record<string, unknown> | null = null;
    try {
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        q = quoteData?.quoteResponse?.result?.[0] ?? null;
      } else {
        await quoteRes.text();
      }
    } catch (e) {
      console.error('Quote fetch error:', e);
    }

    const exchange = meta.exchangeName || meta.fullExchangeName || '';

    const payload = {
      found: true,
      name: (q?.longName as string) || (q?.shortName as string) || meta.shortName || meta.symbol || clean,
      symbol: meta.symbol || clean,
      exchange: meta.fullExchangeName || exchange,
      exchangeShort: exchange,
      currency: meta.currency || 'USD',
      instrumentType,
      price,
      change24h,
      percentChange24h,
      previousClose,
      dayHigh: (q?.regularMarketDayHigh as number) ?? null,
      dayLow: (q?.regularMarketDayLow as number) ?? null,
      marketCap: (q?.marketCap as number) ?? null,
      volume24h: (q?.regularMarketVolume as number) ?? null,
      chartData,

      // 52-week
      fiftyTwoWeekHigh: (q?.fiftyTwoWeekHigh as number) ?? null,
      fiftyTwoWeekLow: (q?.fiftyTwoWeekLow as number) ?? null,
      fiftyTwoWeekChangePercent: (q?.['52WeekChange'] as number) ?? null,

      // Moving averages
      fiftyDayAverage: (q?.fiftyDayAverage as number) ?? null,
      twoHundredDayAverage: (q?.twoHundredDayAverage as number) ?? null,
      fiftyDayAverageChangePercent: (q?.fiftyDayAverageChangePercent as number) ?? null,
      twoHundredDayAverageChangePercent: (q?.twoHundredDayAverageChangePercent as number) ?? null,

      // Valuation
      trailingPE: (q?.trailingPE as number) ?? null,
      forwardPE: (q?.forwardPE as number) ?? null,
      epsTrailingTwelveMonths: (q?.epsTrailingTwelveMonths as number) ?? null,
      epsForward: (q?.epsForward as number) ?? null,
      epsCurrentYear: (q?.epsCurrentYear as number) ?? null,
      priceToBook: (q?.priceToBook as number) ?? null,
      bookValue: (q?.bookValue as number) ?? null,

      // Dividends
      dividendRate: (q?.trailingAnnualDividendRate as number) ?? (q?.dividendRate as number) ?? null,
      dividendYield: (q?.trailingAnnualDividendYield as number) ?? (q?.dividendYield as number) ?? null,
      exDividendDate: (q?.exDividendDate as number) ?? null,

      // Shares & float
      sharesOutstanding: (q?.sharesOutstanding as number) ?? null,
      floatShares: (q?.floatShares as number) ?? null,
      shortRatio: (q?.shortRatio as number) ?? null,
      shortPercentOfFloat: (q?.shortPercentOfFloat as number) ?? null,

      // Trading
      bid: (q?.bid as number) ?? null,
      ask: (q?.ask as number) ?? null,
      bidSize: (q?.bidSize as number) ?? null,
      askSize: (q?.askSize as number) ?? null,
      averageDailyVolume3Month: (q?.averageDailyVolume3Month as number) ?? null,
      averageDailyVolume10Day: (q?.averageDailyVolume10Day as number) ?? null,

      // Earnings & analyst
      earningsTimestamp: (q?.earningsTimestamp as number) ?? null,
      targetMeanPrice: (q?.targetMeanPrice as number) ?? null,
      targetHighPrice: (q?.targetHighPrice as number) ?? null,
      targetLowPrice: (q?.targetLowPrice as number) ?? null,
      recommendationKey: (q?.recommendationKey as string) ?? null,
      recommendationMean: (q?.recommendationMean as number) ?? null,
      numberOfAnalystOpinions: (q?.numberOfAnalystOpinions as number) ?? null,

      // Company info
      sector: (q?.sector as string) ?? null,
      industry: (q?.industry as string) ?? null,

      // Revenue & margins
      revenue: (q?.revenue as number) ?? null,
      revenuePerShare: (q?.revenuePerShare as number) ?? null,
      profitMargins: (q?.profitMargins as number) ?? null,
      enterpriseValue: (q?.enterpriseValue as number) ?? null,

      // Pre/post market
      preMarketPrice: (q?.preMarketPrice as number) ?? null,
      preMarketChange: (q?.preMarketChange as number) ?? null,
      preMarketChangePercent: (q?.preMarketChangePercent as number) ?? null,
      postMarketPrice: (q?.postMarketPrice as number) ?? null,
      postMarketChange: (q?.postMarketChange as number) ?? null,
      postMarketChangePercent: (q?.postMarketChangePercent as number) ?? null,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('stock-quote error:', err);
    return new Response(JSON.stringify({ found: false, error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
