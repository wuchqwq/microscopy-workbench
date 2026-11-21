// Actual emitted viewer with a narrow Electron port; not native GUI acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {desktopPanelIdentity,showDesktopPanelWindow} from '../lib/desktop_panel_activation.mjs';
import {desktopSecurityPreferences,isOwnedDesktopDocument,isRow,readWorkspaceStatus} from '../lib/desktop_contracts.mjs';

function fixture(platform='darwin',{hidden=false,veto=false}={}) {
 const panelId='a'.repeat(32),helperSessionId='b'.repeat(32),token='c'.repeat(48);
 const input={workspace:'/isolated-task',panelId,helperSessionId,generation:1,requestId:'first'};
 const address={url:'http://127.0.0.1:12345/#'+token,origin:'http://127.0.0.1:12345',token};
 const app=new EventEmitter(),receipts=new Map(),menus=[],calls={loads:0,focus:0,quit:0,acks:0},dialogs=[];
 let window,stopped=false,choice=0,current=address.url;const output=[],errors=[];
 Object.assign(app,{setName(){},setPath(){},setAppLogsPath(){},requestSingleInstanceLock:()=>true,whenReady:async()=>{},dock:{hide(){calls.hide=(calls.hide??0)+1;}},exit:code=>{throw Error('Unexpected exit '+code);},quit:()=>{calls.quit++;}});
 class Window extends EventEmitter {
  constructor(options){super();window=this;this.options=options;this.destroyed=false;this.visible=false;this.focused=false;this.minimized=false;this.gone=false;
   this.webContents=new EventEmitter();Object.assign(this.webContents,{getURL:()=>this.url,isDestroyed:()=>this.gone,isCrashed:()=>this.gone,setWindowOpenHandler(){},session:{setPermissionCheckHandler(){},setPermissionRequestHandler(){}}});}
  async loadURL(url){this.url=url;calls.loads++;}
  isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isMinimized(){return this.minimized;}isFocused(){return this.focused;}
  restore(){this.minimized=false;}show(){this.visible=true;}focus(){this.focused=true;calls.focus++;}destroy(){this.destroyed=true;}
  close(){this.emit('close',{preventDefault(){assert.fail('Window close must check the renderer first');}});
   if(veto){this.webContents.emit('will-prevent-unload',{preventDefault(){assert.fail('Hidden probe must respect renderer veto');}});return;}
   this.destroyed=true;this.emit('closed');}
 }
 const electron={app,BrowserWindow:Window,Menu:{buildFromTemplate:items=>items,setApplicationMenu:menu=>menus.push(menu)},dialog:{showMessageBoxSync:(_window,options)=>{dialogs.push(options);return choice;},showMessageBox:async(_window,options)=>{dialogs.push(options);return {response:0};}}};
 const contents=readFileSync(new URL('../tools/desktop_panel_viewer.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('const { app, BrowserWindow, Menu, dialog } = await import(electronModule);','const { app, BrowserWindow, Menu, dialog } = __electron;');
 const context=vm.createContext({__electron:electron,desktopPanelIdentity,showDesktopPanelWindow,desktopSecurityPreferences,isOwnedDesktopDocument,isRow,readWorkspaceStatus,
  desktopPanelProfile:()=>'/isolated-profile',assertDesktopPanelIntent(){},readDesktopPanelActivation:request=>receipts.get(request.requestId)??null,
  acknowledgeDesktopPanelActivation:(request,result)=>{receipts.set(request.requestId,result);calls.acks++;},attachedDesktopPanelStopped:()=>stopped,
  desktopPanelAddress:()=>({...address,url:current}),Buffer,AbortSignal,process:{platform,pid:42,stderr:{write(value){errors.push(value);}},stdout:{write(value,done){output.push(JSON.parse(value));done();}},argv:['electron','viewer',...(hidden?['--verify-hidden-start']:[]),input.workspace,panelId,helperSessionId,'1',input.requestId]},
  fetch:async()=>({ok:true,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:Buffer.from(JSON.stringify({panel_id:panelId,helper_session_id:helperSessionId,panel_generation:1,workspace_analysis:{schema_version:1,status:'clean',dirty:false,can_close:true,working_revision:1,unresolved_request_id:null,recovery_available:false}}))}),cancel:async()=>{}};}}}),
 });
 new vm.Script(contents).runInContext(context);
 const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
 return {app,calls,menus,receipts,dialogs,output,errors,input,settle,get window(){return window;},setStopped:v=>{stopped=v;},setChoice:v=>{choice=v;},setAddress:v=>{current=v;}};
}

