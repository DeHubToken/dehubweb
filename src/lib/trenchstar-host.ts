import { useEffect, type RefObject } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub/core';

export function useTrenchstarHost(enabled:boolean, frame:RefObject<HTMLIFrameElement>) {
  useEffect(()=>{
    if(!enabled)return;
    let live=true;
    const handler=async(e:MessageEvent)=>{
      if(e.source!==frame.current?.contentWindow||e.origin!==location.origin)return;
      const d=e.data;
      if(d?.source!=='trenchstar-connected'||typeof d.key!=='string'||d.key.length>80)return;
      const reply=(payload:unknown)=>{if(live)frame.current?.contentWindow?.postMessage({source:'trenchstar-host',key:d.key,...payload as object},location.origin);};
      if(d.type!=='request'||!d.body||typeof d.body!=='object')return;
      if(JSON.stringify(d.body).length>150000){reply({error:'Desk is too large'});return;}
      const token=getAuthToken();
      if(!token){reply({error:'Sign in to DeHub to sync desks, join rooms and compete.'});return;}
      try {
        const {data,error}=await supabase.functions.invoke('trenchstar',{body:d.body,headers:{'x-dehub-token':token}});
        if(error) {
          let message='Could not connect. Please retry.';
          try{const body=await error.context?.json();if(body?.error)message=body.error;}catch{/* response already consumed */}
          reply({error:message});return;
        }
        reply(data?.error?{error:data.error}:{data});
      }catch{reply({error:'Connection interrupted. Please retry.'});}
    };
    window.addEventListener('message',handler);
    return()=>{live=false;window.removeEventListener('message',handler);};
  },[enabled,frame]);
}
