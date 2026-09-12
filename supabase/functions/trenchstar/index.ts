import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from '../_shared/auth.ts';
import agora from 'npm:agora-access-token@2.0.4';

const SYMBOLS=['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','LINK','SUI','PEPE','WIF','BONK','TON','NEAR','ARB','OP','INJ','FET','SEI','JUP'];
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const week=()=>{const d=new Date();d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
const db=()=>serviceClient();
function checked<T>(r:{data:T;error:unknown}):T {if(r.error)throw new Error('Could not save or read this update. Please retry.');return r.data;}
async function quotes():Promise<Record<string,number>> {
  const r=await fetch('https://data-api.binance.vision/api/v3/ticker/price',{signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error('Live prices are unavailable. No practice order was placed.');
  const rows=await r.json();const out:Record<string,number>={};
  for(const s of SYMBOLS){const n=Number(rows.find((v:{symbol:string})=>v.symbol===s+'USDT')?.price);if(Number.isFinite(n)&&n>0)out[s]=n;}
  return out;
}
async function tick(){
  const d=db(),prices=await quotes();
  const alerts=checked(await d.from('trench_alerts').select('id,symbol').is('fired_at',null).limit(2000))||[];
  for(const a of alerts)if(prices[a.symbol])checked(await d.rpc('trench_fire_alert',{p_id:a.id,p_price:prices[a.symbol]}));
  const books=checked(await d.from('trench_paper').select('*').eq('week',week()).limit(2000))||[];
  for(const b of books){
    if(Object.keys(b.holdings).some(s=>!prices[s]))continue;
    const equity=Number(b.cash)+Object.entries(b.holdings).reduce((n,[s,q])=>n+Number(q)*prices[s],0);
    const peak=Math.max(Number(b.peak),equity),drawdown=Math.max(Number(b.drawdown),(peak-equity)/peak*100);
    checked(await d.from('trench_paper').update({equity,peak,drawdown}).eq('wallet',b.wallet).eq('week',b.week).eq('updated_at',b.updated_at));
  }
  checked(await d.from('trench_rooms').delete().lt('expires_at',new Date().toISOString()));
  return {ok:true,alerts:alerts.length,books:books.length};
}

Deno.serve(async req=>{
  const pre=handleCorsPreflight(req);if(pre)return pre;
  if(req.method!=='POST')return jsonResponse({error:'Use POST'},405);
  try{
    const raw=await req.text();if(raw.length>150000)return jsonResponse({error:'Request too large'},413);
    const b=JSON.parse(raw);
    if(b.action==='tick'){
      if(req.headers.get('Authorization')!==`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`)return jsonResponse({error:'Not authorized'},401);
      return jsonResponse(await tick());
    }
    const auth=await requireDeHubAuth(req);if(!auth.ok)return auth.response;
    const wallet=auth.wallet,d=db();
    const limit=await checkRateLimit(d,wallet,'trenchstar',{limit:100,windowMs:60000});
    if(!limit.allowed)return jsonResponse({error:'Please wait a moment before trying again.'},429);
    const name=typeof b.name==='string'?b.name.trim().slice(0,40):'';
    switch(b.action){
      case 'desks':return jsonResponse({desks:checked(await d.from('trench_desks').select('*').eq('wallet',wallet).order('updated_at',{ascending:false})),wallet});
      case 'save-desk':{
        if(!name||!b.document||typeof b.document!=='object'||!Number.isInteger(b.revision)||b.revision<0)throw new Error('Invalid desk');
        // Only presentation data crosses devices. Never store account keys, sessions or exchange credentials.
        const allowed=['wall','layout','screens','tf','scene','favorites','view'];
        if(Object.keys(b.document).some(k=>!allowed.includes(k)))throw new Error('Invalid desk settings');
        const r=await d.rpc('trench_save_desk',{p_wallet:wallet,p_name:name,p_document:b.document,p_revision:b.revision});
        if(r.error)return jsonResponse({error:'This desk changed on another device, or the name already exists. Reload your saved desks before saving.'},409);
        return jsonResponse({desk:r.data});
      }
      case 'delete-desk':checked(await d.from('trench_desks').delete().eq('wallet',wallet).eq('name',name));return jsonResponse({ok:true});
      case 'alerts':return jsonResponse({alerts:checked(await d.from('trench_alerts').select('*').eq('wallet',wallet).order('created_at',{ascending:false}).limit(100))});
      case 'add-alert':{
        if(!SYMBOLS.includes(b.symbol)||!['above','below'].includes(b.direction)||!Number.isFinite(b.target)||b.target<=0||b.target>1e12)throw new Error('Choose a valid market and target price');
        const count=await d.from('trench_alerts').select('id',{count:'exact',head:true}).eq('wallet',wallet).is('fired_at',null);
        if(count.error)throw new Error('Could not check your alerts');if((count.count||0)>=50)throw new Error('You can arm up to 50 alerts');
        return jsonResponse({alert:checked(await d.from('trench_alerts').insert({wallet,symbol:b.symbol,direction:b.direction,target:b.target,notify:b.notify===true}).select().single())});
      }
      case 'delete-alert':if(!uuid(b.id))throw new Error('Invalid alert');checked(await d.from('trench_alerts').delete().eq('wallet',wallet).eq('id',b.id));return jsonResponse({ok:true});
      case 'paper':{
        const prices=await quotes();
        const board=checked(await d.from('trench_paper').select('wallet,name,cash,holdings,peak,drawdown,updated_at').eq('week',week()).limit(1000))||[];
        const ranked=board.map(v=>{const complete=Object.keys(v.holdings).every(s=>prices[s]);const equity=complete?Number(v.cash)+Object.entries(v.holdings).reduce((n,[s,q])=>n+Number(q)*prices[s],0):null;return {name:v.name,mine:v.wallet===wallet,equity,drawdown:Number(v.drawdown),returnPct:equity===null?null:(equity/100000-1)*100};}).sort((a,b)=>(b.equity??-1)-(a.equity??-1));
        return jsonResponse({week:week(),prices,book:board.find(v=>v.wallet===wallet)||null,board:ranked.slice(0,100),asOf:new Date().toISOString()});
      }
      case 'join-paper':{
        // The public alias is chosen explicitly when entering the leaderboard.
        if(!name)throw new Error('Choose a leaderboard name');
        const existing=checked(await d.from('trench_paper').select('wallet').eq('wallet',wallet).eq('week',week()).maybeSingle());
        if(!existing)checked(await d.from('trench_paper').insert({wallet,week:week(),name}));
        return jsonResponse({ok:true});
      }
      case 'trade':{
        if(!uuid(b.id)||!SYMBOLS.includes(b.symbol)||!['buy','sell'].includes(b.side)||!Number.isFinite(b.quantity)||b.quantity<=0||b.quantity>1e15)throw new Error('Invalid practice order');
        const prices=await quotes();if(!prices[b.symbol])throw new Error('No live quote for this market');
        const r=await d.rpc('trench_trade',{p_wallet:wallet,p_id:b.id,p_symbol:b.symbol,p_side:b.side,p_quantity:b.quantity,p_price:prices[b.symbol]});
        if(r.error)throw new Error(r.error.message?.includes('Not enough')?'Not enough practice cash or units.':'Could not place this order. Join this week first, then retry.');
        return jsonResponse({book:r.data,price:prices[b.symbol]});
      }
      case 'create-room':{
        if(!name)throw new Error('Name your room');
        const count=await d.from('trench_rooms').select('id',{count:'exact',head:true}).eq('host',wallet).gt('expires_at',new Date().toISOString());
        if(count.error)throw new Error('Could not check rooms');if((count.count||0)>=3)throw new Error('End an existing room before opening another');
        const room=checked(await d.from('trench_rooms').insert({host:wallet,name}).select().single());
        checked(await d.from('trench_members').insert({room:room.id,wallet,name:typeof b.alias==='string'?b.alias.slice(0,32):'Host'}));
        return jsonResponse({room:{id:room.id,name:room.name},host:true});
      }
    }
    if(!uuid(b.room))throw new Error('Invalid room link');
    const room=checked(await d.from('trench_rooms').select('*').eq('id',b.room).gt('expires_at',new Date().toISOString()).maybeSingle());
    if(!room)return jsonResponse({error:'This room has ended.'},410);
    const host=room.host===wallet;
    if(b.action==='join-room'){
      if(!name)throw new Error('Choose a name for this room');
      checked(await d.from('trench_members').upsert({room:b.room,wallet,name,seen_at:new Date().toISOString()}));
    }
    const member=checked(await d.from('trench_members').select('*').eq('room',b.room).eq('wallet',wallet).maybeSingle());
    if(!member)return jsonResponse({error:'Join this room first.'},403);
    if(b.action==='leave-room'){
      checked(await d.from(host?'trench_rooms':'trench_members').delete().eq(host?'id':'room',b.room).eq(host?'host':'wallet',wallet));return jsonResponse({ok:true});
    }
    if(b.action==='voice'){
      const appId=Deno.env.get('AGORA_APP_ID'),cert=Deno.env.get('AGORA_APP_CERTIFICATE');
      if(!appId||!cert)throw new Error('Room voice is temporarily unavailable');
      const uid=new Uint32Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(wallet)))[0]||1;
      const token=agora.RtcTokenBuilder.buildTokenWithUid(appId,cert,'trench-'+b.room,uid,agora.RtcRole.PUBLISHER,Math.floor(Date.now()/1000)+600);
      return jsonResponse({token,uid,appId,channel:'trench-'+b.room});
    }
    if(!['join-room','room'].includes(b.action))throw new Error('Unknown action');
    const pose:Record<string,unknown>={};
    if(b.pose&&typeof b.pose==='object'){
      if(SYMBOLS.includes(b.pose.symbol))pose.symbol=b.pose.symbol;
      for(const key of ['x','y','z'])if(Number.isFinite(b.pose[key]))pose[key]=Math.max(-100,Math.min(100,b.pose[key]));
    }
    checked(await d.from('trench_members').update({seen_at:new Date().toISOString(),pose}).eq('room',b.room).eq('wallet',wallet));
    if(host&&b.focus&&SYMBOLS.includes(b.focus.symbol)){
      const focus={symbol:b.focus.symbol,tf:['1m','5m','15m','1h','4h','1d'].includes(b.focus.tf)?b.focus.tf:'1h'};
      checked(await d.from('trench_rooms').update({focus}).eq('id',b.room).eq('host',wallet));room.focus=focus;
    }
    const members=checked(await d.from('trench_members').select('wallet,name,pose,seen_at').eq('room',b.room).gt('seen_at',new Date(Date.now()-30000).toISOString()).limit(24))||[];
    return jsonResponse({room:{id:room.id,name:room.name,focus:room.focus,expiresAt:room.expires_at},host,members:members.map((v,i)=>({id:v.wallet===wallet?'me':v.wallet,name:v.name,pose:v.pose,host:v.wallet===room.host}))});
  }catch(e){return jsonResponse({error:e instanceof Error?e.message:'Something went wrong. Please retry.'},400);}
});
