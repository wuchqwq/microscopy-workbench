// The owned provider Panel remains the authority when this renderer detaches.
import type {EventEmitter} from 'node:events';
import {
 acknowledgeDesktopPanelActivation,assertDesktopPanelIntent,attachedDesktopPanelStopped,desktopPanelAddress,desktopPanelIdentity,
 desktopPanelProfile,readDesktopPanelActivation,showDesktopPanelWindow,
} from '../lib/desktop_panel_activation.mjs';
import type {DesktopPanelActivation,DesktopPanelIdentity} from '../lib/desktop_panel_activation.mjs';
import {desktopSecurityPreferences,isOwnedDesktopDocument,isRow} from '../lib/desktop_contracts.mjs';

interface NavigationEvent {preventDefault():void;url?:string;}
interface AttachedWindow extends EventEmitter {
 loadURL(url:string):Promise<void>;
 isDestroyed():boolean;
 isMinimized():boolean;
 isVisible():boolean;
 isFocused():boolean;
 restore():void;
 show():void;
 focus():void;
 destroy():void;
 webContents:EventEmitter&{
  getURL():string;
  isCrashed():boolean;
  isDestroyed():boolean;
  setWindowOpenHandler(handler:()=>{action:'deny'}):void;
  session:{
   setPermissionCheckHandler(handler:()=>boolean):void;
   setPermissionRequestHandler(handler:(_contents:unknown,_permission:unknown,reply:(allow:boolean)=>void)=>void):void;
  };
 };
}
interface ViewerElectron {
 app:EventEmitter&{
  setName(name:string):void;
  setPath(name:'userData'|'sessionData'|'crashDumps',directory:string):void;
  setAppLogsPath(directory:string):void;
  requestSingleInstanceLock(data:Record<string,unknown>):boolean;
  whenReady():Promise<void>;
  exit(code:number):void;
  quit():void;
 };
 BrowserWindow:new (options:unknown)=>AttachedWindow;
 Menu:{setApplicationMenu(menu:null):void};
 dialog:{showMessageBox(window:AttachedWindow,options:unknown):Promise<unknown>;showMessageBoxSync(window:AttachedWindow,options:unknown):number};
}

const electronModule='electron';
const {app,BrowserWindow,Menu,dialog}=await import(electronModule) as unknown as ViewerElectron;
const stateLimit=20*1024*1024;

function readArguments(argv:readonly string[]) {
 if(argv.length!==5||!/^\d{1,16}$/.test(argv[3]!))throw new Error('Invalid attached Panel launch arguments');
 const [workspace,panelId,helperSessionId,generation,requestId]=argv;
 return desktopPanelIdentity(workspace!,{panelId,helperSessionId,generation:Number(generation),requestId});
}

async function verifyHelper(input:DesktopPanelIdentity,address:ReturnType<typeof desktopPanelAddress>) {
 const response=await fetch(address.origin+'/api/state',{
  headers:{'X-Panel-Token':address.token},redirect:'error',signal:AbortSignal.timeout(3000),
 });
 if(!response.ok||!response.body)throw new Error('Owned Panel state unavailable');
 const reader=response.body.getReader(),chunks:Buffer[]=[];
 let bytes=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>stateLimit)throw new Error('Owned Panel state exceeds its bound');
   chunks.push(Buffer.from(value));
  }
 }finally{await reader.cancel();}
 const state:unknown=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
 if(!isRow(state)||state.panel_id!==input.panelId||state.helper_session_id!==input.helperSessionId||state.panel_generation!==input.generation)throw new Error('Owned Panel helper identity mismatch');
}

