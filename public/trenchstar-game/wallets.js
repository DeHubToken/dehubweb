import {createSecret,normalizeSecret,encryptSecret,decryptSecret,depositQr,prepareEvm,signSolana} from './vendor/wallet-engine.js';
import {icon} from './icons.js';

const prefix='trenchstar.wallet.v1.';
const activeKey='trenchstar.wallet.active';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rejected=()=>Object.assign(new Error('Transaction cancelled.'),{code:4001});
export function mountWallets(api){
  let selected=null,secret=null,selection=null,epoch=0,busy=false,signing=false,closePending=null,hideTimer=null,lastUse=Date.now();
  const panel=document.createElement('dialog');panel.id='twDialog';panel.className='ts';
  panel.innerHTML='<section class="twPanel"><header><div><small>TRADING WALLETS</small><h2>Your funds. Your wallets.</h2></div><button id="twClose" aria-label="Close wallets">'+icon('close')+'</button></header><div id="twBody"></div><p id="twStatus" role="status" aria-live="polite"></p></section>';
  document.body.append(panel);
  const body=panel.querySelector('#twBody'),status=panel.querySelector('#twStatus');
  const launch=document.createElement('button');launch.className='btn tsIconButton';launch.id='twLaunch';launch.innerHTML=icon('wallet')+'Trading wallets';
  document.getElementById('wlConnect').parentElement.before(launch);
  const focusLaunch=launch.cloneNode(true);focusLaunch.id='twFocusLaunch';document.getElementById('tsFocusHead')?.after(focusLaunch);
  const badge=document.createElement('div');badge.id='twBadge';launch.after(badge);
  const field=(id,label,type='text',extra='')=>`<label>${label}<input id="${id}" type="${type}" ${extra} autocomplete="${type==='password'?'new-password':'off'}" spellcheck="false" autocapitalize="none"></label>`;
  const button=(id,label,name='wallet')=>`<button id="${id}" class="tsIconButton">${icon(name)}${label}</button>`;
  const get=id=>panel.querySelector('#'+id);
  const read=id=>{
    const raw=localStorage.getItem(prefix+id);if(!raw)throw new Error('This wallet is unavailable on this device. Import its backup or choose another wallet.');
    const r=JSON.parse(raw);
    if(r.id!==id||!['evm','solana'].includes(r.chain)||typeof r.address!=='string'||!(r.chain==='evm'?/^0x[0-9a-fA-F]{40}$/:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).test(r.address)||typeof r.name!=='string'||!r.payload)throw new Error('Wallet storage is damaged. Import your backup on another device.');
    return r;
  };
  const records=()=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>read(k.slice(prefix.length)));
  function notify(message){status.textContent=message;}
  function renderBadge(){badge.textContent=selected?`${selected.name} · ${selected.chain==='evm'?'EVM':'Solana'} · ${secret?'Unlocked':'Locked'}`:'Account / connected wallet';api.refresh();}
  function close(){if(busy||signing){notify('Finish or cancel the current action first.');return;}clearTimeout(hideTimer);body.replaceChildren();panel.close();}
  function lock(){epoch++;secret=null;clearTimeout(hideTimer);if(selection)selection.locked=true;api.disarm();if(closePending)closePending(false);if(panel.open){body.replaceChildren();panel.close();}renderBadge();}
  function assertCurrent(id,version){if(!secret||selected?.id!==id||epoch!==version||document.hidden)throw new Error('Wallet locked or changed. Unlock it and review again.');lastUse=Date.now();}
  async function confirm(title,content){
    if(panel.open)throw new Error('Close the wallet manager before trading.');
    const review=api.review?.();
    const summary=review?`<h4>${esc(review.action)}</h4><dl><dt>You spend</dt><dd>${esc(review.spend)}</dd><dt>Minimum received</dt><dd>${esc(review.minimum)}</dd><dt>Slippage limit</dt><dd>${esc(review.slippage)}</dd><dt>Token</dt><dd class="twAddress">${esc(review.token)}</dd></dl>`:'';
    signing=true;body.innerHTML=`<h3>${esc(title)}</h3>${summary}${content}<div class="twActions">${button('twReject','Cancel','close')}${button('twApprove','Confirm transaction','wallet')}</div>`;
    notify('This transaction uses your selected trading wallet.');panel.showModal();
    return new Promise(resolve=>{closePending=ok=>{closePending=null;signing=false;body.replaceChildren();panel.close();resolve(ok);};get('twReject').onclick=()=>closePending(false);get('twApprove').onclick=()=>closePending(true);get('twReject').focus();});
  }
  function adapter(record){
    let chain=api.chains.base;
    return {name:record.name,chain:record.chain,address:record.address,locked:!secret,provider:{
      async request({method,params=[]}){
        if(record.chain==='solana'){
          if(method!=='signAndSendTransaction')throw new Error('Unsupported Solana request.');
          const version=epoch;assertCurrent(record.id,version);
          if(typeof params.message!=='string'||params.message.length>20000)throw new Error('Invalid Solana transaction.');
          const ok=await confirm('Confirm Solana swap',`<p>Review the quoted amount, minimum received, and slippage in the trade ticket before signing.</p><dl><dt>Network</dt><dd>Solana mainnet</dd><dt>Signing wallet</dt><dd>${esc(record.name)}</dd><dt>Address</dt><dd class="twAddress">${esc(record.address)}</dd></dl>`);
          if(!ok)throw rejected();assertCurrent(record.id,version);
          const signed=signSolana(secret,params.message,record.address);
          const signature=await api.rpc(api.chains.solana.rpc,'sendTransaction',[signed,{encoding:'base64',skipPreflight:false,maxRetries:3}]);
          return {signature};
        }
        if(method==='eth_accounts'||method==='eth_requestAccounts')return [record.address];
        if(method==='eth_chainId')return chain.hex;
        if(method==='wallet_switchEthereumChain'){
          const next=Object.values(api.chains).find(c=>!c.sol&&c.hex===params[0]?.chainId);if(!next)throw new Error('Unsupported network.');chain=next;return null;
        }
        if(method==='eth_sendTransaction'){
          const version=epoch;assertCurrent(record.id,version);
          const prepared=await prepareEvm(secret,chain,params[0]||{});
          try{
            assertCurrent(record.id,version);
            const ok=await confirm(prepared.contract?'Confirm contract transaction':'Confirm transfer',`<dl><dt>Network</dt><dd>${esc(chain.name)}</dd><dt>Signing wallet</dt><dd>${esc(record.name)}</dd><dt>From</dt><dd class="twAddress">${record.address}</dd><dt>To</dt><dd class="twAddress">${prepared.to}</dd><dt>Amount</dt><dd>${prepared.value} ETH</dd><dt>Maximum network fee</dt><dd>${prepared.fee} ETH</dd></dl>${prepared.contract?'<p>This is a contract call, which may approve or swap tokens. Review the trade ticket before confirming.</p>':''}`);
            if(!ok)throw rejected();assertCurrent(record.id,version);return await prepared.send(()=>assertCurrent(record.id,version));
          }finally{prepared.cancel();}
        }
        if(!['eth_call','eth_getBalance','eth_estimateGas','eth_getTransactionCount','eth_gasPrice','eth_getTransactionReceipt','eth_blockNumber'].includes(method))throw new Error('Unsupported wallet request.');
        return api.rpc(chain.rpc,method,params);
      }
    }};
  }
  function choose(record,key=null){
    if(api.isTrading()||signing)throw new Error('Wait for the current transaction to finish before switching wallets.');
    if(record)localStorage.setItem(activeKey,record.id);else localStorage.removeItem(activeKey);
    epoch++;secret=key;selected=record;selection=record?adapter(record):null;lastUse=Date.now();api.select(selection);renderBadge();
  }
  async function action(fn){
    if(busy)return;busy=true;notify('Working…');const controls=[...body.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
    try{await fn();}catch(e){notify(e?.message||'Could not finish. Please try again.');}finally{busy=false;controls.forEach(b=>b.disabled=false);}
  }
  function home(){
    clearTimeout(hideTimer);notify('');
    let list;try{list=records();}catch(e){body.innerHTML='<p>Wallet storage needs attention. No stored keys have been changed.</p>'+button('twAccount','Use account / connected wallet');get('twAccount').onclick=()=>action(async()=>{choose(null);home();});notify(e.message);return;}
    body.innerHTML=`<p>Create a separate trading wallet or import one you own. Your account wallet stays separate.</p><div class="twActions">${button('twCreate','Create wallet','add')}${button('twImport','Import private key','wallet')}</div><div class="twWallets">${list.map(r=>`<article><div><strong>${esc(r.name)}</strong><small>${r.chain==='evm'?'Base + Robinhood · EVM':'Solana'}${selected?.id===r.id?' · Selected'+(secret?' · Unlocked':' · Locked'):''}</small><code class="twAddress">${esc(r.address)}</code></div><button data-wallet="${esc(r.id)}">Manage</button></article>`).join('')||'<p>No extra wallets on this device yet.</p>'}</div><div class="twActions">${button('twAccount','Use account / connected wallet','avatar')}${selected?button('twLock','Lock wallet','wallet'):''}</div><p class="twHint">Wallets are encrypted on this device with a password you choose. Export a backup before clearing browser or app data. DeHub cannot reset this password or recover these keys. Import the same key on another device to use the same wallet there.</p>`;
    get('twCreate').onclick=()=>form(false);get('twImport').onclick=()=>form(true);
    get('twAccount').onclick=()=>action(async()=>{choose(null);home();});if(get('twLock'))get('twLock').onclick=lock;
    body.querySelectorAll('[data-wallet]').forEach(b=>b.onclick=()=>details(read(b.dataset.wallet)));
  }
  function form(importing){
    notify('');body.innerHTML=`<h3>${importing?'Import a wallet':'Create a trading wallet'}</h3>${field('twName','Wallet name','text','maxlength="40" placeholder="Trading wallet"')}<label>Wallet type<select id="twChain"><option value="evm">EVM · Base + Robinhood</option><option value="solana">Solana</option></select></label>${importing?field('twKey','Private key','password','maxlength="1200" data-private="true"'):''}${field('twPassword','Vault password · at least 12 characters','password','maxlength="256"')}${field('twRepeat','Repeat vault password','password','maxlength="256"')}<p class="twHint">This password protects this wallet on this device. Keep an exported key backup somewhere private.</p><div class="twActions">${button('twBack','Back','exit')}${button('twSave',importing?'Import wallet':'Create wallet','save')}</div>`;
    get('twBack').onclick=home;get('twSave').onclick=()=>action(async()=>{
      const version=epoch;
      if(records().length>=20)throw new Error('This device already has 20 trading wallets.');
      const password=get('twPassword').value;
      if(password!==get('twRepeat').value)throw new Error('The passwords do not match.');
      if(password.length<12)throw new Error('Use at least 12 characters for the vault password.');
      const chain=get('twChain').value;
      const material=importing?normalizeSecret(get('twKey').value,chain):createSecret(chain);
      if(records().some(r=>r.chain===chain&&r.address===material.address))throw new Error('This wallet is already saved on this device.');
      const record={id:crypto.randomUUID(),name:(get('twName').value.trim()||'Trading wallet').replace(/[<>&"']/g,'').slice(0,40),chain,address:material.address};
      record.payload=await encryptSecret(material.secret,password,record);
      localStorage.setItem(prefix+record.id,JSON.stringify(record));
      // Re-read the durable record before offering a deposit address.
      const saved=read(record.id);const interrupted=document.hidden||version!==epoch;
      if(interrupted){material.secret='';return;}
      choose(saved,material.secret);material.secret='';details(saved);
      notify('Wallet saved. Export your private key backup before adding funds.');
    });
  }
  function details(record){
    clearTimeout(hideTimer);notify('');
    body.innerHTML=`<h3>${esc(record.name)}</h3><p>${record.chain==='evm'?'EVM · Base and Robinhood Chain':'Solana mainnet'}</p><code class="twAddress">${record.address}</code><div class="twActions">${button('twSelect',selected?.id===record.id&&secret?'Selected · unlocked':'Unlock and use','wallet')}${button('twFund','Add funds','add')}${button('twExport','Export private key','save')}${button('twBack','All wallets','desk')}</div><p class="twHint">${selected?.id===record.id?'This wallet is selected. '+(secret?'It can sign after you confirm a transaction.':'Unlock it to trade; your account wallet will not be used instead.'):'Select this wallet to use it for trading.'}</p>`;
    get('twBack').onclick=home;get('twFund').onclick=()=>fund(record);get('twExport').onclick=()=>passwordForm(record,true);
    get('twSelect').onclick=()=>{if(selected?.id===record.id&&secret){close();return;}passwordForm(record,false);};
  }
  function passwordForm(record,exporting){
    notify('');body.innerHTML=`<h3>${exporting?'Export private key':'Unlock wallet'}</h3><p>${esc(record.name)}</p>${field('twUnlockPassword','Vault password','password','maxlength="256"')}<div class="twActions">${button('twBack','Back','exit')}${button('twUnlock',exporting?'Reveal private key':'Unlock and use','wallet')}</div>${exporting?'<p class="twHint">Anyone with this key can spend this wallet’s funds. Reveal it only in a private place.</p>':''}`;
    get('twBack').onclick=()=>details(record);get('twUnlock').onclick=()=>action(async()=>{
      const version=epoch;const clear=await decryptSecret(read(record.id),get('twUnlockPassword').value);
      if(document.hidden||version!==epoch)throw new Error('Wallet locked while unlocking. Try again.');
      get('twUnlockPassword').value='';
      if(exporting){
        body.innerHTML=`<h3>Private key backup</h3><p>${esc(record.name)} · ${record.chain==='evm'?'EVM hex key':'Solana base58 key'}</p><textarea id="twRevealed" readonly aria-label="Private key" autocomplete="off" spellcheck="false" data-private="true"></textarea><p class="twHint">Save this privately. This view hides after 30 seconds. A copied key remains in your clipboard until you replace it.</p><div class="twActions">${button('twCopyKey','Copy private key','save')}${button('twHide','Hide key','close')}</div>`;
        get('twRevealed').value=clear;get('twCopyKey').onclick=()=>action(async()=>{await copy(get('twRevealed').value);notify('Private key copied. Keep it private.');});get('twHide').onclick=()=>details(record);
        hideTimer=setTimeout(()=>{if(panel.open)details(record);},30000);
      }else{choose(record,clear);details(record);notify('Selected for trading. Close this panel to continue.');}
    });
  }
  async function copy(value){
    try{await navigator.clipboard.writeText(value);}catch{
      const input=document.createElement('textarea');input.value=value;panel.append(input);input.select();const ok=document.execCommand('copy');input.value='';input.remove();if(!ok)throw new Error('Copy unavailable. Select and copy the displayed value.');
    }
  }
  function fund(record){
    clearTimeout(hideTimer);notify('');body.innerHTML=`<h3>Add funds to ${esc(record.name)}</h3><label>Deposit network<select id="twNetwork">${record.chain==='evm'?'<option value="base">Base · ETH for gas</option><option value="robinhood">Robinhood Chain · ETH for gas</option>':'<option value="solana">Solana · SOL for fees</option>'}</select></label><div class="twQr" aria-label="Deposit address QR code">${depositQr(record.address)}</div><code class="twAddress">${record.address}</code><p id="twDepositNote"></p><div class="twActions">${button('twCopyAddress','Copy address','wallet')}${button('twBack','Back','exit')}</div><p class="twHint">Transfer from your account wallet, an exchange, or another wallet using this exact network. Tokens and gas balances are separate on each network. The QR contains the address; choose the matching network in the sending wallet.</p>`;
    const update=()=>{const chain=api.chains[get('twNetwork').value];get('twDepositNote').textContent=`Receive assets on ${chain.name}. Keep some ${chain.gas} here to pay transaction fees. Transfers on a different network will not fund this network’s trading balance.`;};
    get('twNetwork').onchange=update;update();get('twCopyAddress').onclick=()=>action(async()=>{await copy(record.address);notify('Deposit address copied.');});get('twBack').onclick=()=>details(record);
  }
  launch.onclick=()=>{home();panel.showModal();get('twClose').focus();};get('twClose').onclick=()=>{if(closePending)closePending(false);else close();};
  focusLaunch.onclick=launch.onclick;
  panel.addEventListener('cancel',event=>{event.preventDefault();if(closePending)closePending(false);else close();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});window.addEventListener('pagehide',lock);
  window.addEventListener('trenchstar:wallet-lock',lock);
  document.addEventListener('pointerdown',()=>{lastUse=Date.now();},{passive:true});document.addEventListener('keydown',()=>{lastUse=Date.now();});
  const inactivity=setInterval(()=>{if(secret&&Date.now()-lastUse>5*60*1000)lock();},15000);
  window.addEventListener('storage',event=>{if(event.key===activeKey||event.key?.startsWith(prefix)){lock();try{const id=localStorage.getItem(activeKey);selected=id?read(id):null;selection=selected?adapter(selected):null;api.select(selection);renderBadge();}catch{notify('Wallet changed in another tab. Reload before continuing.');}}});
  try{const id=localStorage.getItem(activeKey);if(id){selected=read(id);selection=adapter(selected);api.select(selection);}renderBadge();}catch(e){badge.textContent='Trading wallet locked · open Trading wallets';}
  return ()=>{lock();clearInterval(inactivity);panel.remove();launch.remove();focusLaunch.remove();badge.remove();};
}
