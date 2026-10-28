import { expect, it, vi } from 'vitest';
import { generateVideo } from './generationEngine';
import { invokeAi } from '@/lib/ai-invoke';
vi.mock('@/lib/ai-invoke',()=>({invokeAi:vi.fn(),dehubAuthHeaders:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/ai-payment',()=>({forgetPayment:vi.fn()}));
vi.mock('@/lib/api/dehub/core',()=>({ensureFreshToken:vi.fn()}));
vi.mock('@/i18n/copy',()=>({translateCopy:(_key:string,options:{defaultValue:string})=>options.defaultValue}));
it('submits the paid saved avatar prompt and job identity after the surrounding editor prompt changes',async()=>{
  const avatar={clientJobId:'saved-job',prompt:'Original paid prompt',phase:'signed' as const,txHash:'paid-receipt',imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true,inputDigest:'a'.repeat(64),acceptedPriceDhb:405};
  vi.mocked(invokeAi).mockResolvedValue({data:{videoUrl:'https://media.test/done.mp4'},error:null});
  await expect(generateVideo({model:'kling-avatar-v2',prompt:'Edited prompt',avatar,txHash:'paid-receipt'})).resolves.toBe('https://media.test/done.mp4');
  expect(invokeAi).toHaveBeenCalledWith('generate-video',expect.objectContaining({body:expect.objectContaining({prompt:'Original paid prompt',clientJobId:'saved-job',avatar,txHash:'paid-receipt'})}));
});
