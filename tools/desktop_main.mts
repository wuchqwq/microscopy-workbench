import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {EventEmitter} from 'node:events';
import {DesktopBackendClient} from '../lib/desktop_backend_client.mjs';
import {DesktopCloseCoordinator} from '../lib/desktop_lifecycle.mjs';
import {desktopSecurityPreferences,isOwnedDesktopDocument,isRow,panelAddress,readDesktopOptions} from '../lib/desktop_contracts.mjs';
import type {DesktopOptions,DesktopAction,DesktopActionReply} from '../lib/desktop_contracts.mjs';

// A small structural port keeps the scientific Node 18 runtime independent of
// Electron's separately installed Node >=22 development dependency.
interface NativeEvent {preventDefault():void;url?:string;}
interface DesktopContents extends EventEmitter {
 id:number;mainFrame:unknown;getURL():string;send(channel:string,value:unknown):void;reloadIgnoringCache():void;
 setWindowOpenHandler(handler:()=>{action:'deny'}):void;
 session:{setPermissionRequestHandler:(handler:(contents:unknown,permission:unknown,callback:(allow:boolean)=>void)=>void)=>void;setPermissionCheckHandler:(handler:()=>boolean)=>void;};
}
interface DesktopWindow extends EventEmitter {
 webContents:DesktopContents;loadURL(url:string):Promise<void>;show():void;focus():void;destroy():void;isDestroyed():boolean;
}
interface MenuItem {label?:string;role?:string;accelerator?:string;type?:'separator';click?:()=>void;submenu?:MenuItem[];}
interface DesktopElectron {
 app:EventEmitter&{whenReady():Promise<void>;quit():void;setName(name:string):void;setPath(name:'userData',path:string):void;};
 BrowserWindow:new(options:unknown)=>DesktopWindow;
 Menu:{buildFromTemplate(items:MenuItem[]):unknown;setApplicationMenu(menu:unknown):void;};
 dialog:{showOpenDialog(options:unknown):Promise<{canceled:boolean;filePaths:string[]}>;showMessageBox(window:DesktopWindow|undefined,options:unknown):Promise<{response:number}>;showErrorBox(title:string,message:string):void;};
 ipcMain:EventEmitter;
}
const electronModule='electron',electron=await import(electronModule) as unknown as DesktopElectron;
const {app,BrowserWindow,Menu,dialog,ipcMain}=electron;
app.setName('Microscopy Workbench Prototype');
// Optional task-local profile for isolated validation; no system/global setting
// is changed and ordinary launches retain the application's own default profile.
if(process.env.MWB_DESKTOP_PROFILE){if(!path.isAbsolute(process.env.MWB_DESKTOP_PROFILE))throw new Error('MWB_DESKTOP_PROFILE must be absolute');mkdirSync(process.env.MWB_DESKTOP_PROFILE,{recursive:true});app.setPath('userData',process.env.MWB_DESKTOP_PROFILE);}
let options:DesktopOptions,window:DesktopWindow|undefined,backend:DesktopBackendClient|undefined,closing:DesktopCloseCoordinator|undefined,allowQuit=false,starting=false;
let address:ReturnType<typeof panelAddress>|undefined,nextAction=0;
const pendingActions=new Map<number,{resolve:(reply:DesktopActionReply)=>void;timer:ReturnType<typeof setTimeout>}>();
const report=async(message:string)=>{await dialog.showMessageBox(window,{type:'error',title:'Microscopy Workbench',message:'操作尚未完成',detail:message,buttons:['保持打开'],defaultId:0,cancelId:0});};
const trustedSender=(event:unknown):boolean=>{
 if(!isRow(event)||!window||window.isDestroyed()||!address||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return false;
 try{return isOwnedDesktopDocument(window.webContents.getURL(),address);}catch{return false;}
};
ipcMain.on('mwb:action-result',(event:unknown,value:unknown)=>{
 if(!trustedSender(event)||!isRow(value)||Object.keys(value).some(k=>!['id','ok','error'].includes(k))||!Number.isSafeInteger(value.id)||typeof value.ok!=='boolean'||value.error!==undefined&&(typeof value.error!=='string'||value.error.length>1024))return;
 const pending=pendingActions.get(value.id as number);if(!pending)return;pendingActions.delete(value.id as number);clearTimeout(pending.timer);pending.resolve({ok:value.ok,...(typeof value.error==='string'?{error:value.error}:{})});
});
function action(action:DesktopAction):Promise<DesktopActionReply>{
 if(!window||window.isDestroyed()||!address||!isOwnedDesktopDocument(window.webContents.getURL(),address))return Promise.resolve({ok:false,error:'界面未就绪；窗口与工作编辑保持。'});
 return new Promise(resolve=>{const id=++nextAction,timer=setTimeout(()=>{pendingActions.delete(id);resolve({ok:false,error:'界面响应尚未确认；窗口保持打开，不自动重复操作。'});},15000);pendingActions.set(id,{resolve,timer});window!.webContents.send('mwb:action',{id,action});});
}
function menuAction(name:DesktopAction):()=>void{return ()=>{void action(name).then(reply=>{if(!reply.ok)return report(reply.error??'操作未确认');}).catch(error=>report(String(error)));};}
const menus:MenuItem[]=[
 {label:'文件',submenu:[{label:'打开图像…',accelerator:'CmdOrCtrl+O',click:()=>{void replaceWorkspace(false);}},{label:'打开分析工作区…',accelerator:'CmdOrCtrl+Shift+O',click:()=>{void replaceWorkspace(true);}},{type:'separator'},{label:'保存分析工作区',accelerator:'CmdOrCtrl+S',click:menuAction('save')},{type:'separator'},{label:'退出',accelerator:'Alt+F4',click:()=>{void quitSafely();}}]},
 {label:'编辑',submenu:[{label:'撤销',accelerator:'CmdOrCtrl+Z',click:menuAction('undo')},{label:'重做',accelerator:'CmdOrCtrl+Shift+Z',click:menuAction('redo')},{type:'separator'},{label:'删除所选 ROI',click:menuAction('delete')},{role:'cut',label:'剪切文本'},{role:'copy',label:'复制文本'},{role:'paste',label:'粘贴文本'},{role:'selectAll',label:'全选文本'}]},
 {label:'分析',submenu:[{label:'选择 / 调整',click:menuAction('select')},{label:'绘制 ROI',click:menuAction('roi')},{label:'平移图像',click:menuAction('pan')},{type:'separator'},{label:'FFT',click:menuAction('fft')},{label:'测量',click:menuAction('measure')},{label:'返回空间观察',click:menuAction('return-spatial')}]},
 {label:'窗口',submenu:[{label:'平铺图像窗口',click:menuAction('tile')},{label:'探索执行历史',click:menuAction('history')},{role:'minimize',label:'最小化'},{role:'zoom',label:'最大化 / 还原'}]},
 {label:'帮助',submenu:[{label:'使用说明',accelerator:'F1',click:menuAction('help')},{label:'关于开发机试用版',click:()=>{void dialog.showMessageBox(window,{type:'info',title:'Microscopy Workbench',message:'Microscopy Workbench — 开发机试用版',detail:'MIT 开源软件。TypeScript 界面与既有科学服务共用记录。此版本仍需普通 Node 与指定 Python；尚未取得干净 Windows 安装或真实样品验收资格。',buttons:['关闭']});}}]}
];
async function selectFile(title:string,extensions?:string[]):Promise<string|undefined>{const reply=await dialog.showOpenDialog({title,properties:['openFile'],...(extensions?{filters:[{name:title,extensions}]}:{})});return reply.canceled?undefined:reply.filePaths[0];}
async function selectOptions(initial:DesktopOptions,forceNew=false):Promise<(DesktopOptions&{workspace:string;python:string})|undefined>{
 let workspace=initial.workspace,source=initial.source,python=initial.python;
 if(!workspace){const chosen=await dialog.showOpenDialog({title:forceNew?'选择新分析工作区目录':'选择分析工作区目录',properties:['openDirectory','createDirectory']});if(chosen.canceled)return;workspace=chosen.filePaths[0];}
 if(!workspace)return;
 if(forceNew||!existsSync(path.join(workspace,'researcher-inspector','session.json'))){source=source??await selectFile('打开只读原始图像',['tif','tiff','dm3','dm4']);if(!source)return;}
 if(!python){python=await selectFile('选择科研 Python 可执行文件',['exe']);if(!python)return;}
 // Validate native-dialog results through the same caller contract. No path is
 // interpolated into a shell, and selecting a source never overwrites it.
 const checked=readDesktopOptions(['--node',initial.node,'--workspace',workspace,'--python',python,...(source?['--source',source]:[])]);
 return {...initial,...checked,workspace,python};
}
async function startWorkspace(config:DesktopOptions&{workspace:string;python:string}):Promise<void>{
 if(starting)throw new Error('Workspace startup is already in progress');starting=true;
 try{
  backend=new DesktopBackendClient(config);const ready=await backend.ready;address=panelAddress(ready.url);
  const ownedBackend=backend;
  window=new BrowserWindow({title:'Microscopy Workbench',width:1440,height:980,minWidth:720,minHeight:560,show:false,backgroundColor:'#101923',webPreferences:{...desktopSecurityPreferences,preload:fileURLToPath(new URL('./desktop_preload.cjs',import.meta.url))}});
  const ownedWindow=window;
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-frame-navigate','will-redirect'])window.webContents.on(event,(e:NativeEvent,target?:string)=>{if(!address||!isOwnedDesktopDocument(e.url??target??'',address))e.preventDefault();});
  window.webContents.on('will-attach-webview',(e:NativeEvent)=>e.preventDefault());
  window.webContents.on('render-process-gone',()=>{void dialog.showMessageBox(ownedWindow,{type:'error',title:'界面进程中断',message:'科学工作区仍由本应用后台保留',detail:'尚未保存的工作状态保留。重新载入界面后核对原请求；不会自动重做计算或保存。',buttons:['重新载入界面','保持工作区打开'],defaultId:0,cancelId:1}).then(reply=>{if(reply.response===0&&!ownedWindow.isDestroyed())ownedWindow.webContents.reloadIgnoringCache();});});
  closing=new DesktopCloseCoordinator({action,status:()=>ownedBackend.status(),choose:async()=>{
   const reply=await dialog.showMessageBox(ownedWindow,{type:'question',title:'保存分析工作区',message:'分析工作区有未保存修改',detail:'保存整个分析工作区？不保存将恢复上次明确保存的版本；已经执行的科学记录仍保留。',buttons:['保存','不保存','取消'],defaultId:0,cancelId:2,noLink:true});return reply.response===0?'save':reply.response===1?'discard':'cancel';
  },discard:revision=>ownedBackend.discard(revision),close:revision=>ownedBackend.close(revision),error:report});
  window.on('close',(event:NativeEvent)=>{if(allowQuit)return;event.preventDefault();void quitSafely();});
  window.once('ready-to-show',()=>ownedWindow.show());
  await window.loadURL(address.url);ownedWindow.show();ownedWindow.focus();options=config;
  process.stdout.write('Microscopy Workbench desktop ready (owned ordinary Node backend '+ready.node+').\n');
 }catch(error){
  const failedWindow=window,failedBackend=backend;window=undefined;closing=undefined;address=undefined;failedWindow?.destroy();
  try{await failedBackend?.abnormalDrain();backend=undefined;}catch(drainError){throw new AggregateError([error,drainError],'Desktop startup failed; owned backend is still draining its original requests.');}
  throw error;
 }finally{starting=false;}
}
async function closeWorkspace():Promise<boolean>{
 if(!closing)return !starting;
 if(!await closing.request())return false;
 const oldWindow=window;window=undefined;backend=undefined;closing=undefined;address=undefined;
 for(const pending of pendingActions.values()){clearTimeout(pending.timer);pending.resolve({ok:false,error:'工作区已关闭'});}pendingActions.clear();
 oldWindow?.destroy();return true;
}
async function quitSafely():Promise<void>{if(await closeWorkspace()){allowQuit=true;app.quit();}}
async function replaceWorkspace(existing:boolean):Promise<void>{
 try{
  // Keep the current document alive while selecting paths. Cancel has no effect.
  const selected=await selectOptions({node:options.node,python:options.python},!existing);if(!selected)return;
  if(!await closeWorkspace())return;await startWorkspace(selected);
 }catch(error){await report(error instanceof Error?error.message:String(error));}
}
app.on('before-quit',(event:NativeEvent)=>{if(!allowQuit){event.preventDefault();void quitSafely();}});
app.on('window-all-closed',()=>{if(allowQuit)app.quit();});
process.on('SIGINT',()=>{void quitSafely();});process.on('SIGTERM',()=>{void quitSafely();});
const startupFailed=(error:unknown)=>{backend?.abnormalDetach();dialog.showErrorBox('Microscopy Workbench 启动失败',error instanceof Error?error.message:String(error));allowQuit=true;app.quit();};
try{
 options=readDesktopOptions(process.argv.slice(2));
 // Electron waits for the ESM entry to finish before emitting ready. Awaiting
 // whenReady at top level deadlocks this entry; schedule the lifecycle instead.
 void app.whenReady().then(async()=>{
  Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
  const selected=await selectOptions(options);if(selected)await startWorkspace(selected);else{allowQuit=true;app.quit();}
 }).catch(startupFailed);
}catch(error){startupFailed(error);}
