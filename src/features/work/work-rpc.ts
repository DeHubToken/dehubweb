import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { payWorkerDirect, writeWork, getWorkConfig } from '@/lib/contracts/dehub-work';
import { sha256, toUtf8Bytes } from 'ethers';
import { getWalletAddress } from '@/lib/contracts/aa-utils';
import { runWorkPayment, type WorkPaymentIntent } from './payment-flow';

export async function workRpc<T = unknown>(wallet: string, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await withWalletHeader(supabase.rpc(name as never, args as never), wallet);
  if (error) throw error;
  return data as T;
}

export async function workReceipt(id: string, hash: string, chain: number, escrow?: string) {
  const token = await ensureFreshToken();
  const response = await fetch('/api/work/receipt', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify({ id, hash, chain, ...(escrow ? { escrow } : {}) }),
  });
  if (response.status === 202) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not verify the chain receipt');
  return data as { payload: string; signature: string };
}

export async function settleWorkPayment(wallet: string, submission: string, recoveryHash?: string) {
  return runWorkPayment(submission, 8453, {
    rpc: (name, args) => workRpc(wallet, name, args),
    send: async (intent: WorkPaymentIntent) => {
      const { data: job, error } = await supabase.from('work_jobs' as any).select('onchain_job_id,fund_tx_hash').eq('id', intent.job_id).single();
      if (error) throw error;
      if ((job as any).fund_tx_hash) {
        const { data: sub, error: subError } = await supabase.from('work_submissions' as any).select('approved_units,proof_url').eq('id', submission).single();
        if (subError) throw subError;
        const config=await getWorkConfig();
        if(!config.escrow_address) throw new Error('Escrow is unavailable');
        return writeWork(config.escrow_address,'approveSubmission',[(job as any).onchain_job_id,intent.worker_address,(sub as any).approved_units,
          sha256(toUtf8Bytes((sub as any).proof_url.trim().toLowerCase())),sha256(toUtf8Bytes(intent.id))]);
      }
      if((await getWalletAddress()).toLowerCase()!==wallet.toLowerCase()) throw new Error('The signing wallet does not match your bounty account');
      return payWorkerDirect({ currency: intent.currency, to: intent.worker_address, amount: intent.amount });
    },
    receipt: (intent, hash) => workReceipt(intent.id, hash, intent.chain_id),
    storage: {
      get: async key => localStorage.getItem(key),
      set: async (key, value) => { localStorage.setItem(key,value); },
      remove: async key => { localStorage.removeItem(key); },
    },
  }, recoveryHash);
}
