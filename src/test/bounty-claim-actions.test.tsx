import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BountyClaimActions from '@/components/app/cards/BountyClaimActions';
import { getBountyEligibility, submitBountyClaim } from '@/lib/bounty-claim';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: '0xabc', openLoginModal: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/bounty-claim', () => ({ getBountyEligibility: vi.fn(), submitBountyClaim: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BountyClaimActions tokenId="5588" open />
  </QueryClientProvider>);
}

describe('bounty claim actions', () => {
  it('offers and submits a commenter claim from the reward drawer', async () => {
    vi.mocked(getBountyEligibility).mockResolvedValue({ result: { commentor: { r: 'r', s: 's', v: 27 } } });
    vi.mocked(submitBountyClaim).mockResolvedValue('0xreceipt');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'staking.claim · drawers.rewardedEngaging' }));
    await waitFor(() => expect(submitBountyClaim).toHaveBeenCalledWith('5588', 'commentor'));
    expect(await screen.findByText('toasts.rewards_claimed')).toBeInTheDocument();
  });
  it('refreshes eligibility after the user has commented', async () => {
    vi.mocked(getBountyEligibility).mockResolvedValueOnce({ error: 'Not Eligible', result: {} })
      .mockResolvedValue({ result: { commentor: { r: 'r', s: 's', v: 27 } } });
    mount();
    await screen.findByText('Not Eligible');
    fireEvent.click(screen.getByRole('button', { name: 'toasts.refresh' }));
    expect(await screen.findByRole('button', { name: 'staking.claim · drawers.rewardedEngaging' })).toBeEnabled();
  });
  it('does not offer another claim after the backend records payment', async () => {
    vi.mocked(getBountyEligibility).mockResolvedValue({ result: { commentor_claimed: true } });
    mount();
    await screen.findByText('toasts.rewards_claimed');
    expect(screen.queryByRole('button', { name: /staking.claim/ })).toBeNull();
  });
});
