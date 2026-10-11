import { apiCall } from './api/dehub/core';
import { createConversation } from './api/dehub/dm';
import { emitSendMessage } from './api/dehub/dm-socket';
import { prepareOutgoing } from './dm-e2ee/keys';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from './supabase-wallet-client';
import { ensureWalletSession } from './wallet-session';
import { allowsFreeCommunityInvite, sendCommunityInviteBatch } from './community-invites-core';

export async function inviteCommunityFollowers(communityId:string,wallet:string,url:string,recipients:string[],shouldContinue:()=>boolean) {
  if (!await ensureWalletSession(wallet)) throw new Error('Sign in again');
  const receipt = async (method:string,address:string) => {
    const {data,error}=await withWalletHeader((supabase as any).rpc(method,{_community_id:communityId,_recipient:address}),wallet);
    if(error) throw error;
    return data;
  };
  return sendCommunityInviteBatch(recipients,{
    shouldContinue,
    prepare:async address=>{
      const raw=await apiCall<any>(`/api/dm/user-status/${address}`,{requiresAuth:true});
      if(!allowsFreeCommunityInvite(raw?.result??raw)) return null;
      const conversation=await createConversation(address);
      if(!/^[a-f0-9]{24}$/i.test(conversation.id)) throw new Error('Conversation unavailable');
      const wire=await prepareOutgoing(address,url);
      return async()=>{await emitSendMessage({dmId:conversation.id,content:wire.content,type:'msg'});};
    },
    claim:address=>receipt('community_claim_invite',address),
    confirm:async address=>{await receipt('community_confirm_invite',address);},
  });
}
