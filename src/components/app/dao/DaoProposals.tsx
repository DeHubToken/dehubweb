import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Clock3, Loader2, Send, ShoppingCart, ThumbsDown, ThumbsUp, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import {
  effectiveDaoProposalStatus,
  useCreateDaoProposal,
  useDaoProposals,
  useSubmitDaoPayment,
  useVoteDaoProposal,
  type DaoProposal,
  type DaoProposalKind,
} from '@/hooks/use-dao-proposals';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import {
  DAO_PAYMENT_OPTIONS,
  daoPaymentRecipient,
  sendDaoOfferPayment,
  type DaoPaymentOption,
} from '@/lib/dao-offer-payment';
import { shortAddress } from '@/lib/dao-treasury';
import { CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { isWalletLockedError } from '@/lib/contracts/aa-utils';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

function deadlineLabel(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'Voting closed';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}

function statusLabel(proposal: DaoProposal): string {
  const status = effectiveDaoProposalStatus(proposal);
  if (status === 'payment_submitted') return 'Payment under review';
  if (status === 'accepted' && proposal.kind === 'buy') return 'Accepted · awaiting payment';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(proposal: DaoProposal): string {
  const status = effectiveDaoProposalStatus(proposal);
  if (status === 'accepted' || status === 'completed') return 'text-emerald-300 bg-emerald-400/10';
  if (status === 'rejected' || status === 'expired' || status === 'cancelled') return 'text-rose-300 bg-rose-400/10';
  if (status === 'payment_submitted') return 'text-sky-300 bg-sky-400/10';
  return 'text-amber-200 bg-amber-400/10';
}

function ProposalCard({ proposal, focused, onPay, ownVote, ownWeight }: {
  proposal: DaoProposal;
  focused: boolean;
  onPay: (proposal: DaoProposal) => void;
  ownVote?: 1 | -1;
  ownWeight: number;
}) {
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const vote = useVoteDaoProposal();
  const effectiveStatus = effectiveDaoProposalStatus(proposal);
  const isOpen = effectiveStatus === 'open';
  const cast = proposal.accept_dhb + proposal.reject_dhb;
  const acceptPct = cast > 0 ? (proposal.accept_dhb / cast) * 100 : 0;
  const quorumPct = proposal.electorate_dhb > 0 ? Math.min(100, (cast / proposal.electorate_dhb) * 100) : 0;
  const isBuyer = walletAddress?.toLowerCase() === proposal.proposer_address.toLowerCase();

  const castVote = (voteType: 1 | -1) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    vote.mutate({ proposalId: proposal.id, voteType }, {
      onSuccess: (result) => toast.success(result.action === 'removed' ? 'Vote withdrawn' : 'Vote recorded'),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not record vote'),
    });
  };

  const explorer = proposal.payment_tx_hash && proposal.payment_chain_id && proposal.payment_chain_id !== 101
    ? `${CHAIN_CONFIGS[proposal.payment_chain_id as keyof typeof CHAIN_CONFIGS]?.explorerUrl}/tx/${proposal.payment_tx_hash}`
    : proposal.payment_tx_hash && proposal.payment_chain_id === 101
      ? `https://solscan.io/tx/${proposal.payment_tx_hash}`
      : null;

  return (
    <article
      id={`dao-proposal-${proposal.id}`}
      className={`rounded-2xl border p-4 sm:p-5 transition-colors ${focused ? 'border-white/35 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">
              {proposal.kind === 'buy' ? 'Buy offer' : 'Spend request'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(proposal)}`}>
              {statusLabel(proposal)}
            </span>
            {isOpen && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Clock3 className="w-3 h-3" /> {deadlineLabel(proposal.voting_ends_at)}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-white leading-snug">{proposal.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            by {proposal.proposer_username ? `@${proposal.proposer_username}` : shortAddress(proposal.proposer_address)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {proposal.kind === 'buy' ? (
            <>
              <div className="font-semibold text-white">{number.format(proposal.dhb_amount ?? 0)} DHB</div>
              <div className="text-xs text-zinc-400">
                {money.format(proposal.total_usd ?? 0)} · ${number.format(proposal.price_usd ?? 0)}/DHB
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-white">{number.format(proposal.spend_amount ?? 0)} {proposal.spend_asset}</div>
              <div className="text-xs text-zinc-500">to {shortAddress(proposal.recipient_address ?? '')}</div>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap">{proposal.description}</p>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-rose-400/20">
          <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${acceptPct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-emerald-300">Accept {number.format(proposal.accept_dhb)} DHB</span>
          <span className="text-rose-300">Reject {number.format(proposal.reject_dhb)} DHB</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {number.format(quorumPct)}% participation · 10% quorum · contribution-weighted snapshot
        </p>
      </div>

      {isOpen && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant={ownVote === 1 ? 'default' : 'outline'}
            className="rounded-xl"
            disabled={vote.isPending || (isAuthenticated && ownWeight <= 0)}
            onClick={() => castVote(1)}
          >
            <ThumbsUp className="w-4 h-4" /> Accept
          </Button>
          <Button
            size="sm"
            variant={ownVote === -1 ? 'destructive' : 'outline'}
            className="rounded-xl"
            disabled={vote.isPending || (isAuthenticated && ownWeight <= 0)}
            onClick={() => castVote(-1)}
          >
            <ThumbsDown className="w-4 h-4" /> Reject
          </Button>
          {isAuthenticated && ownWeight > 0 && (
            <span className="ml-auto text-xs text-zinc-500">Your weight: {number.format(ownWeight)} DHB</span>
          )}
        </div>
      )}

      {isOpen && isAuthenticated && ownWeight <= 0 && (
        <p className="mt-3 text-xs text-zinc-500">Only contributors captured when this proposal opened can vote.</p>
      )}

      {proposal.status === 'accepted' && proposal.kind === 'buy' && isBuyer && (
        <Button size="sm" className="mt-4 rounded-xl" onClick={() => onPay(proposal)}>
          <WalletCards className="w-4 h-4" /> Transfer payment
        </Button>
      )}

      {proposal.status === 'open' && effectiveStatus === 'accepted' && proposal.kind === 'buy' && isBuyer && (
        <p className="mt-4 text-xs text-zinc-500">The result is being finalised. Payment will open automatically after confirmation.</p>
      )}

      {proposal.payment_tx_hash && (
        <div className="mt-4 rounded-xl bg-sky-400/[0.07] p-3 text-xs text-sky-100">
          <div className="flex items-center gap-2 font-medium"><Check className="w-4 h-4" /> Payment proof submitted for manual DAO verification</div>
          {explorer && <a href={explorer} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sky-300 hover:underline">View transaction</a>}
        </div>
      )}
    </article>
  );
}

function ProposeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<DaoProposalKind>('buy');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dhbAmount, setDhbAmount] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [spendAsset, setSpendAsset] = useState('USDC');
  const [spendAmount, setSpendAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const create = useCreateDaoProposal();
  const total = Number(dhbAmount) * Number(priceUsd);
  const buyValid = Number(dhbAmount) > 0 && Number(priceUsd) > 0;
  const spendValid = Number(spendAmount) > 0 && !!spendAsset.trim() && !!recipient.trim();
  const valid = !!title.trim() && !!description.trim() && (kind === 'buy' ? buyValid : spendValid);

  const submit = () => {
    if (!valid) return;
    create.mutate({
      kind,
      title,
      description,
      ...(kind === 'buy'
        ? { dhbAmount: Number(dhbAmount), priceUsd: Number(priceUsd) }
        : { spendAsset, spendAmount: Number(spendAmount), recipientAddress: recipient }),
    }, {
      onSuccess: () => {
        toast.success('Proposal opened for seven days');
        setTitle('');
        setDescription('');
        setDhbAmount('');
        setPriceUsd('');
        setSpendAmount('');
        setRecipient('');
        onOpenChange(false);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create proposal'),
    });
  };

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DrawerContent column glass hideHandle={false}>
        <div className="mx-auto w-full max-w-lg overflow-y-auto p-5 pb-8 max-h-[88vh]">
          <DrawerHeader className="p-0 mb-4">
            <DrawerTitle className="text-white">Propose to the DAO</DrawerTitle>
          </DrawerHeader>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <button type="button" onClick={() => setKind('buy')} className={`rounded-xl border p-3 text-left ${kind === 'buy' ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <ShoppingCart className="w-4 h-4 mb-2 text-zinc-300" />
              <div className="text-sm font-medium text-white">Offer to buy DHB</div>
              <div className="text-xs text-zinc-500">Name your quantity and price</div>
            </button>
            <button type="button" onClick={() => setKind('spend')} className={`rounded-xl border p-3 text-left ${kind === 'spend' ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <Send className="w-4 h-4 mb-2 text-zinc-300" />
              <div className="text-sm font-medium text-white">Request a spend</div>
              <div className="text-xs text-zinc-500">Ask the DAO to send an asset</div>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-zinc-400">Title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="What are contributors deciding?" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-zinc-400">Details</label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={4} placeholder="Explain the terms and why the DAO should accept." className="bg-white/5 border-white/10 text-white" />
            </div>

            {kind === 'buy' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">DHB amount</label>
                    <Input type="number" min="0" step="any" value={dhbAmount} onChange={(event) => setDhbAmount(event.target.value)} placeholder="1,000,000" className="bg-white/5 border-white/10 text-white" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Price per DHB (USD)</label>
                    <Input type="number" min="0" step="any" value={priceUsd} onChange={(event) => setPriceUsd(event.target.value)} placeholder="0.001" className="bg-white/5 border-white/10 text-white" />
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.05] p-4">
                  <div className="text-xs text-zinc-500">Offer value</div>
                  <div className="mt-1 text-2xl font-semibold text-white">{Number.isFinite(total) ? money.format(total) : '$0.00'}</div>
                  <p className="mt-1 text-xs text-zinc-500">No escrow. If accepted, you have 72 hours to transfer payment for manual DAO verification.</p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Asset</label>
                    <Input value={spendAsset} onChange={(event) => setSpendAsset(event.target.value.toUpperCase())} maxLength={16} placeholder="USDC" className="bg-white/5 border-white/10 text-white" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Amount</label>
                    <Input type="number" min="0" step="any" value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} placeholder="5,000" className="bg-white/5 border-white/10 text-white" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-400">Recipient address</label>
                  <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x… or Solana address" className="bg-white/5 border-white/10 text-white font-mono" />
                </div>
                <p className="text-xs text-zinc-500">An accepted spend is queued for manual DAO or multisig execution. This proposal never moves funds itself.</p>
              </>
            )}

            <div className="rounded-xl border border-white/10 p-3 text-xs text-zinc-400">
              Voting lasts 7 days. Voting power is each contributor’s cumulative DHB contribution when this proposal opens. At least 10% must participate and Accept must beat Reject.
            </div>

            <Button className="w-full rounded-xl" disabled={!valid || create.isPending} onClick={submit}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {create.isPending ? 'Opening proposal…' : 'Open proposal'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PaymentDrawer({ proposal, onOpenChange }: { proposal: DaoProposal | null; onOpenChange: (open: boolean) => void }) {
  const { isLoginModalOpen, requestWalletUnlock } = useAuth();
  const [selectedKey, setSelectedKey] = useState('8453:USDC');
  const [manualHash, setManualHash] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [hiddenForUnlock, setHiddenForUnlock] = useState(false);
  const [pendingAfterUnlock, setPendingAfterUnlock] = useState(false);
  const [unlockSheetSeen, setUnlockSheetSeen] = useState(false);
  const { mutate: submitPayment, isPending: submitting } = useSubmitDaoPayment();
  const walletLocked = useWalletLocked();
  const { data: prices = {} } = useTokenPrices();
  const option = DAO_PAYMENT_OPTIONS.find((item) => `${item.chainId}:${item.symbol}` === selectedKey) ?? DAO_PAYMENT_OPTIONS[0];
  const totalUsd = proposal?.total_usd ?? 0;
  const price = option.symbol === 'USDC' || option.symbol === 'USDT'
    ? 1
    : prices[option.symbol] || (option.symbol === 'ETH' ? prices.WETH : 0);
  const calculatedAmount = price > 0 ? totalUsd / price : 0;
  const amount = manualAmount ? Number(manualAmount) : calculatedAmount;
  const recipient = daoPaymentRecipient(option.chainId);

  const record = useCallback((txHash: string, paidAmount: number) => {
    if (!proposal) return;
    submitPayment({ proposalId: proposal.id, chainId: option.chainId, asset: option.symbol, amount: paidAmount, txHash }, {
      onSuccess: () => {
        toast.success('Payment submitted for manual DAO verification');
        onOpenChange(false);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not record payment proof'),
    });
  }, [onOpenChange, option.chainId, option.symbol, proposal, submitPayment]);

  const queueUnlock = useCallback(() => {
    setPendingAfterUnlock(true);
    setUnlockSheetSeen(false);
    setHiddenForUnlock(true);
    window.requestAnimationFrame(() => requestWalletUnlock());
  }, [requestWalletUnlock]);

  const transferNow = useCallback(async () => {
    if (!proposal || !option.enabled || !amount) return;
    setSending(true);
    try {
      const result = await sendDaoOfferPayment(option, amount);
      record(result.hash, amount);
    } catch (error) {
      if (isWalletLockedError(error)) queueUnlock();
      else toast.error(error instanceof Error ? error.message : 'Payment did not go through');
    } finally {
      setSending(false);
    }
  }, [amount, option, proposal, queueUnlock, record]);

  useEffect(() => {
    if (!proposal) {
      setHiddenForUnlock(false);
      setPendingAfterUnlock(false);
      setUnlockSheetSeen(false);
    }
  }, [proposal]);

  useEffect(() => {
    if (!pendingAfterUnlock) return;
    if (isLoginModalOpen) {
      if (!unlockSheetSeen) setUnlockSheetSeen(true);
      return;
    }
    if (!unlockSheetSeen) return;

    setPendingAfterUnlock(false);
    setUnlockSheetSeen(false);
    setHiddenForUnlock(false);
    if (!walletLocked) void transferNow();
  }, [isLoginModalOpen, pendingAfterUnlock, transferNow, unlockSheetSeen, walletLocked]);

  const transfer = () => {
    if (walletLocked) {
      queueUnlock();
      return;
    }
    void transferNow();
  };

  return (
    <Drawer open={!!proposal && !hiddenForUnlock} onOpenChange={(open) => { if (!sending && !submitting) onOpenChange(open); }}>
      <DrawerContent column glass hideHandle={false}>
        <div className="mx-auto w-full max-w-lg overflow-y-auto p-5 pb-8 max-h-[88vh]">
          <DrawerHeader className="p-0 mb-4"><DrawerTitle className="text-white">Pay accepted buy offer</DrawerTitle></DrawerHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-white/[0.05] p-4">
              <div className="text-xs text-zinc-500">Agreed value</div>
              <div className="text-2xl font-semibold text-white">{money.format(totalUsd)}</div>
              <div className="text-xs text-zinc-400">for {number.format(proposal?.dhb_amount ?? 0)} DHB</div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-zinc-400">Pay with</label>
              <select value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); setManualAmount(''); }} className="h-10 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm text-white">
                {DAO_PAYMENT_OPTIONS.map((item) => (
                  <option key={`${item.chainId}:${item.symbol}`} value={`${item.chainId}:${item.symbol}`} disabled={!item.enabled}>
                    {item.symbol} · {item.chain}{item.enabled ? '' : ' · awaiting treasury setup'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-zinc-400">Amount</label>
              <Input type="number" min="0" step="any" value={manualAmount || (calculatedAmount ? String(Number(calculatedAmount.toPrecision(8))) : '')} onChange={(event) => setManualAmount(event.target.value)} className="bg-white/5 border-white/10 text-white" />
              <p className="mt-1 text-xs text-zinc-500">Live-price estimate. The DAO manually checks the USD value at payment time.</p>
            </div>

            <div className="rounded-xl border border-white/10 p-3 text-xs text-zinc-400">
              Direct to DAO · no escrow<br />
              <span className="font-mono break-all text-zinc-300">{recipient ?? option.unavailableReason}</span>
            </div>

            <Button className="w-full rounded-xl" disabled={!option.enabled || !amount || sending || submitting} onClick={transfer}>
              {sending || submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <WalletCards className="w-4 h-4" />}
              {sending ? 'Waiting for wallet…' : submitting ? 'Recording payment…' : `Transfer ${option.symbol}`}
            </Button>

            <div className="border-t border-white/10 pt-4">
              <div className="text-xs font-medium text-zinc-300">Already transferred?</div>
              <p className="mt-1 text-xs text-zinc-500">Paste the transaction hash to send it for the same manual review.</p>
              <div className="mt-3 space-y-2">
                <Input value={manualHash} onChange={(event) => setManualHash(event.target.value)} placeholder="Transaction hash" className="bg-white/5 border-white/10 text-white font-mono" />
                <Button variant="outline" className="w-full rounded-xl" disabled={!manualHash.trim() || !amount || submitting} onClick={() => record(manualHash.trim(), amount)}>
                  Submit payment proof
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function DaoProposalExperience({ proposeOpen, onProposeOpenChange }: {
  proposeOpen: boolean;
  onProposeOpenChange: (open: boolean) => void;
}) {
  const { proposals, myVotes, myEligibility, isLoading, isError } = useDaoProposals();
  const [searchParams] = useSearchParams();
  const focusedId = searchParams.get('proposal');
  const [paymentProposal, setPaymentProposal] = useState<DaoProposal | null>(null);
  const ordered = useMemo(() => focusedId
    ? [...proposals].sort((a, b) => Number(b.id === focusedId) - Number(a.id === focusedId))
    : proposals, [focusedId, proposals]);

  return (
    <>
      <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">DAO proposals</h2>
            <p className="text-xs text-zinc-500">Anyone can propose. Contributors accept or reject with their recorded contribution weight.</p>
          </div>
          <span className="text-xs text-zinc-500">{proposals.length} total</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-rose-300">Could not load DAO proposals.</p>
        ) : ordered.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingCart className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">No proposals yet</p>
            <p className="text-xs text-zinc-600">Open the first buy offer or spending request.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordered.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                focused={proposal.id === focusedId}
                onPay={setPaymentProposal}
                ownVote={myVotes[proposal.id]?.type}
                ownWeight={myEligibility[proposal.id] ?? 0}
              />
            ))}
          </div>
        )}
      </section>
      <ProposeDrawer open={proposeOpen} onOpenChange={onProposeOpenChange} />
      <PaymentDrawer proposal={paymentProposal} onOpenChange={(open) => { if (!open) setPaymentProposal(null); }} />
    </>
  );
}
