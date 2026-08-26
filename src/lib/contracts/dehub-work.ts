/**
 * DeHubWork â€” on-chain escrow wiring
 * ==================================
 * Thin wagmi/AA wrapper around the DeHubWork contract. If
 * `DEHUB_WORK_ADDRESS` is the zero address (not yet deployed) every
 * helper resolves to `null` so the UI keeps working off-chain.
 *
 * Replace `DEHUB_WORK_ADDRESS` with the deployed Base address.
 */
import { Interface, parseUnits, formatUnits } from 'ethers';
import {
  writeContractAA,
  readContract,
  approveERC20,
  getERC20Allowance,
  getERC20Balance,
  getWalletAddress,
  switchChain,
  type AAWriteResult,
} from './aa-utils';
import { CHAIN_CONFIGS, BASE_CHAIN_ID } from './dhb-token';
import type { WorkCurrency, WorkJobType } from '@/features/work/types';


// â”€â”€ Addresses (Base) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const DEHUB_WORK_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: deploy + paste
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const isWorkContractDeployed = () =>
  DEHUB_WORK_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000';

/**
 * Block explorer link for a Work escrow/payout tx hash. Always Base: every
 * write below calls `switchChain(BASE_CHAIN_ID)` first and `getCurrencyToken`
 * only ever resolves Base tokens, so a Work tx cannot land on another chain.
 * Read the host from CHAIN_CONFIGS rather than hardcoding it a fifth time.
 */
export function workExplorerTxUrl(txHash: string): string {
  return `${CHAIN_CONFIGS[BASE_CHAIN_ID].explorerUrl}/tx/${txHash}`;
}

const ZERO = '0x0000000000000000000000000000000000000000';

// â”€â”€ ABI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const DEHUB_WORK_ABI = [
  'function createJob(address token, uint8 jobType, uint256 pricePerUnit, uint256 maxUnits) returns (uint256)',
  'function awardApplicant(uint256 jobId, address worker)',
  'function approveSubmission(uint256 jobId, address worker, uint256 units)',
  'function cancelJob(uint256 jobId)',
  'function openDispute(uint256 jobId)',
  'function adminResolve(uint256 jobId, address worker, uint256 workerAmount, uint256 posterRefund)',
  'function jobs(uint256) view returns (address poster, address token, uint256 pricePerUnit, uint256 maxUnits, uint256 unitsApproved, uint256 totalAmount, uint256 released, address awardedWorker, uint8 jobType, uint8 status)',
  'event JobCreated(uint256 indexed jobId, address indexed poster, address token, uint8 jobType, uint256 totalAmount)',
];
const workIface = new Interface(DEHUB_WORK_ABI);

const JOB_TYPE_INDEX: Record<WorkJobType, number> = { shill: 0, clipping: 1, contract: 2 };

export function getCurrencyToken(currency: WorkCurrency): { address: string; decimals: number } {
  if (currency === 'USDC') return { address: USDC_BASE_ADDRESS, decimals: 6 };
  return { address: CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken, decimals: 18 };
}

// â”€â”€ Write helpers (return null when contract not deployed) â”€â”€â”€
export async function createJobOnChain(params: {
  currency: WorkCurrency;
  jobType: WorkJobType;
  pricePerUnit: number | string;
  maxUnits: number;
}): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  const { address: token, decimals } = getCurrencyToken(params.currency);
  const priceWei = parseUnits(String(params.pricePerUnit), decimals);
  const totalWei = priceWei * BigInt(params.maxUnits);

  // Ensure allowance to escrow
  const owner = await getWalletAddress();
  const allowance = await getERC20Allowance(token, owner, DEHUB_WORK_ADDRESS);
  if (allowance < totalWei) {
    await approveERC20(token, DEHUB_WORK_ADDRESS, totalWei, BASE_CHAIN_ID);
  }


  return writeContractAA(
    DEHUB_WORK_ADDRESS,
    workIface,
    'createJob',
    [token, JOB_TYPE_INDEX[params.jobType], priceWei, BigInt(params.maxUnits)],
    { context: 'fund work escrow', chainId: BASE_CHAIN_ID }
  );
}

