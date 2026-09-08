import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, '..', '..', path), 'utf8');
const page = read('src/pages/app/DaoPage.tsx');
const hook = read('src/hooks/use-dao-proposals.ts');
const treasuryHook = read('src/hooks/use-dao-treasury.ts');
const edge = read('supabase/functions/dao-proposals/index.ts');
const migration = read('supabase/migrations/20260908163000_dao_proposals.sql');
const experience = read('src/components/app/dao/DaoProposals.tsx');
const payment = read('src/lib/dao-offer-payment.ts');

describe('DAO proposal and direct-transfer flow', () => {
  it('shows one treasury total with polling and a manual refresh', () => {
    expect(page).toContain('data?.totalBalance');
    expect(page).toContain('onClick={() => refetch()}');
    expect(page).not.toContain('data.balances.map');
    expect(treasuryHook).toContain('refetchInterval: 30_000');
    expect(treasuryHook).toContain('refetchOnWindowFocus: true');
  });

  it('puts Propose next to Contribute and supports buy and spend shapes', () => {
    expect(page).toContain('handlePropose');
    expect(page).toContain('DaoProposalExperience');
    expect(migration).toContain("kind IN ('spend', 'buy')");
    expect(migration).toContain('dhb_amount NUMERIC');
    expect(migration).toContain('price_usd NUMERIC');
    expect(migration).toContain('total_usd NUMERIC');
    expect(edge).toContain('Math.round(dhbAmount * priceUsd * 100) / 100');
  });

  it('keeps voting identity and contribution weight server-owned', () => {
    expect(edge).toContain('guardPaidEndpoint');
    expect(edge).toContain('readDaoContributors');
    expect(edge).toContain('dao_proposal_voters');
    expect(edge).toContain('vote_weight: eligible.vote_weight');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.dao_proposal_votes');
    expect(hook).not.toMatch(/voteWeight\s*:/);
  });

  it('enforces seven-day votes, quorum, payment deadline, and manual review notifications', () => {
    expect(edge).toContain('const VOTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000');
    expect(migration).toContain("p.electorate_dhb * 0.10");
    expect(migration).toContain("now() + interval '72 hours'");
    expect(migration).toContain("'dao_vote_deadline'");
    expect(migration).toContain("'dao_payment_deadline'");
    expect(migration).toContain("'dao_payment_submitted'");
    expect(migration).toContain('waiting for manual verification');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.resolve_due_dao_proposals() TO service_role');
  });

  it('records payment proof without claiming automatic settlement or escrow', () => {
    expect(edge).toContain('"create" | "vote" | "submit_payment"');
    expect(edge).toContain('status: "payment_submitted"');
    expect(edge).not.toContain('status: "completed"');
    expect(migration).toContain('This is deliberately not an escrow system');
  });

  it('offers supported multi-chain assets and preserves the unlock flow', () => {
    for (const asset of ['ETH', 'BNB', 'SOL', 'USDC', 'USDT']) {
      expect(payment).toContain(`symbol: '${asset}'`);
    }
    expect(payment).toContain('ROBINHOOD_CHAIN_ID');
    expect(experience).toContain("proposal.status === 'accepted'");
    expect(experience).toContain('const walletLocked = useWalletLocked()');
    expect(experience).toContain('window.requestAnimationFrame(() => requestWalletUnlock())');
    expect(experience).toContain('if (!walletLocked) void transferNow()');
  });
});
