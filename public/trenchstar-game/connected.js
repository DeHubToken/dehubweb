import { mountIcons } from './icons.js';
export function mountConnected(T){
  const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const symbols=['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','LINK','SUI','PEPE','WIF','BONK','TON','NEAR','ARB','OP','INJ','FET','SEI','JUP'];
  const money=v=>Number(v).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Number(v)<1?6:2});
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem('trenchstar.'+k))??f;}catch{return f;}};
  const write=(k,v)=>{try{localStorage.setItem('trenchstar.'+k,JSON.stringify(v));}catch{}};
  const params=new URLSearchParams(location.search);let selected=symbols.includes(params.get('symbol'))?params.get('symbol'):'BTC',tf='1h',favorites=read('favorites',['BTC','ETH','SOL','SUI']);
  if(!Array.isArray(favorites))favorites=['BTC','ETH','SOL'];favorites=favorites.filter(s=>symbols.includes(s));
  let desks=[],activeDesk='',revision=0,room=null,follow=false,roomTimer=null,roomBusy=false,voice=null,mic=null,voiceTimer=null,dialogKind='',previousFocus=null,focusView=false,chartScreen=null,paper=null,pendingOrder=null;
  const waiting=new Map();
  let boardScope='all';
  function request(body){return new Promise((resolve,reject)=>{
    const key=crypto.randomUUID(),timer=setTimeout(()=>{waiting.delete(key);reject(new Error('Connection timed out. Please retry.'));},25000);
    waiting.set(key,{resolve,reject,timer});const msg={source:'trenchstar-connected',type:'request',key,body};
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if(parent!==window)parent.postMessage(msg,location.origin);
    else {clearTimeout(timer);waiting.delete(key);reject(new Error('Open Trenchstar from the DeHub arcade to connect your account.'));}
  });}
  window.addEventListener('message',e=>{
    if(e.source!==parent&&e.source!==window)return;
    if(e.origin!==location.origin&&e.origin!=='')return;
    const d=e.data;if(d?.source!=='trenchstar-host')return;const w=waiting.get(d.key);if(!w)return;
    clearTimeout(w.timer);waiting.delete(d.key);d.error?w.reject(new Error(d.error)):w.resolve(d.data);
  });
  function notice(text){$('#tsToast').textContent=text;$('#tsToast').style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#tsToast').style.display='none',5000);}
  function status(text,error=false){const s=$('#tsStatus');if(s){s.textContent=text;s.classList.toggle('tsError',error);}}
  async function run(button,fn){if(button?.disabled)return;if(button)button.disabled=true;try{await fn();}catch(e){if($('#tsBody')?.innerHTML===loading)$('#tsBody').innerHTML='<p>Could not open this panel. Close it and try again after signing in.</p>';status(e.message,true);notice(e.message);}finally{if(button)button.disabled=false;}}
  document.body.insertAdjacentHTML('beforeend',`<nav id="tsNav" aria-label="Trenchstar"><button data-tab="focus" aria-pressed="false">Focus desk</button><button data-tab="desks">My desks</button><button data-tab="room">Room</button><button data-tab="paper">Compete</button><button data-tab="alerts">Alerts</button></nav><div id="tsRoomPill"></div><main id="tsFocus" class="ts"><div id="tsFocusHead"><div><span id="tsMarketName"></span><span id="tsFreshness">Connecting</span><div id="tsPrice">—</div></div><div class="tsRow"><button id="tsFavorite" aria-label="Toggle favourite market">Favourite</button><button id="tsPractice">Practice trade</button></div></div><div id="tsMarkets" aria-label="Favourite markets"></div><div class="tsRow"><label>Market<select id="tsSymbol">${symbols.map(s=>`<option>${s}</option>`).join('')}</select></label><div id="tsTimeframes">${['1m','5m','15m','1h','4h','1d'].map(t=>`<button data-tf="${t}">${t}</button>`).join('')}</div></div><canvas id="tsChart" aria-label="Live candlestick chart"></canvas><small>Swipe the chart to move between favourite markets. Practice trades use virtual funds.</small></main><div id="tsDialog" class="ts"><section class="tsPanel" role="dialog" aria-modal="true" aria-labelledby="tsTitle" tabindex="-1"><div class="tsHead"><div><span class="tsKicker" id="tsKicker"></span><h2 id="tsTitle"></h2></div><button id="tsClose" aria-label="Close panel">Close</button></div><div id="tsBody"></div><div id="tsStatus" class="tsStatus" role="status" aria-live="polite"></div></section></div><div id="tsToast" role="status" aria-live="polite"></div>`);
  function close(){dialogKind='';$('#tsDialog').classList.remove('open');previousFocus?.focus();}
  $('#tsClose').onclick=close;$('#tsDialog').onclick=e=>{if(e.target.id==='tsDialog')close();};
  document.addEventListener('keydown',e=>{
    if(!dialogKind)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
    if(e.key==='Tab'){
      const a=[...$('#tsDialog').querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')],first=a[0],last=a.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  },true);
  function panel(kind,title,kicker,html){previousFocus=document.activeElement;dialogKind=kind;$('#tsTitle').textContent=title;$('#tsKicker').textContent=kicker;$('#tsBody').innerHTML=html;status('');$('#tsDialog').classList.add('open');$('#tsClose').focus();}
  function choose(s){selected=s;$('#tsSymbol').value=s;chartScreen=null;paintMarkets();const screen=T.screens.find(x=>x.market?.sym===s&&x.kind==='tpl');if(screen){T.setScreenTf(screen,tf);if(!focusView)T.focusOn(screen);}write('favorites',favorites);}
  function paintMarkets(){$('#tsMarketName').textContent=selected+' / USDT';$('#tsMarkets').innerHTML=favorites.map(s=>`<button data-symbol="${s}" class="${s===selected?'selected':''}">${s}</button>`).join('');$('#tsFavorite').textContent=favorites.includes(selected)?'Unfavourite':'Favourite';$('#tsFavorite').setAttribute('aria-pressed',String(favorites.includes(selected)));$('#tsTimeframes').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.tf===tf));}
  function setFocus(on){focusView=on;document.body.classList.toggle('ts-focused',on);$('#tsNav [data-tab=focus]').textContent=on?'Trading floor':'Focus desk';$('#tsNav [data-tab=focus]').setAttribute('aria-pressed',String(on));write('view',on?'focus':'floor');if(on){T.exitWalk();T.setGuide(true);$('#charSel')?.classList.remove('on');choose(selected);}else{T.release();paintMarkets();}}
  $('#tsMarkets').onclick=e=>{if(e.target.dataset.symbol)choose(e.target.dataset.symbol);};$('#tsSymbol').onchange=e=>choose(e.target.value);
  $('#tsFavorite').onclick=()=>{favorites=favorites.includes(selected)?favorites.filter(s=>s!==selected):[...favorites,selected];write('favorites',favorites);paintMarkets();};
  $('#tsTimeframes').onclick=e=>{if(!e.target.dataset.tf)return;tf=e.target.dataset.tf;choose(selected);};$('#tsPractice').onclick=()=>openPaper();
  let swipeX=null;$('#tsChart').addEventListener('pointerdown',e=>{swipeX=e.clientX;});$('#tsChart').addEventListener('pointerup',e=>{if(swipeX===null)return;const d=e.clientX-swipeX;swipeX=null;if(Math.abs(d)>60&&favorites.length){const i=favorites.indexOf(selected);choose(favorites[(i+(d<0?1:-1)+favorites.length)%favorites.length]);}});
  document.addEventListener('keydown',e=>{
    if(!focusView||dialogKind||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(favorites.length){const i=favorites.indexOf(selected),step=e.key==='ArrowRight'||e.key==='ArrowUp'?1:-1;choose(favorites[(i+step+favorites.length)%favorites.length]);}
  },true);
  function chart(){
    if(!focusView||document.hidden)return;
    const m=T.markets[selected];if(!m)return;
    $('#tsPrice').textContent=m.fed?money(m.price):'—';
    const fresh=m.fed&&m.lastLiveAt&&Date.now()-m.lastLiveAt<30000;
    $('#tsFreshness').textContent=!m.fed?'Simulated':fresh?'Live · Binance':'Stale · reconnecting';
    const canvas=$('#tsChart'),r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(w<1||h<1)return;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;chartScreen=null;}
    if(!chartScreen){chartScreen={...T.screens.find(s=>s.market&&s.kind==='tpl'),market:m,focusDesk:true,canvas,ctx:canvas.getContext('2d'),cw:w,ch:h,w:r.width,h:r.height,tf};}
    chartScreen.market=m;chartScreen.tf=tf;T.TEMPLATES.candles.paint(chartScreen);
  }
  setInterval(chart,250);
  const loading='<p>Connecting to your DeHub account…</p>';
  const environment=document.createElement('button');environment.className='btn';environment.textContent='Environment';environment.id='tsEnvironment';$('#btnRow').appendChild(environment);
  environment.onclick=()=>{
    panel('environment','A different perspective.','Environment',`<p>Choose a place to settle in. Lighting and materials follow the environment.</p><div class="tsGrid">${[['harbour','Harbour','Blue hour on the water'],['alpine','Alpine','First light, open horizons']].map(([id,title,desc])=>`<button class="tsScene" data-scene="${id}"><img src="backdrops/${id}.webp" alt="${desc}"><span><strong>${title}</strong><small>${desc}</small></span></button>`).join('')}</div><p><small>Your environment is included when you save a desk.</small></p>`);
    $('#tsBody').onclick=e=>{const choice=e.target.closest('[data-scene]');if(!choice)return;T.buildBackdrop(choice.dataset.scene);close();notice('Environment updated.');};
  };
  async function openDesks(){panel('desks','Your desk, everywhere.','Workspace',loading);await run(null,async()=>{
    const result=await request({action:'desks'});if(dialogKind!=='desks')return;desks=result.desks;
    $('#tsBody').innerHTML=`<p>Save your wall, charts, timeframes, environment and favourites. Open the same setup on web or mobile. Uploaded files stay on the device where you added them.</p><div class="tsRow"><label>Desk name<input id="tsDeskName" maxlength="40" placeholder="Daily desk" value="${esc(activeDesk)}"></label><button id="tsSaveDesk" class="primary">Save this desk</button></div><div id="tsDeskList">${desks.length?desks.map((d,i)=>`<article class="tsCard"><div class="tsRow"><div><h3>${esc(d.name)}</h3><small>Saved ${esc(new Date(d.updated_at).toLocaleString())}</small></div><div><button data-load="${i}">Open</button> <button data-delete="${i}" class="danger">Delete</button></div></div></article>`).join(''):'<div class="tsEmpty">No saved desks yet. Arrange your floor, then save your first setup.</div>'}</div>`;
    $('#tsSaveDesk').onclick=e=>run(e.target,async()=>{const name=$('#tsDeskName').value.trim();if(!name)throw new Error('Give this desk a name');const existing=desks.find(d=>d.name===name);const doc=T.captureDesk();doc.favorites=favorites;doc.view=focusView?'focus':'floor';const r=await request({action:'save-desk',name,document:doc,revision:existing?.revision||0});activeDesk=name;revision=r.desk.revision;await openDesks();status('Saved to your DeHub account.');});
    $('#tsDeskList').onclick=e=>run(e.target,async()=>{if(e.target.dataset.load!==undefined){const d=desks[+e.target.dataset.load];T.restoreDesk(d.document);favorites=(d.document.favorites||[]).filter(s=>symbols.includes(s));activeDesk=d.name;revision=d.revision;setFocus(d.document.view==='focus');close();notice('Opened '+d.name);}else if(e.target.dataset.delete!==undefined){const d=desks[+e.target.dataset.delete];await request({action:'delete-desk',name:d.name});if(activeDesk===d.name)activeDesk='';await openDesks();}});
  });}
  async function openAlerts(){panel('alerts','Stay ahead of the move.','Market alerts',loading);await run(null,async()=>{
    const r=await request({action:'alerts'});if(dialogKind!=='alerts')return;
    $('#tsBody').innerHTML=`<p>Checked every minute, even after you leave. Alerts use live Binance prices and never trigger on simulated data.</p><div class="tsRow"><label>Market<select id="tsAlertSym">${symbols.map(s=>`<option ${s===selected?'selected':''}>${s}</option>`).join('')}</select></label><label>Direction<select id="tsDirection"><option value="above">Above</option><option value="below">Below</option></select></label><label>Target · USD<input id="tsTarget" inputmode="decimal" type="number" min="0" step="any" placeholder="Target price"></label></div><p><label class="check"><input id="tsNotify" type="checkbox">Notify me in DeHub when this triggers</label></p><button id="tsArm" class="primary">Arm alert</button><div id="tsAlertList">${r.alerts.length?r.alerts.map(a=>`<article class="tsCard"><div class="tsRow"><div><h3>${esc(a.symbol)} ${a.direction} ${money(a.target)}</h3><small>${a.fired_at?'Triggered '+esc(new Date(a.fired_at).toLocaleString())+' at '+money(a.fired_price):'Armed · checked every minute'}${a.notify?' · DeHub notification on':''}</small></div><div><button data-chart="${a.symbol}">Chart</button> <button class="danger" data-remove="${a.id}">${a.fired_at?'Delete':'Cancel'}</button></div></div></article>`).join(''):'<div class="tsEmpty">Your next signal starts here. Set a target to create an alert.</div>'}</div>`;
    $('#tsArm').onclick=e=>run(e.target,async()=>{await request({action:'add-alert',symbol:$('#tsAlertSym').value,direction:$('#tsDirection').value,target:Number($('#tsTarget').value),notify:$('#tsNotify').checked});await openAlerts();status('Alert armed. You can leave the room.');});
    $('#tsAlertList').onclick=e=>run(e.target,async()=>{if(e.target.dataset.chart){choose(e.target.dataset.chart);setFocus(true);close();}if(e.target.dataset.remove){await request({action:'delete-alert',id:e.target.dataset.remove});await openAlerts();}});
  });}
  async function openPaper(){panel('paper','Trade the week.','Practice league · virtual funds',loading);await run(null,async()=>{
    paper=await request({action:'paper',...(boardScope==='room'&&room?{scopeRoom:room.room.id}:{})});if(dialogKind!=='paper')return;
    const mine=paper.board.find(b=>b.mine),book=paper.book,eq=mine?.equity;
    $('#tsBody').innerHTML=`<p>Start with $100,000 in virtual funds. Spot buys and sells at live server prices. Weekly standings reset Monday at 00:00 UTC. No deposits, prizes or real-money trades.</p>${book?`<div class="tsMetrics"><div class="tsMetric"><small>Portfolio value</small><strong>${eq==null?'Unavailable':money(eq)}</strong></div><div class="tsMetric"><small>Available cash</small><strong>${money(book.cash)}</strong></div><div class="tsMetric"><small>Max drawdown</small><strong>${Number(mine?.drawdown||0).toFixed(2)}%</strong></div></div><div class="tsRow"><label>Market<select id="tsOrderSymbol">${symbols.map(s=>`<option ${s===selected?'selected':''}>${s}</option>`).join('')}</select></label><label>Side<select id="tsSide"><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>Units<input id="tsQuantity" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"></label><button id="tsOrder" class="primary">Place practice order</button></div><div class="tsCard"><small>Your holdings</small><div>${Object.entries(book.holdings).filter(([,q])=>Number(q)>0).map(([s,q])=>`${esc(s)}: ${Number(q).toLocaleString(undefined,{maximumFractionDigits:8})}`).join(' · ')||'No holdings yet.'}</div></div>`:`<div class="tsRow"><label>Public leaderboard name<input id="tsAlias" maxlength="32" placeholder="Choose your trader name"></label><button id="tsJoinPaper" class="primary">Join this week</button></div><small>Your name and practice performance will appear on the weekly leaderboard.</small>`}<div class="tsHead" style="margin-top:24px"><h3>This week’s leaderboard</h3><button id="tsRefreshPaper">Refresh</button></div>${paper.board.length?`<table><thead><tr><th>Trader</th><th class="num">Return</th><th class="num">Drawdown</th></tr></thead><tbody>${paper.board.map((b,i)=>`<tr><td>${i+1}. ${esc(b.name)}${b.mine?' · You':''}</td><td class="num ${b.returnPct>=0?'positive':'negative'}">${b.returnPct==null?'Unavailable':(b.returnPct>=0?'+':'')+b.returnPct.toFixed(2)+'%'}</td><td class="num">${b.drawdown.toFixed(2)}%</td></tr>`).join('')}</tbody></table>`:'<div class="tsEmpty">Be the first trader on this week’s board.</div>'}<p><small>Week of ${esc(paper.week)} · Quotes ${esc(new Date(paper.asOf).toLocaleTimeString())}. Drawdown sampled every minute. Fills exclude fees and slippage.</small></p>`;
    $('#tsRefreshPaper').onclick=()=>openPaper();
    if(room){const scope=document.createElement('label');scope.textContent='Leaderboard';const select=document.createElement('select');select.innerHTML='<option value="all">All traders</option><option value="room">Friends in this room</option>';select.value=boardScope;select.onchange=()=>{boardScope=select.value;openPaper();};scope.appendChild(select);$('#tsBody').prepend(scope);}
    if(!book)$('#tsJoinPaper').onclick=e=>run(e.target,async()=>{await request({action:'join-paper',name:$('#tsAlias').value.trim()});await openPaper();});
    else $('#tsOrder').onclick=e=>run(e.target,async()=>{const order={symbol:$('#tsOrderSymbol').value,side:$('#tsSide').value,quantity:Number($('#tsQuantity').value)};if(!Number.isFinite(order.quantity)||order.quantity<=0)throw new Error('Enter a positive number of units');const fingerprint=JSON.stringify(order);if(pendingOrder?.fingerprint!==fingerprint)pendingOrder={fingerprint,id:crypto.randomUUID()};const r=await request({action:'trade',...order,id:pendingOrder.id});pendingOrder=null;await openPaper();status('Practice order filled at '+money(r.price));});
  });}
  function roomMarkup(){return `<p>${room.host?'Share this invite to bring friends onto your floor.':'You are on a shared floor. Follow the host to view the same market and timeframe.'} Rooms last up to eight hours.</p><label>Invite link<input id="tsInvite" readonly value="${esc(location.origin+'/arcade/trenchstar?room='+room.room.id)}"></label><div class="tsRow" style="margin-top:12px"><button id="tsCopy">Copy invite</button><button id="tsFollow" ${room.host?'disabled':''}>${follow?'Stop following':'Follow host'}</button><button id="tsVoice">${voice?'Leave voice':'Join voice'}</button><button id="tsMute" ${voice?'':'disabled'}>${mic?.muted?'Unmute':'Mute'}</button><button id="tsLeave" class="danger">${room.host?'End room':'Leave room'}</button></div><p><small>Voice starts only when you choose Join voice. Only the room’s current market and your floor position are shared.</small></p><div id="tsMembers"></div>`;}
  function paintMembers(){if(!room)return;$('#tsRoomPill').style.display='block';$('#tsRoomPill').textContent=room.room.name+' · '+(room.members?.length||1)+' online'+(follow?' · Following':'');const box=$('#tsMembers');if(box)box.innerHTML=(room.members||[]).map(m=>`<div class="tsCard"><div class="tsRow"><h3>${esc(m.name)}${m.id==='me'?' · You':''}</h3><small>${m.host?'Host':'Guest'}${m.pose?.symbol?' · looking at '+esc(m.pose.symbol):''}</small></div></div>`).join('');T.updateGuests?.(room.members||[]);}
  async function openRoom(){panel('room',room?.room.name||'Better with company.','Shared floor',room?roomMarkup():`<p>Open a private room and share its invite. See who is here, follow the host’s chart, point friends to a market and talk over voice.</p><div class="tsRow"><label>Your display name<input id="tsRoomAlias" maxlength="32" placeholder="Trader name"></label><label>Room name<input id="tsRoomName" maxlength="40" placeholder="The daily desk"></label></div><div class="tsRow" style="margin-top:14px"><button id="tsCreateRoom" class="primary">Create room</button></div><div class="tsCard"><label>Room invite link or code<input id="tsRoomCode" placeholder="Paste an invite" value="${esc(params.get('room')||'')}"></label><button id="tsJoinRoom" style="margin-top:12px">Join room</button></div>`);
    if(!room){
      $('#tsCreateRoom').onclick=e=>run(e.target,async()=>{const alias=$('#tsRoomAlias').value.trim();if(!alias)throw new Error('Choose your display name');const r=await request({action:'create-room',name:$('#tsRoomName').value.trim(),alias});await connectRoom(r.room.id,alias);});
      $('#tsJoinRoom').onclick=e=>run(e.target,async()=>{const input=$('#tsRoomCode').value.trim();let code=input;try{code=new URL(input).searchParams.get('room')||input;}catch{}await connectRoom(code,$('#tsRoomAlias').value.trim());});return;
    }
    paintMembers();$('#tsCopy').onclick=e=>run(e.target,async()=>{try{await navigator.clipboard.writeText($('#tsInvite').value);status('Invite copied.');}catch{$('#tsInvite').select();status('Select and copy the invite link.');}});
    $('#tsFollow').onclick=()=>{follow=!follow;openRoom();};$('#tsLeave').onclick=e=>run(e.target,async()=>{await request({action:'leave-room',room:room.room.id});await leaveVoice();clearInterval(roomTimer);room=null;follow=false;$('#tsRoomPill').style.display='none';T.updateGuests?.([]);openRoom();});
    $('#tsVoice').onclick=e=>run(e.target,async()=>{if(voice)await leaveVoice();else await joinVoice();openRoom();});$('#tsMute').onclick=e=>run(e.target,async()=>{if(mic)await mic.setMuted(!mic.muted);openRoom();});
  }
  async function connectRoom(id,name){room=await request({action:'join-room',room:id,name});follow=!room.host;clearInterval(roomTimer);roomTimer=setInterval(pollRoom,2500);paintMembers();await openRoom();}
  async function pollRoom(){if(!room||roomBusy||document.hidden)return;roomBusy=true;try{const f=focusView?selected:T.focus.screen?.market?.sym||selected;const pos=T.camera.position;room=await request({action:'room',room:room.room.id,pose:{symbol:f,x:pos.x,y:pos.y,z:pos.z},...(room.host?{focus:{symbol:f,tf:focusView?tf:T.focus.screen?.tf||tf}}:{})});if(follow&&!room.host&&room.room.focus?.symbol){const f=room.room.focus;if(selected!==f.symbol||tf!==f.tf){tf=f.tf;choose(f.symbol);}}paintMembers();}catch(e){notice(e.message);if(e.message.includes('ended')){await leaveVoice();clearInterval(roomTimer);room=null;$('#tsRoomPill').style.display='none';T.updateGuests?.([]);}}finally{roomBusy=false;}}
  async function joinVoice(){
    const r=await request({action:'voice',room:room.room.id});
    const AgoraRTC=(await import('./vendor/agora/AgoraRTC_N-production.esm.js')).default;
    const client=AgoraRTC.createClient({mode:'rtc',codec:'vp8'});
    client.on('user-published',async(user,type)=>{if(type==='audio'){await client.subscribe(user,type);user.audioTrack?.play();}});
    let track;try{await client.join(r.appId,r.channel,r.token,r.uid);track=await AgoraRTC.createMicrophoneAudioTrack();await client.publish([track]);voice=client;mic=track;voiceTimer=setInterval(async()=>{try{const n=await request({action:'voice',room:room.room.id});await client.renewToken(n.token);}catch{await leaveVoice();notice('Voice ended. Rejoin to reconnect.');}},480000);}catch(e){track?.stop();track?.close();await client.leave();throw new Error('Could not join voice. Check microphone access and try again.');}
  }
  async function leaveVoice(){clearInterval(voiceTimer);mic?.stop();mic?.close();mic=null;const v=voice;voice=null;if(v)await v.leave();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leaveVoice();});window.addEventListener('pagehide',()=>{leaveVoice();clearInterval(roomTimer);});
  $('#tsNav').onclick=e=>{const tab=e.target.dataset.tab;if(tab==='focus'){close();setFocus(!focusView);}else if(tab==='desks')openDesks();else if(tab==='alerts')openAlerts();else if(tab==='paper')openPaper();else if(tab==='room')openRoom();};
  $('#tsRoomPill').onclick=()=>openRoom();
  setFocus(params.get('view')==='focus'||params.has('symbol')||read('view',null)==='focus'||matchMedia('(max-width:700px)').matches);
  mountIcons();
  if(params.has('room'))openRoom();
}