export async function awardApplicantOnChain(jobId: number, worker: string): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  return writeContractAA(DEHUB_WORK_ADDRESS, workIface, 'awardApplicant', [BigInt(jobId), worker],
    { context: 'award work applicant', chainId: BASE_CHAIN_ID });
}

export async function approveSubmissionOnChain(jobId: number, worker: string, units = 1): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  return writeContractAA(DEHUB_WORK_ADDRESS, workIface, 'approveSubmission', [BigInt(jobId), worker, BigInt(units)],
    { context: 'release work payout', chainId: BASE_CHAIN_ID });
}

export async function openDisputeOnChain(jobId: number): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  return writeContractAA(DEHUB_WORK_ADDRESS, workIface, 'openDispute', [BigInt(jobId)],
    { context: 'open work dispute', chainId: BASE_CHAIN_ID });
}

export async function cancelJobOnChain(jobId: number): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  return writeContractAA(DEHUB_WORK_ADDRESS, workIface, 'cancelJob', [BigInt(jobId)],
    { context: 'cancel work job', chainId: BASE_CHAIN_ID });
}

export async function adminResolveOnChain(params: {
  jobId: number;
  worker: string;
  currency: WorkCurrency;
  workerAmount: number | string;
  posterRefund: number | string;
}): Promise<AAWriteResult | null> {
  if (!isWorkContractDeployed()) return null;
  await switchChain(BASE_CHAIN_ID);
  const { decimals } = getCurrencyToken(params.currency);
  return writeContractAA(
    DEHUB_WORK_ADDRESS,
    workIface,
    'adminResolve',
    [
      BigInt(params.jobId),
      params.worker || ZERO,
      parseUnits(String(params.workerAmount || 0), decimals),
      parseUnits(String(params.posterRefund || 0), decimals),
    ],
    { context: 'admin resolve dispute', chainId: BASE_CHAIN_ID }
  );
}

export async function readOnChainJob(jobId: number) {
  if (!isWorkContractDeployed()) return null;
  return readContract(DEHUB_WORK_ADDRESS, workIface, 'jobs', [BigInt(jobId)], BASE_CHAIN_ID);
}

// â”€â”€ Direct payout (no escrow contract required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Pay a worker straight from the poster's wallet.
 *
 * The escrow above needs `DEHUB_WORK_ADDRESS` deployed, and it is not â€” so
 * until it is, every helper up there returns `null` and no money can move
 * through it. That is why bounties accrued ~500k DHB of *approved* payouts with
 * a null `payout_tx_hash`: approval was only ever a status column.
 *
 * A payout does not actually need escrow. Escrow protects the *worker* by
 * locking the money up front; a plain ERC-20 transfer at approval time settles
 * the same debt, on-chain and verifiable, with the poster keeping custody until
 * they approve. That is strictly better than a database flag and needs nothing
 * deployed, so it is the path the UI takes today. When the escrow contract does
 * land, funded jobs release through it and this stays the fallback for the
 * unfunded ones.
 *
 * Balance is checked first: `writeContractAA` would otherwise pop a signature
 * prompt for a transfer that reverts, and a reverted payout still looks like a
 * refusal to pay from the worker's side.
 */
const erc20Iface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export async function payWorkerDirect(params: {
  currency: WorkCurrency;
  to: string;
  amount: number | string;
}): Promise<AAWriteResult> {
  await switchChain(BASE_CHAIN_ID);
  const { address: token, decimals } = getCurrencyToken(params.currency);
  const amountWei = parseUnits(String(params.amount), decimals);
  if (amountWei <= BigInt(0)) throw new Error('Payout amount must be greater than zero');

  const from = await getWalletAddress();
  if (from.toLowerCase() === params.to.toLowerCase()) {
    throw new Error('Cannot pay a bounty to your own wallet');
  }

  const balance = await getERC20Balance(token, from, BASE_CHAIN_ID);
  if (balance < amountWei) {
    throw new Error(
      `Not enough ${params.currency} â€” you hold ${formatUnits(balance, decimals)} and this payout is ${params.amount}.`
    );
  }

  return writeContractAA(
    token,
    erc20Iface,
    'transfer',
    [params.to, amountWei],
    { context: 'bounty payout', chainId: BASE_CHAIN_ID }
  );
}
