import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.argv[2]||'node_modules','_navigation-tests.cjs'));
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('public/trenchstar-game/index.html','utf8');

test('zoom returns keyboard focus, leaves settings closed, and arrows switch silently',()=>{
  const dom=new JSDOM('<canvas tabindex="0"></canvas><select id="fpTpl"><option>candles</option></select><div id="fpTplWrap"></div><div id="focusPanel" class="on"></div><button id="btnChartControls" hidden></button><div id="fpFlick"></div><div id="charSel"></div>');
  const document=dom.window.document,$=s=>document.querySelector(s),canvas=$('canvas');
  const vector={copy(){return this;},set(){return this;},applyQuaternion(){return this;},clone(){return this;},addScaledVector(){return this;}};
  const first={tpl:'candles',w:2,h:1,mesh:{getWorldPosition(){},getWorldQuaternion(){}}},second={...first,label:'ETH'};
  let sounds=0;
  const context=vm.createContext({document,$,renderer:{domElement:canvas},focus:{screen:null,savedP:vector,savedT:vector},walk:{goto:null},camera:{position:vector,fov:50,aspect:1.5},controls:{target:vector},wp:vector,wq:{},nrm:vector,flickLane:null,flickAt:0,performance:{now:()=>1000},FLICK_DUR:0.3,FLICK_REPEAT:300,hideAff(){},flyTo(){},syncTfRow(){},flickAny:()=>true,syncBuyBox(){},syncSiteFocus(){},syncFocusHud(){},flickLaneOf:()=>0,flickTarget:()=>second,flickY:()=>0,playSound(){sounds++;},release(){},addEventListener:dom.window.addEventListener.bind(dom.window)});
  vm.runInContext(source.slice(source.indexOf('function focusOn(s,dur){'),source.indexOf('function release(){')),context);
  vm.runInContext(source.slice(source.indexOf('function flickFocus(dir,vert){'),source.indexOf('/* pointer input is handled',source.indexOf('function flickFocus(dir,vert){'))),context);
  const start=source.indexOf("\naddEventListener('keydown',e=>{");
  vm.runInContext(source.slice(start,source.indexOf("addEventListener('keyup',e=>{",start)),context);
  $('#fpTpl').focus();context.focusOn(first);
  assert.equal(document.activeElement,canvas);
  assert.equal($('#focusPanel').classList.contains('on'),false);
  assert.equal($('#btnChartControls').hidden,false);
  canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(context.focus.screen,second);
  assert.equal(sounds,0);
  assert.equal($('#focusPanel').classList.contains('on'),false);
  dom.window.close();
});

test('focus view arrows change favourites without stealing keys from fields or wallets',()=>{
  const dom=new JSDOM('<div id="btnRow"></div><div id="charSel"></div>',{url:'https://staging.dehub.io/trenchstar-game/?view=focus',runScripts:'outside-only'});
  const w=dom.window;w.matchMedia=()=>({matches:false});w.setInterval=()=>0;w.mountIcons=()=>{};
  const connected=fs.readFileSync('public/trenchstar-game/connected.js','utf8').replace(/^\s*import [^\n]+\n/,'').replace('export function mountConnected','function mountConnected');
  w.eval(connected+'\nwindow.mountConnected=mountConnected;');
  w.mountConnected({screens:[],exitWalk(){},setGuide(){},release(){}});
  const key=target=>target.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  const name=()=>w.document.querySelector('#tsMarketName').textContent;
  key(w.document.body);assert.equal(name(),'ETH / USDT');
  key(w.document.querySelector('#tsSymbol'));assert.equal(name(),'ETH / USDT');
  const wallet=w.document.createElement('dialog');wallet.setAttribute('open','');w.document.body.append(wallet);
  key(w.document.body);assert.equal(name(),'ETH / USDT');wallet.remove();
  key(w.document.body);assert.equal(name(),'SOL / USDT');
  w.close();
});
