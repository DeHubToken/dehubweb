const ids={btnChartControls:'settings',btnWallet:'wallet',btnSearch:'search',btnChar:'avatar',btnExit:'exit',btnAdd:'add',btnAlerts:'bell',btnCast:'cast',btnSet:'settings',tsEnvironment:'environment',tsFavorite:'star',tsPractice:'trophy',tsClose:'close',tsSaveDesk:'save',tsCreateRoom:'room',tsJoinRoom:'link',tsJoinVoice:'mic',tsLeaveVoice:'exit',tsMute:'mic',tsLeaveRoom:'exit',tsCopyInvite:'link',tsAddAlert:'bell',tsArm:'bell',tsCopy:'link',tsJoinPaper:'trophy',tsLeave:'exit',tsOrder:'trophy',tsRefreshPaper:'focus',tsVoice:'mic',setClose:'close',setReset:'settings',btnGrid:'desk',wlConnect:'wallet',wlSol:'wallet',aAdd:'bell',aCustom:'volume',sndTest:'play'};
Object.assign(ids,{uiSnd:'volume',csDesk:'desk',pkCancel:'close',pkGo:'play',btnDesk:'desk',btnRestore:'desk',fpReplace:'desk',fpTfAll:'focus',prevAdd:'add',prevDrop:'trash'});
const tabs={focus:'focus',desks:'desk',room:'room',paper:'trophy',alerts:'bell'};
const picker={chart:'focus',stat:'desk',site:'link',stream:'cast',cast:'cast',image:'environment',video:'play',clear:'trash'};
const labels={'save':'save','open':'desk','delete':'trash','create room':'room','join room':'link','copy invite':'link','join voice':'mic','leave voice':'exit','mute':'mic','unmute':'mic','leave room':'exit','end room':'exit','join this week':'trophy','buy':'buy','sell':'sell','place practice trade':'trophy','arm alert':'bell','close':'close'};
export function icon(name,size=24){return `<img class="tsIcon" src="icons/${name}.svg" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false">`;}
export function mountIcons(){
  const roots=['tsNav','btnRow','tsFocus','tsDialog','setPanel','alertPanel','walletPanel','csBox','pkBox','srBox','fp','prev'].map(id=>document.getElementById(id)).filter(Boolean);
  function decorate(){
    for(const root of roots)for(const button of root.querySelectorAll('button,.panelX[data-close]')){
      if(button.querySelector('.tsIcon'))continue;
      const label=button.textContent.trim().toLowerCase();
      const name=ids[button.id]||tabs[button.dataset.tab]||picker[button.dataset.pk]||(button.dataset.close?'close':button.dataset.mode==='new'?'add':button.dataset.mode==='replace'?'desk':button.dataset.delete!==undefined?'trash':button.dataset.load!==undefined?'desk':labels[label]);
      if(!name)continue;
      if(button.dataset.pk)button.querySelector('b')?.remove();
      if(button.matches('.panelX')){
        button.textContent='';button.setAttribute('role','button');button.setAttribute('aria-label','Close panel');button.tabIndex=0;
        if(!button.dataset.iconKeyboard){button.dataset.iconKeyboard='true';button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();button.click();}});}
      }
      for(const node of [...button.childNodes])if(node.nodeType===3)node.textContent=node.textContent.replace(/^[^a-zA-Z]+/,'');
      if(button.id==='btnAlerts')button.textContent='Local alerts';
      button.insertAdjacentHTML('afterbegin',icon(name,button.dataset.pk?40:24));button.classList.add('tsIconButton');
    }
    const kicker=document.getElementById('tsKicker');
    if(kicker&&!kicker.querySelector('.tsIcon')){
      const name={WORKSPACE:'desk','SHARED FLOOR':'room','MARKET ALERTS':'bell',ENVIRONMENT:'environment'}[kicker.textContent.toUpperCase()]||'trophy';
      kicker.insertAdjacentHTML('afterbegin',icon(name,40));
    }
  }
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.target.closest?.('button,#tsKicker')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('button')||n.querySelector('button')))))decorate();
  });
  for(const root of roots)observer.observe(root,{childList:true,subtree:true});
  decorate();
}
