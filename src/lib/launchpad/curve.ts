// Pump.fun-style virtual-reserve bonding curve. Pure math, shared client + edge.
// price (in DHB) = (virtualDHB + dhbCollected) / (virtualSupply - supplySold)
// We assume DHB ≈ $1 placeholder for mcap in Phase 1.

export const CURVE = {
  virtualDHB: 30_000,          // virtual DHB reserve
  virtualSupply: 1_073_000_000, // virtual token supply
  totalSupply: 1_000_000_000,   // tradeable supply on curve
  graduationUsd: 42_000,        // mcap target
};

export function priceAt(supplySold: number, dhbCollected = 0): number {
  const num = CURVE.virtualDHB + dhbCollected;
  const den = CURVE.virtualSupply - supplySold;
  return den > 0 ? num / den : 0;
}

// Constant-product k = virtualDHB * virtualSupply.
// After spending dhbIn: newDHB = virtualDHB + dhbCollected + dhbIn
//                       newSupply = k / newDHB
//                       tokensOut = (virtualSupply - supplySold) - newSupply
export function buyQuote(supplySold: number, dhbCollected: number, dhbIn: number) {
  const k = CURVE.virtualDHB * CURVE.virtualSupply;
  const newDHB = CURVE.virtualDHB + dhbCollected + dhbIn;
  const newRemaining = k / newDHB;
  const remaining = CURVE.virtualSupply - supplySold;
  const tokensOut = Math.max(0, remaining - newRemaining);
  const avgPrice = tokensOut > 0 ? dhbIn / tokensOut : 0;
  return { tokensOut, avgPrice };
}

export function sellQuote(supplySold: number, dhbCollected: number, tokensIn: number) {
  const k = CURVE.virtualDHB * CURVE.virtualSupply;
  const remaining = CURVE.virtualSupply - supplySold;
  const newRemaining = remaining + tokensIn;
  const newDHB = k / newRemaining;
  const dhbOut = Math.max(0, (CURVE.virtualDHB + dhbCollected) - newDHB);
  const avgPrice = tokensIn > 0 ? dhbOut / tokensIn : 0;
  return { dhbOut, avgPrice };
}

export function marketCapUsd(supplySold: number, lastPrice: number): number {
  return Math.max(0, supplySold) * lastPrice;
}

export function progressBps(mcapUsd: number, target = CURVE.graduationUsd): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(10000, Math.floor((mcapUsd / target) * 10000)));
}