test('Mac menu supplies standard editing and guarded Quit, not scientific actions',async()=>{
 const h=fixture();await h.settle();
 assert.equal(h.calls.loads,1);assert.equal(h.calls.acks,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.window.options.webPreferences)),{...desktopSecurityPreferences,devTools:false,partition:'mwb-attached-panel'});
 const roles=h.menus[0].flatMap(menu=>menu.submenu.map(item=>item.role).filter(Boolean));
 for(const name of ['quit','copy','paste','undo','selectAll'])assert.ok(roles.includes(name));
 assert.ok(!roles.some(name=>/fft|analysis|measure/.test(name)));
 assert.equal(h.app.listenerCount('activate'),1);
});

test('Dock reveal reuses the same renderer without request replay or scientific state change',async()=>{
 const h=fixture();await h.settle();const first=h.window,acks=h.calls.acks;
 h.window.visible=false;h.window.focused=false;h.window.minimized=true;
 h.app.emit('activate');await h.settle();
 assert.equal(h.window,first);assert.equal(first.isVisible(),true);assert.equal(first.isMinimized(),false);
 assert.equal(h.calls.loads,1);assert.equal(h.calls.acks,acks);
});

test('Dock activation refuses a foreign generation address or a gone renderer',async()=>{
 for(const mode of ['address','renderer']){
  const h=fixture();await h.settle();const focus=h.calls.focus;
  if(mode==='address')h.setAddress('http://127.0.0.1:23456/');else h.window.gone=true;
  h.app.emit('activate');await h.settle();
  assert.equal(h.calls.focus,focus);assert.equal(h.calls.loads,1);assert.equal(h.calls.acks,1);
 }
});

test('attached close retains unknown/live helper protection and explicit stopped-helper choice',async()=>{
 const h=fixture();await h.settle();
 const close={preventDefault(){assert.fail('Live renderer close event itself is not forced');}};
 h.window.emit('close',close);let allowed=0;
 h.window.webContents.emit('will-prevent-unload',{preventDefault(){allowed++;}});await h.settle();
 assert.equal(allowed,0);assert.equal(h.calls.quit,0);
 h.setStopped(true);
 for(const choice of [0,1]){h.setChoice(choice);h.window.emit('close',close);h.window.webContents.emit('will-prevent-unload',{preventDefault(){allowed++;}});}
 assert.equal(allowed,1);assert.equal(h.calls.loads,1);
});

test('Windows retains its menu behavior; closing either platform quits only viewer',async()=>{
 for(const platform of ['win32','darwin']){
  const h=fixture(platform);await h.settle();
  if(platform==='win32'){assert.equal(h.menus[0],null);assert.equal(h.app.listenerCount('activate'),0);}
  h.app.emit('window-all-closed');await h.settle();assert.equal(h.calls.quit,1);
  assert.equal(h.calls.loads,1);assert.equal(h.calls.acks,1);
 }
});

test('hidden bundle probe uses the same renderer, never focuses or reports activation, and quits only on clean close',async()=>{
 const h=fixture('darwin',{hidden:true});await h.settle();
 assert.equal(h.window.options.show,false);assert.equal(h.calls.loads,1);
 assert.equal(h.window.isDestroyed(),true);assert.equal(h.calls.focus,0);assert.equal(h.calls.hide,1);
 assert.equal(h.calls.acks,0);assert.deepEqual(h.dialogs,[]);assert.equal(h.menus.length,0);
 assert.equal(h.app.listenerCount('activate'),0);assert.equal(h.calls.quit,1);
 assert.deepEqual(h.output,[{viewer:'ready',close:'normal',pid:42}]);
 const protectedViewer=fixture('darwin',{hidden:true,veto:true});await protectedViewer.settle();
 assert.equal(protectedViewer.window.isDestroyed(),false);
 assert.equal(protectedViewer.calls.quit,0);assert.equal(protectedViewer.calls.acks,0);
 assert.deepEqual(protectedViewer.output,[]);assert.deepEqual(protectedViewer.dialogs,[]);
 assert.match(protectedViewer.errors.join(''),/renderer close guard/);
});
