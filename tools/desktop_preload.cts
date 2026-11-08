// Sandboxed Electron preload must be CommonJS; this checked TypeScript is
// emitted to .cjs by the same formal tsc build as the rest of the application.
interface DesktopPreloadEvent {sender:unknown;}
interface DesktopPreloadReply {ok:boolean;error?:string;working_revision?:number;}
type DesktopPreloadAction='prepare-close'|'inspect-close-state'|'prepare-joint-review'|'finish-joint-review'|'save'|'undo'|'redo'|'delete'|'roi'|'select'|'pan'|'fft'|'measure'|'return-spatial'|'tile'|'history'|'help';
interface DesktopPreloadElectron {contextBridge:{exposeInMainWorld:(name:string,value:unknown)=>void};ipcRenderer:{on:(name:string,callback:(event:DesktopPreloadEvent,message:unknown)=>void)=>void;send:(name:string,message?:unknown)=>void;};}
const desktopPreloadElectron=require('electron') as DesktopPreloadElectron;
const desktopPreloadActions=new Set(['prepare-close','inspect-close-state','prepare-joint-review','finish-joint-review','save','undo','redo','delete','roi','select','pan','fft','measure','return-spatial','tile','history','help']);
let desktopPreloadHandler:((action:DesktopPreloadAction)=>Promise<DesktopPreloadReply>)|null=null;
desktopPreloadElectron.contextBridge.exposeInMainWorld('workbenchDesktop',Object.freeze({
 // No path or generic IPC arguments cross this boundary. The native picker
 // and existing guarded workspace replacement own all subsequent decisions.
 openImage():void{desktopPreloadElectron.ipcRenderer.send('mwb:open-image');},
 reviewImage():void{desktopPreloadElectron.ipcRenderer.send('mwb:review-image');},
 stopImageReview():void{desktopPreloadElectron.ipcRenderer.send('mwb:stop-image-review');},
 onAction(callback:(action:DesktopPreloadAction)=>Promise<DesktopPreloadReply>):void{
  if(typeof callback!=='function'||desktopPreloadHandler)throw new Error('Desktop action handler must be registered once');desktopPreloadHandler=callback;
 }
}));
desktopPreloadElectron.ipcRenderer.on('mwb:action',(_event,message)=>{
 if(!message||typeof message!=='object'||Array.isArray(message))return;const row=message as Record<string,unknown>;
 if(Object.keys(row).some(k=>!['id','action'].includes(k))||!Number.isSafeInteger(row.id)||(row.id as number)<1||typeof row.action!=='string'||!desktopPreloadActions.has(row.action))return;
 void (async()=>{
  let reply:DesktopPreloadReply;
  try{reply=desktopPreloadHandler?await desktopPreloadHandler(row.action as DesktopPreloadAction):{ok:false,error:'界面尚未准备好，窗口保持打开。'};}catch(error){reply={ok:false,error:error instanceof Error?error.message:String(error)};}
  desktopPreloadElectron.ipcRenderer.send('mwb:action-result',{id:row.id,ok:reply?.ok===true,...(typeof reply?.error==='string'?{error:reply.error.slice(0,1024)}:{}),...(Number.isSafeInteger(reply?.working_revision)&&reply.working_revision!>=0?{working_revision:reply.working_revision}:{})});
 })();
});