async function createViewer(input:DesktopPanelIdentity) {
 const address=desktopPanelAddress(input);
 await verifyHelper(input,address);
 Menu.setApplicationMenu(null);
 const window=new BrowserWindow({title:'Microscopy Workbench',width:1440,height:980,minWidth:720,minHeight:560,show:false,backgroundColor:'#171817',
  // The existing renderer moves the capability into sessionStorage.
  webPreferences:{...desktopSecurityPreferences,devTools:false,partition:'mwb-attached-panel'},
 });
 const contents=window.webContents;
 contents.session.setPermissionCheckHandler(()=>false);
 contents.session.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false));
 contents.setWindowOpenHandler(()=>({action:'deny'}));
 for(const event of ['will-navigate','will-frame-navigate','will-redirect']){
  contents.on(event,(e:NavigationEvent,target?:string)=>{
   if(!isOwnedDesktopDocument(e.url??target??'',address))e.preventDefault();
  });
 }
 contents.on('will-attach-webview',(event:NavigationEvent)=>event.preventDefault());
 let renderProcessGone=false;
 contents.on('render-process-gone',()=>{renderProcessGone=true;});
 const rendererGone=()=>renderProcessGone||contents.isDestroyed()||contents.isCrashed();
 let closeRequested=false,closeNotice=false,rendererCloseConfirmed=false;
 window.on('close',(event:NavigationEvent)=>{
  closeRequested=false;
  rendererCloseConfirmed=false;
  if(!rendererGone()){closeRequested=true;return;}
  const choice=dialog.showMessageBoxSync(window,{type:'warning',title:'Microscopy Workbench',message:'工作台界面进程已停止',
   detail:'关闭此窗口会保留已写入工作区的记录和恢复草稿。仅存在于界面的编辑已无法从此窗口取回。',
   buttons:['保持窗口','关闭此窗口'],defaultId:0,cancelId:0,noLink:true});
  rendererCloseConfirmed=choice===1;
  if(!rendererCloseConfirmed)event.preventDefault();
 });
 contents.on('will-prevent-unload',(event:NavigationEvent)=>{
  // Let the Panel's existing renderer guard refuse unload, including local drafts.
  if(rendererCloseConfirmed&&rendererGone()){
   rendererCloseConfirmed=false;
   event.preventDefault();
   return;
  }
  const nativeClose=closeRequested;
  closeRequested=false;
  if(!nativeClose||closeNotice)return;
  if(attachedDesktopPanelStopped(input)){
   const choice=dialog.showMessageBoxSync(window,{type:'warning',title:'Microscopy Workbench',message:'原工作台后台已停止',
    detail:'关闭此窗口会保留已写入工作区的记录和恢复草稿。尚未写入工作区的界面编辑可能丢失。',
    buttons:['返回工作台','关闭此窗口'],defaultId:0,cancelId:0,noLink:true});
   // Electron allows this specific unload only when the user confirms and the
   // original helper is still proved stopped. This detaches the renderer only.
   if(choice===1&&attachedDesktopPanelStopped(input))event.preventDefault();
   return;
  }
  closeNotice=true;
  void dialog.showMessageBox(window,{type:'info',title:'Microscopy Workbench',message:'工作台保持打开',detail:'请在工作台核对未保存编辑、恢复草稿或原请求，再保存并关闭。',buttons:['返回工作台']}).catch(()=>{}).finally(()=>{closeNotice=false;});
 });
 try{await window.loadURL(address.url);}catch(error){window.destroy();throw error;}
 return {window,address,rendererGone};
}

function start(input:DesktopPanelIdentity):void {
 app.setName('Microscopy Workbench');
 const profile=desktopPanelProfile(input);
 for(const name of ['userData','sessionData','crashDumps'] as const)app.setPath(name,profile);
 app.setAppLogsPath(profile);
 const {panelId,helperSessionId,generation,requestId}=input;
 if(!app.requestSingleInstanceLock({panelId,helperSessionId,generation,requestId})){app.exit(0);return;}
 // Do not await whenReady at Electron's ESM entry top level.
 const ready=app.whenReady().then(()=>createViewer(input));
 const pending=new Set<string>();
 async function activate(request:DesktopPanelIdentity,reused:boolean) {
  if(pending.has(request.requestId)||readDesktopPanelActivation(request))return;
  assertDesktopPanelIntent(request);
  pending.add(request.requestId);
  try{
   let result:DesktopPanelActivation;
   if(request.panelId!==panelId||request.helperSessionId!==helperSessionId||request.generation!==generation){
    result={status:'refused',reason:'stale_viewer'};
   }else{
    const viewer=await ready.catch(()=>null);
    const currentAddress=()=>{try{return desktopPanelAddress(request).url;}catch{return null;}};
    if(!viewer)result={status:'refused',reason:'viewer_start_failed'};
    else if(viewer.window.isDestroyed())result={status:'refused',reason:'viewer_closed'};
    else if(viewer.rendererGone())result={status:'refused',reason:'renderer_gone'};
    else if(currentAddress()!==viewer.address.url||!isOwnedDesktopDocument(viewer.window.webContents.getURL(),viewer.address))result={status:'refused',reason:'stale_viewer'};
    else result=await showDesktopPanelWindow(viewer.window,reused,viewer.rendererGone);
   }
   // A receipt failure after show/focus leaves the caller's outcome unknown.
   acknowledgeDesktopPanelActivation(request,result);
   if(!reused&&result.status==='refused'){
    const viewer=await ready.catch(()=>null);
    if(!viewer||viewer.window.isDestroyed()||!viewer.window.isVisible())app.exit(1);
   }
  }finally{pending.delete(request.requestId);}
 }
 app.on('second-instance',(_event,_argv,_cwd,data:unknown)=>{
  let request:DesktopPanelIdentity;
  try{request=desktopPanelIdentity(input.workspace,data);}catch{return;}
  if(request.panelId!==panelId)return;
  void activate(request,true).catch(()=>{});
 });
 app.on('window-all-closed',()=>{void ready.then(()=>app.quit(),()=>{});});
 void activate(input,false).catch(()=>{});
}

let admitted:DesktopPanelIdentity|undefined;
try{
 const input=readArguments(process.argv.slice(2));
 if(readDesktopPanelActivation(input))app.exit(0);
 else{
  assertDesktopPanelIntent(input);
  admitted=input;
  start(input);
 }
}catch{
 // The bounded receipt carries no capability, path or provider error text.
 if(admitted){try{acknowledgeDesktopPanelActivation(admitted,{status:'refused',reason:'viewer_start_failed'});}catch{/* The caller can only observe an unknown outcome. */}}
 app.exit(1);
}
