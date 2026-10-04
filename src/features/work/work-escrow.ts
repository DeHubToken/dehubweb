import { sha256,toUtf8Bytes,parseUnits } from 'ethers';
import { supabase } from '@/integrations/supabase/client';
import { getWorkConfig,writeWork,prepareWorkFunding,getCurrencyToken } from '@/lib/contracts/dehub-work';
import { getWalletAddress } from '@/lib/contracts/aa-utils';
import { createWorkEscrow } from './escrow-flow';
import { workRpc,workReceipt } from './work-rpc';

export async function workJob(id:string) {
 const {data,error}=await supabase.from('work_jobs' as any).select('*').eq('id',id).single();
 if(error) throw error;
 return data as any;
}
export function workEscrow(wallet:string) {
 return createWorkEscrow({wallet,job:workJob,config:getWorkConfig,rpc:(name,args)=>workRpc(wallet,name,args),receipt:workReceipt,
  hash:text=>sha256(toUtf8Bytes(text)),units:(amount,currency)=>parseUnits(amount,getCurrencyToken(currency).decimals),
  write:async(address,name,args)=>{
   if((await getWalletAddress()).toLowerCase()!==wallet.toLowerCase()) throw new Error('The signing wallet does not match your bounty account');
   return writeWork(address,name,args);
  },prepareFunding:prepareWorkFunding,
  storage:{get:async key=>localStorage.getItem(key),set:async(key,value)=>{localStorage.setItem(key,value);},remove:async key=>{localStorage.removeItem(key);}},
 });
}
export async function workSubmission(id:string) {
 const {data,error}=await supabase.from('work_submissions' as any).select('*').eq('id',id).single();
 if(error) throw error;
 return data as any;
}
