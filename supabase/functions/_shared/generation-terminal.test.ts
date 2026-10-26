import { recoverGenerationRefund, refundJournalledGeneration, transitionGeneration } from './generation-terminal.ts';
import { chargeCredits } from './ai-payment-guard.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const same = (a: unknown,b: unknown) => assert(JSON.stringify(a)===JSON.stringify(b));
function fakeDb(responses: unknown[]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = { rpc: async (name: string,args: Record<string,unknown>) => { calls.push({name,args}); return {data:responses.shift(),error:null}; } };
  return { db: db as unknown as Parameters<typeof transitionGeneration>[4], calls };
}

Deno.test('a stale failure returns recorded success without attempting a financial refund', async () => {
  const {db,calls}=fakeDb([{claimed:false,job:{id:'job',status:'succeeded',result:{status:'succeeded',videoUrl:'saved'}}}]);
  same(await refundJournalledGeneration('job',db),false);
  same(calls.map(call=>call.name),['ai_generation_transition']);
});

Deno.test('a competing refund lease never calls the external credit service', async () => {
  const {db,calls}=fakeDb([{claimed:false,job:{id:'job',status:'refund_pending',payment_source:'credits'}}]);
  let refunds=0;
  const result=await recoverGenerationRefund('job',db,async()=>{refunds++;return true;});
  same(result?.status,'refund_pending'); same(refunds,0); same(calls.length,1);
});

Deno.test('credit restoration is finalized only after the keyed backend acknowledges it', async () => {
  const {db,calls}=fakeDb([{claimed:true,job:{id:'job',status:'refund_pending',payment_source:'credits',credit_debit_key:'ai:owned'}},
    {id:'job',status:'failed',result:{paymentRestored:true}}]);
  const result=await recoverGenerationRefund('job',db,async key=>{same(key,'ai:owned');same(calls.length,1);return true;});
  same(result?.result?.paymentRestored,true);
  same(calls.map(call=>call.name),['ai_generation_refund_claim','ai_generation_refund_finish']);
  same(calls[1].args.p_credit_restored,true);
});

Deno.test('a failed external credit refund leaves its durable decision pending', async () => {
  const {db,calls}=fakeDb([{claimed:true,job:{id:'job',status:'refund_pending',payment_source:'credits',credit_debit_key:'ai:owned'}}]);
  let failed=false;
  try {await recoverGenerationRefund('job',db,async()=>false);}catch{failed=true;}
  assert(failed); same(calls.length,1);
});

Deno.test('wallet release is delegated to the transactional finalizer instead of a separate receipt call', async () => {
  const {db,calls}=fakeDb([{claimed:true,job:{id:'job',status:'refund_pending',payment_source:'dhb'}},{id:'job',status:'failed',result:{paymentRestored:true}}]);
  let externalCalls=0;
  await recoverGenerationRefund('job',db,async()=>{externalCalls++;return true;});
  same(externalCalls,0); same(calls[1].name,'ai_generation_refund_finish');same(calls[1].args.p_credit_restored,false);
});

Deno.test('stale sweep decisions carry the expected status and authoritative age condition to SQL', async () => {
  const {db,calls}=fakeDb([{claimed:false,job:{id:'job',status:'succeeded'}}]);
  await transitionGeneration('job','failed',{}, {expectedStatuses:['submitting'],createdBefore:'2026-10-01T00:00:00Z'},db);
  same(calls[0].args.p_expected_statuses,['submitting']);same(calls[0].args.p_created_before,'2026-10-01T00:00:00Z');
});

Deno.test('concurrent credit submissions reserve once before debiting and never refund the winning request', async () => {
  const id='00000000-0000-4000-8000-000000000001',wallet='owner';
  let row: Record<string,unknown>|null=null, debits=0;
  const calls:string[]=[];
  const db={
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row?{...row}:null,error:null})})})}),
    rpc:async(name:string,args:Record<string,unknown>)=>{
      calls.push(name);
      assert(name==='ai_job_record_credits','Unexpected financial or terminal side effect');
      if(row)return{data:null,error:{message:'duplicate key'}};
      row={id,status:'submitting',wallet_address:wallet,payment_source:'credits',credit_debit_key:args.p_debit_key,model:args.p_model,endpoint:args.p_endpoint,result:null};
      return{data:null,error:null};
    },
  } as unknown as NonNullable<Parameters<typeof chargeCredits>[4]>['db'];
  const options={kind:'image' as const,modelId:'test',actionType:'generate-image',rateLimit:{limit:1,windowMs:60_000}};
  const dependencies={db,debit:async()=>{debits++;return'debited' as const;}};
  const results=await Promise.all([chargeCredits(wallet,10,options,{clientJobId:id},dependencies),chargeCredits(wallet,10,options,{clientJobId:id},dependencies)]);
  same(debits,1);same(results.filter(result=>result.ok).length,1);
  const duplicate=results.find(result=>!result.ok);
  assert(duplicate&&!duplicate.ok);same(duplicate.response.status,409);
  assert(calls.every(name=>name==='ai_job_record_credits'));
});
