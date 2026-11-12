import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {EventEmitter} from 'node:events';
import {DesktopBackendClient} from '../lib/desktop_backend_client.mjs';
import {DesktopCloseCoordinator} from '../lib/desktop_lifecycle.mjs';
import {exitWithRecovery} from '../lib/desktop_recovery_exit.mjs';
import {desktopSecurityPreferences,isOwnedDesktopDocument,isRow,panelAddress,readDesktopOptions,desktopStartupError,readDesktopJointReviewRequest} from '../lib/desktop_contracts.mjs';
import type {DesktopOptions,DesktopAction,DesktopActionReply,DesktopJointReviewRequest} from '../lib/desktop_contracts.mjs';
import {runSyntheticHostDemo} from '../lib/research_host_demo.mjs';
import {SYNTHETIC_HOST_NOTICE} from '../lib/research_host.mjs';

// A small structural port keeps the scientific Node 22/24 runtime independent
// of Electron's separately installed development dependency.
interface NativeEvent {preventDefault():void;url?:string;}
interface DesktopContents extends EventEmitter {
 id:number;mainFrame:unknown;getURL():string;send(channel:string,value:unknown):void;reloadIgnoringCache():void;
 setWindowOpenHandler(handler:()=>{action:'deny'}):void;
 session:{setPermissionRequestHandler:(handler:(contents:unknown,permission:unknown,callback:(allow:boolean)=>void)=>void)=>void;setPermissionCheckHandler:(handler:()=>boolean)=>void;};
}
interface DesktopWindow extends EventEmitter {
 webContents:DesktopContents;loadURL(url:string):Promise<void>;show():void;focus():void;setEnabled(enabled:boolean):void;destroy():void;isDestroyed():boolean;
}
interface MenuItem {enabled?:boolean;label?:string;role?:string;accelerator?:string;type?:'separator';click?:()=>void;submenu?:MenuItem[];}
interface DesktopElectron {
 app:EventEmitter&{whenReady():Promise<void>;quit():void;exit(code:number):void;setName(name:string):void;setPath(name:'userData'|'sessionData'|'crashDumps',path:string):void;setAppLogsPath(path:string):void;};
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
if(process.env.MWB_DESKTOP_PROFILE){const profile=process.env.MWB_DESKTOP_PROFILE;if(!path.isAbsolute(profile))throw new Error('MWB_DESKTOP_PROFILE must be absolute');mkdirSync(profile,{recursive:true});app.setPath('userData',profile);for(const name of ['sessionData','crashDumps'] as const){const directory=path.join(profile,name);mkdirSync(directory,{recursive:true});app.setPath(name,directory);}const logs=path.join(profile,'logs');mkdirSync(logs,{recursive:true});app.setAppLogsPath(logs);}
let options:DesktopOptions,window:DesktopWindow|undefined,backend:DesktopBackendClient|undefined,closing:DesktopCloseCoordinator|undefined,allowQuit=false,starting=false,nativeClosing=false,replacing=false,jointReviewBusy=false;
let address:ReturnType<typeof panelAddress>|undefined,nextAction=0;
let nativeReviewDecision:((reviewed:'record'|false)=>void)|null=null;
const pendingActions=new Map<number,{resolve:(reply:DesktopActionReply)=>void;timer:ReturnType<typeof setTimeout>}>();
const report=async(message:string)=>{const owned=window;if(nativeClosing&&owned&&!owned.isDestroyed())owned.setEnabled(true);try{await dialog.showMessageBox(owned,{type:'error',title:'Microscopy Workbench',message:'操作尚未完成',detail:message,buttons:['关闭提示'],defaultId:0,cancelId:0,noLink:true});}finally{if(nativeClosing&&owned&&!owned.isDestroyed())owned.setEnabled(false);}};
const trustedSender=(event:unknown):boolean=>{
 if(!isRow(event)||!window||window.isDestroyed()||!address||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return false;
 try{return isOwnedDesktopDocument(window.webContents.getURL(),address);}catch{return false;}
};
ipcMain.on('mwb:action-result',(event:unknown,value:unknown)=>{
 if(!trustedSender(event)||!isRow(value)||Object.keys(value).some(k=>!['id','ok','error','working_revision'].includes(k))||!Number.isSafeInteger(value.id)||typeof value.ok!=='boolean'||value.error!==undefined&&(typeof value.error!=='string'||value.error.length>1024)||value.working_revision!==undefined&&(!Number.isSafeInteger(value.working_revision)||(value.working_revision as number)<0))return;
 const pending=pendingActions.get(value.id as number);if(!pending)return;pendingActions.delete(value.id as number);clearTimeout(pending.timer);pending.resolve({ok:value.ok,...(typeof value.error==='string'?{error:value.error}:{}),...(value.working_revision!==undefined?{working_revision:value.working_revision as number}:{})});
});
ipcMain.on('mwb:open-image',(event:unknown,...args:unknown[])=>{
 if(!trustedSender(event)||args.length||nativeClosing||starting)return;
 void replaceWorkspace(false);
});
ipcMain.on('mwb:review-image',(event:unknown,...args:unknown[])=>{if(!trustedSender(event)||args.length>1||nativeClosing||starting||replacing||jointReviewBusy)return;let request:DesktopJointReviewRequest;try{request=readDesktopJointReviewRequest(args[0]??{});}catch{return;}void reviewImageScope(request);});
ipcMain.on('mwb:query-image-review',(event:unknown,...args:unknown[])=>{
 if(!trustedSender(event)||args.length||nativeClosing||starting||replacing||jointReviewBusy||!backend)return;
 const owned=backend;void(async()=>{try{const snapshot=await owned.queryJointReview();if(!isRow(snapshot)||!Array.isArray(snapshot.unresolved_request_ids)||snapshot.unresolved_request_ids.length>16||!snapshot.unresolved_request_ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=128))throw Error('原请求清单尚未核对；不派发新计算。');for(const id of snapshot.unresolved_request_ids)await owned.queryJointOriginal(id);}catch(error){await report(String(error));}})();
});
ipcMain.on('mwb:stop-image-review',(event:unknown,...args:unknown[])=>{
 if(!trustedSender(event)||args.length||nativeClosing||starting||replacing||jointReviewBusy||!backend)return;
 const owned=backend;void (async()=>{try{const status=await owned.queryJointReview() as {status?:string;review_id?:string};if(status.status==='reviewing'&&status.review_id)await owned.cancelJointReview(status.review_id);else if(['starting','running','stopping','unknown'].includes(status.status??''))await owned.interruptJointReview();}catch(error){await report(String(error));}})();
});
async function reviewImageScope(request:DesktopJointReviewRequest={}){
 const ownedWindow=window,ownedBackend=backend,ownedAddress=address;if(!ownedWindow||!ownedBackend||!ownedAddress)return;jointReviewBusy=true;let preview:DesktopWindow|undefined,receipt:{review_id:string;context_sha256:string;review_path:string;public_send_available?:boolean}|undefined,settled=false;
 try{
  const ready=await action('prepare-joint-review');if(!ready.ok||!Number.isSafeInteger(ready.working_revision))throw Error(ready.error??'先处理图像与问题的未同步输入。');
  if(window!==ownedWindow||backend!==ownedBackend||ownedWindow.isDestroyed())throw Error('Owned workspace changed');
  receipt=request.correction?await ownedBackend.beginJointCorrection(ready.working_revision!,request.correction.text,request.correction.original_thread_id,request.correction.original_turn_id,request.selection):await ownedBackend.beginJointReview(ready.working_revision!,request.selection);const url=ownedAddress.origin+receipt.review_path;
  ownedWindow.setEnabled(false);preview=new BrowserWindow({title:'本次图像与工具范围 · 仅本地',width:1100,height:850,show:false,webPreferences:{...desktopSecurityPreferences,javascript:false}});
  preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.webContents.session.setPermissionRequestHandler((_c,_p,reply)=>reply(false));preview.webContents.session.setPermissionCheckHandler(()=>false);
  preview.webContents.on('will-navigate',(event:NativeEvent,target:string)=>{if(target!==url)event.preventDefault();});
  const inspected=new Promise<'record'|false>(resolve=>{nativeReviewDecision=reviewed=>{nativeReviewDecision=null;resolve(reviewed);};});
  preview.on('close',()=>nativeReviewDecision?.(false));
  await preview.loadURL(url);preview.show();
  const intent=await inspected;
  const decision=intent&&!preview.isDestroyed()?await dialog.showMessageBox(preview,{type:'question',title:'核对本次范围 · 不发送',message:'请查看本次准确保存图、问题、源坐标与所选证据',detail:'本次只记录你核对了预览内容，不会启动模型回合。本地预览与核对可用；真实模型发送在此候选停用、未验收。关闭预览即取消本次核对，保留原历史。',buttons:['已核对本次范围（不发送）','取消'],defaultId:1,cancelId:1}):{response:1};
  if(!settled){settled=true;if(decision.response===0&&!preview.isDestroyed())await ownedBackend.recordJointReview(receipt.review_id,receipt.context_sha256);else await ownedBackend.cancelJointReview(receipt.review_id);}

 }catch(error){if(receipt&&!settled){settled=true;try{await ownedBackend.cancelJointReview(receipt.review_id);}catch{/* Query the original owner status; never repeat the preparation or confirmation. */}}await report(error instanceof Error?error.message:String(error));}
 finally{nativeReviewDecision=null;preview?.destroy();if(!ownedWindow.isDestroyed()){if(window===ownedWindow&&backend===ownedBackend)await action('finish-joint-review');ownedWindow.setEnabled(true);ownedWindow.focus();}jointReviewBusy=false;}
}
function action(action:DesktopAction,closeFlow=false):Promise<DesktopActionReply>{
 if(nativeClosing&&!closeFlow)return Promise.resolve({ok:false,error:'正在核对退出操作；当前不接收新编辑或窗口操作。'});
 if(!window||window.isDestroyed()||!address||!isOwnedDesktopDocument(window.webContents.getURL(),address))return Promise.resolve({ok:false,error:'界面未就绪；窗口与工作编辑保持。'});
 return new Promise(resolve=>{const id=++nextAction,timer=setTimeout(()=>{pendingActions.delete(id);resolve({ok:false,error:'界面响应尚未确认；窗口保持打开，不自动重复操作。'});},15000);pendingActions.set(id,{resolve,timer});window!.webContents.send('mwb:action',{id,action});});
}
function menuAction(name:DesktopAction):()=>void{return ()=>{if(nativeClosing)return;void action(name).then(reply=>{if(!reply.ok)return report(reply.error??'操作未确认');}).catch(error=>report(String(error)));};}
let hostDemoBusy=false;
async function showSyntheticHostDemo(){
 if(nativeClosing||starting||hostDemoBusy||!options)return;hostDemoBusy=true;
 try{await runSyntheticHostDemo(options.node);if(!nativeClosing)await dialog.showMessageBox(window,{type:'info',title:'宿主适配 · 合成测试',message:SYNTHETIC_HOST_NOTICE,detail:'合成会话完成、接续后中断，并已关闭。权限请求未被执行；没有读取当前工作区、运行科学计算或接纳候选。',buttons:['关闭']});}
 catch(error){if(!nativeClosing)await report('合成宿主测试未完成；真实 Codex 尚未连接。'+String(error));}finally{hostDemoBusy=false;}
}
const menus:MenuItem[]=[
 {label:'文件',submenu:[{label:'打开图像…',accelerator:'CmdOrCtrl+O',click:()=>{void replaceWorkspace(false);}},{label:'打开分析工作区…',accelerator:'CmdOrCtrl+Shift+O',click:()=>{void replaceWorkspace(true);}},{type:'separator'},{label:'保存分析工作区',accelerator:'CmdOrCtrl+S',click:menuAction('save')},{type:'separator'},{label:'查看本次退出进度',click:()=>{void checkCloseProgress();}},{label:'保留恢复记录并退出…',click:()=>{void quitPreservingRecovery();}},{label:'退出',accelerator:process.platform==='darwin'?'Cmd+Q':'Alt+F4',click:()=>{void quitSafely();}}]},
 {label:'编辑',submenu:[{label:'撤销',accelerator:'CmdOrCtrl+Z',click:menuAction('undo')},{label:'重做',accelerator:'CmdOrCtrl+Shift+Z',click:menuAction('redo')},{type:'separator'},{label:'删除所选 ROI',click:menuAction('delete')},{role:'cut',label:'剪切文本'},{role:'copy',label:'复制文本'},{role:'paste',label:'粘贴文本'},{role:'selectAll',label:'全选文本'}]},
 {label:'分析',submenu:[{label:'预览本次图像与工具范围…',click:()=>{if(!nativeClosing&&!starting&&!replacing&&!jointReviewBusy)void reviewImageScope();}},{label:'记录已核对本次范围（不发送）',click:()=>nativeReviewDecision?.('record')},{label:'真实模型发送停用（此候选未验收）',enabled:false},{label:'取消本次范围预览',click:()=>nativeReviewDecision?.(false)},{type:'separator'},{label:'选择 / 调整',click:menuAction('select')},{label:'绘制 ROI',click:menuAction('roi')},{label:'平移图像',click:menuAction('pan')},{type:'separator'},{label:'FFT',click:menuAction('fft')},{label:'测量',click:menuAction('measure')},{label:'返回空间观察',click:menuAction('return-spatial')}]},
 {label:'窗口',submenu:[{label:'平铺图像窗口',click:menuAction('tile')},{label:'探索执行历史',click:menuAction('history')},{role:'minimize',label:'最小化'},{role:'zoom',label:'最大化 / 还原'}]},
 {label:'帮助',submenu:[{label:'使用说明',accelerator:'F1',click:menuAction('help')},{label:'宿主适配（合成测试；非 AI）',click:()=>{void showSyntheticHostDemo();}},{label:'关于内部研究试用版',click:()=>{void dialog.showMessageBox(window,{type:'info',title:'Microscopy Workbench',message:'Microscopy Workbench — 内部研究试用版',detail:'Mac arm64 本地包，自带 Node/Python。原生入口：有限灰度 TIFF；DM3/DM4 解码器未随包提供。模拟数据只验证软件行为；物相、缺陷与仪器精度未认证。本地预览与核对可用；真实模型发送在此候选停用、未验收。内部试用，未公证或公开发布。',buttons:['关闭']});}}]}
];
async function selectFile(title:string,extensions?:string[]):Promise<string|undefined>{const reply=await dialog.showOpenDialog({title,properties:['openFile'],...(extensions?{filters:[{name:title,extensions}]}:{})});return reply.canceled?undefined:reply.filePaths[0];}
async function selectOptions(initial:DesktopOptions,forceNew=false):Promise<(DesktopOptions&{workspace:string;python:string})|undefined>{
 let workspace=initial.workspace,source=initial.source,python=initial.python;
 if(forceNew){source=source??await selectFile('打开只读原始图像',['tif','tiff']);if(!source)return;}
 if(!workspace){const chosen=await dialog.showOpenDialog({title:forceNew?'选择分析结果的工作区目录':'选择分析工作区目录',properties:['openDirectory','createDirectory']});if(chosen.canceled)return;workspace=chosen.filePaths[0];}
 if(!workspace)return;
 if(forceNew||!existsSync(path.join(workspace,'researcher-inspector','session.json'))){source=source??await selectFile('打开只读原始图像',['tif','tiff']);if(!source)return;}
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
  window=new BrowserWindow({title:'Microscopy Workbench',width:1440,height:980,minWidth:720,minHeight:560,show:false,backgroundColor:'#171817',webPreferences:{...desktopSecurityPreferences,preload:fileURLToPath(new URL('./desktop_preload.cjs',import.meta.url))}});
  const ownedWindow=window;
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-frame-navigate','will-redirect'])window.webContents.on(event,(e:NativeEvent,target?:string)=>{if(!address||!isOwnedDesktopDocument(e.url??target??'',address))e.preventDefault();});
  window.webContents.on('will-attach-webview',(e:NativeEvent)=>e.preventDefault());
  window.webContents.on('render-process-gone',()=>{void dialog.showMessageBox(ownedWindow,{type:'error',title:'界面进程中断',message:'科学工作区仍由本应用后台保留',detail:'尚未保存的工作状态保留。重新载入界面后核对原请求；不会自动重做计算或保存。',buttons:['重新载入界面','保持工作区打开'],defaultId:0,cancelId:1}).then(reply=>{if(reply.response===0&&!ownedWindow.isDestroyed())ownedWindow.webContents.reloadIgnoringCache();});});
  closing=new DesktopCloseCoordinator({action:name=>action(name,true),freezeInput:frozen=>{nativeClosing=frozen;if(!ownedWindow.isDestroyed())ownedWindow.setEnabled(!frozen);},status:()=>ownedBackend.status(),queryDiscard:()=>ownedBackend.queryDiscard(),resumeClose:()=>ownedBackend.resumeClose(),acknowledgeDiscard:operation=>ownedBackend.acknowledgeDiscard(operation.command_id,operation.expected_working_revision),choose:async()=>{
   // A disabled NSWindow cannot reliably show/operate its macOS save sheet.
  // The modal sheet blocks its parent; nativeClosing still fences every intent.
  if(nativeClosing&&!ownedWindow.isDestroyed())ownedWindow.setEnabled(true);
  const reply=await dialog.showMessageBox(ownedWindow,{type:'question',title:'保存分析工作区',message:'分析工作区有未保存修改',detail:'保存整个分析工作区？不保存将恢复上次明确保存的版本；已经执行的科学记录仍保留。',buttons:['保存','不保存','取消'],defaultId:0,cancelId:2,noLink:true});if(nativeClosing&&!ownedWindow.isDestroyed())ownedWindow.setEnabled(false);return reply.response===0?'save':reply.response===1?'discard':'cancel';
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
async function checkCloseProgress():Promise<void>{
 if(nativeClosing||starting||replacing||jointReviewBusy||!backend)return;
 if(!backend.hasCloseIntent()){await dialog.showMessageBox(window,{type:'info',title:'退出进度',message:'当前没有等待确认的退出。',detail:'正常关闭会先检查保存状态；有未保存更改时可选择保存、不保存或取消。',buttons:['关闭提示'],defaultId:0,cancelId:0});return;}
 await quitSafely();
}
async function closeWorkspace():Promise<boolean>{
 if(!closing)return !starting;
 if(!await closing.request())return false;
 const oldWindow=window;window=undefined;backend=undefined;closing=undefined;address=undefined;
 for(const pending of pendingActions.values()){clearTimeout(pending.timer);pending.resolve({ok:false,error:'工作区已关闭'});}pendingActions.clear();
 oldWindow?.destroy();return true;
}
async function quitSafely():Promise<void>{if(jointReviewBusy||nativeClosing)return;if(await closeWorkspace()){allowQuit=true;app.quit();}}
async function quitPreservingRecovery():Promise<void>{
 if(nativeClosing||starting||replacing||jointReviewBusy||!window||!backend)return;
 const ownedWindow=window,ownedBackend=backend;
 await exitWithRecovery({
  freeze:frozen=>{nativeClosing=frozen;if(!ownedWindow.isDestroyed())ownedWindow.setEnabled(!frozen);},
  confirm:async()=>{if(!ownedWindow.isDestroyed())ownedWindow.setEnabled(true);const reply=await dialog.showMessageBox(ownedWindow,{type:'warning',title:'保留恢复记录并退出',message:'停止本应用后台并保留已写入的恢复记录？',detail:'这不是保存成功。已写入的分析、原请求和恢复记录保留；未应用且尚未写入的输入可能丢失。等待本应用后台排空后退出，不强制结束进程。重开后先核对原请求，不重复计算。只用于正常退出被未决状态阻止时。',buttons:['保留记录并退出','继续打开'],defaultId:1,cancelId:1,noLink:true});if(!ownedWindow.isDestroyed())ownedWindow.setEnabled(false);return reply.response===0;},
  owned:()=>window===ownedWindow&&backend===ownedBackend&&!ownedWindow.isDestroyed(),
  drain:()=>ownedBackend.abnormalDrain(),
  exit:()=>{allowQuit=true;window=undefined;backend=undefined;closing=undefined;address=undefined;for(const pending of pendingActions.values()){clearTimeout(pending.timer);pending.resolve({ok:false,error:'已保留恢复记录并退出；不表示保存或科学成功'});}pendingActions.clear();ownedWindow.destroy();app.quit();},
  error:report
 });
}

async function replaceWorkspace(existing:boolean):Promise<void>{
 if(nativeClosing||starting||replacing||jointReviewBusy||!options||!window)return;
 const originalWindow=window;replacing=true;
 try{
  // Keep the current document alive while selecting paths. Cancel has no effect.
  const selected=await selectOptions({node:options.node,python:options.python},!existing);if(!selected||window!==originalWindow||originalWindow.isDestroyed()||nativeClosing||starting)return;
  if(!await closeWorkspace())return;await startWorkspace(selected);
 }catch(error){await report(error instanceof Error?error.message:String(error));}finally{replacing=false;}
}
app.on('before-quit',(event:NativeEvent)=>{if(!allowQuit){event.preventDefault();void quitSafely();}});
app.on('window-all-closed',()=>{if(allowQuit)app.quit();});
process.on('SIGINT',()=>{void quitSafely();});process.on('SIGTERM',()=>{void quitSafely();});
const startupFailed=(error:unknown)=>{backend?.abnormalDetach();const failure=desktopStartupError(error);dialog.showErrorBox('Microscopy Workbench 启动失败',failure.code+'\n'+failure.message);allowQuit=true;app.exit(1);};
try{
 options=readDesktopOptions(process.argv.slice(2));
 // Electron waits for the ESM entry to finish before emitting ready. Awaiting
 // whenReady at top level deadlocks this entry; schedule the lifecycle instead.
 void app.whenReady().then(async()=>{
  Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
  const selected=await selectOptions(options);if(selected)await startWorkspace(selected);else{allowQuit=true;app.quit();}
 }).catch(startupFailed);
}catch(error){startupFailed(error);}
