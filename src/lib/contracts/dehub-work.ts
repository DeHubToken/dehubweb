/**
 * DeHubWork — on-chain escrow wiring
 * ==================================
 * Thin wagmi/AA wrapper around the DeHubWork contract. If
 * `DEHUB_WORK_ADDRESS` is the zero address (not yet deployed) every
 * helper resolves to `null` so the UI keeps working off-chain.
 *
 * Replace `DEHUB_WORK_ADDRESS` with the deployed Base address.
 */
import { Interface, parseUnits } from 'ethers';
import {
  writeContractAA,
  readContract,
  approveERC20,
  getERC20Allowance,
  switchChain,
  type AAWriteResult,
} from './aa-utils';
import { CHAIN_CONFIGS, BASE_CHAIN_ID } from './dhb-token';
import type { WorkCurrency, WorkJobType } from '@/features/work/types';

// ── Addresses (Base) ─────────────────────────────────────────
export const DEHUB_WORK_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: deploy + paste
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const isWorkContractDeployed = () =>
  DEHUB_WORK_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000';

const ZERO = '0x0000000000000000000000000000000000000000';

// ── ABI ──────────────────────────────────────────────────────
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

// ── Write helpers (return null when contract not deployed) ───
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
  const owner = (await import('./aa-utils')).getWalletAddress
    ? await (await import('./aa-utils')).getWalletAddress()
    : ZERO;
  const allowance = await getERC20Allowance(token, owner, DEHUB_WORK_ADDRESS);
  if (allowance < totalWei) {
    await approveERC20(token, DEHUB_WORK_ADDRESS, totalWei, { chainId: BASE_CHAIN_ID });
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
