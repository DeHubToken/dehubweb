import { formatUnits } from 'ethers';

/** Display labels such as '<0.01' must never be used for balance arithmetic. */
export function tokenAmount(token: { balance: bigint; decimals: number }): number {
  return Number(formatUnits(token.balance, token.decimals));
}

export function sumTokenAmounts(tokens: Array<{ balance: bigint; decimals: number }>): number {
  return tokens.reduce((sum, token) => sum + tokenAmount(token), 0);
}
