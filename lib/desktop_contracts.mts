// Desktop ports intentionally do not add Electron to the core Node runtime.
import path from 'node:path';
import {existsSync,realpathSync,statSync} from 'node:fs';

export const DESKTOP_ACTIONS=['prepare-close','save','undo','redo','delete','roi','select','pan','fft','measure','return-spatial','tile','history','help'] as const;
export type DesktopAction=typeof DESKTOP_ACTIONS[number];
export interface DesktopActionReply {ok:boolean;error?:string;}
export interface DesktopOptions {node:string;workspace?:string;python?:string;source?:string;frame?:number;dataset?:number;component?:string;plane_axes?:number[];plane_indices?:(number|null)[];}
export interface DesktopWorkspaceStatus {status:string;dirty:boolean;working_revision:number;can_close:boolean;unresolved_request_id:string|null;recovery_available:boolean;}
export const DESKTOP_HELP='Microscopy Workbench — Windows desktop prototype\nUsage: npm run desktop -- [--workspace ABS_DIRECTORY] [--source ABS_TIFF_OR_DM3_OR_DM4] [--python ABS_PYTHON] [--frame 1] [--dataset 1]\nWithout a workspace, native file dialogs select a workspace, source and Python. The launcher uses its own ordinary Node executable for scientific helpers. Install the separately locked desktop runtime with npm run desktop:install after npm ci and npm run build. This is a development-machine prototype, not a clean-Windows installer.';
export const isRow=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export function desktopAction(v:unknown):DesktopAction|null{return typeof v==='string'&&(DESKTOP_ACTIONS as readonly string[]).includes(v)?v as DesktopAction:null;}
export function requireExecutable(file:string,label:string):string {
 if(!path.isAbsolute(file)||!existsSync(file)||!statSync(file).isFile())throw new Error(label+' must be an explicit existing absolute executable path');
 return realpathSync.native(file);
}
export function readDesktopOptions(argv:readonly string[],defaultNode?:string):DesktopOptions {
 const parsed:Record<string,unknown>={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!['--node','--workspace','--python','--source','--frame','--dataset','--component','--plane-axes','--plane-indices'].includes(key)||!value||Object.hasOwn(parsed,key.slice(2)))throw new Error(DESKTOP_HELP);parsed[key.slice(2)]=value;}
 const node=requireExecutable(String(parsed.node??defaultNode??''),'Node');
 for(const key of ['workspace','python','source'])if(parsed[key]!==undefined&&!path.isAbsolute(String(parsed[key])))throw new Error(key+' must be absolute');
 for(const key of ['source','python'])if(parsed[key]!==undefined&&(!existsSync(String(parsed[key]))||!statSync(String(parsed[key])).isFile()))throw new Error(key+' file does not exist');
 if(parsed.source!==undefined&&!['.tif','.tiff','.dm3','.dm4'].includes(path.extname(String(parsed.source)).toLowerCase()))throw new Error('Source must be a supported TIFF, DM3 or DM4 file');
 for(const key of ['frame','dataset'])if(parsed[key]!==undefined&&(!/^[1-9][0-9]*$/.test(String(parsed[key]))||!Number.isSafeInteger(Number(parsed[key]))))throw new Error(key+' starts at 1');
 if(parsed.dataset!==undefined&&Number(parsed.dataset)>64)throw new Error('Dataset exceeds 64');
 if(parsed.component!==undefined&&!['real','imag','amplitude','power'].includes(String(parsed.component)))throw new Error('Invalid complex component');
 if((parsed['plane-axes']===undefined)!==(parsed['plane-indices']===undefined))throw new Error('Supply both plane selectors');
 let plane_axes:number[]|undefined,plane_indices:(number|null)[]|undefined;
 if(parsed['plane-axes']!==undefined){if(!/^[0-5],[0-5]$/.test(String(parsed['plane-axes']))||!/^(?:[0-9]+|\*)(?:,(?:[0-9]+|\*)){1,5}$/.test(String(parsed['plane-indices'])))throw new Error('Invalid plane selectors');plane_axes=String(parsed['plane-axes']).split(',').map(Number);plane_indices=String(parsed['plane-indices']).split(',').map(v=>v==='*'?null:Number(v));if(plane_axes[0]===plane_axes[1]||plane_axes.some(v=>v>=plane_indices!.length)||plane_indices.some((v,i)=>plane_axes!.includes(i)?v!==null:!Number.isSafeInteger(v)||v!<0))throw new Error('Invalid plane selectors');}
 return {node,...(parsed.workspace?{workspace:String(parsed.workspace)}:{}),...(parsed.python?{python:String(parsed.python)}:{}),...(parsed.source?{source:String(parsed.source)}:{}),...(parsed.frame?{frame:Number(parsed.frame)}:{}),...(parsed.dataset?{dataset:Number(parsed.dataset)}:{}),...(parsed.component?{component:String(parsed.component)}:{}),...(plane_axes?{plane_axes,plane_indices}:{})};
}
export function researcherArguments(options:DesktopOptions&{workspace:string;python:string}):string[]{
 return ['--workspace',options.workspace,'--python',options.python,...(options.source?['--source',options.source]:[]),...(options.frame?['--frame',String(options.frame)]:[]),...(options.dataset?['--dataset',String(options.dataset)]:[]),...(options.component?['--component',options.component]:[]),...(options.plane_axes?['--plane-axes',options.plane_axes.join(','),'--plane-indices',options.plane_indices!.map(v=>v===null?'*':v).join(',')]:[])];
}
export function panelAddress(value:unknown):{url:string;origin:string;token:string}{
 if(typeof value!=='string')throw new Error('Invalid owned panel URL');const url=new URL(value);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.username||url.password||!/^#[a-f0-9]{48}$/.test(url.hash))throw new Error('Only the exact owned loopback panel URL is allowed');
 return {url:url.href,origin:url.origin,token:url.hash.slice(1)};
}
export function isOwnedDesktopDocument(value:string,address:{url:string;origin:string}):boolean {
 // The existing renderer moves its capability fragment into sessionStorage
 // and replaces history with '/'. Both exact spellings belong to this window.
 return value===address.url||value===address.origin+'/';
}
export function readWorkspaceStatus(value:unknown):DesktopWorkspaceStatus {
 if(!isRow(value)||!isRow(value.workspace_analysis))throw new Error('Workspace save contract unavailable; desktop refuses an unsafe close');const state=value.workspace_analysis;
 if(state.schema_version!==1||!['new','legacy','clean','dirty','saving','save_unknown','recovery_available'].includes(String(state.status))||typeof state.dirty!=='boolean'||!Number.isSafeInteger(state.working_revision)||(state.working_revision as number)<0||typeof state.can_close!=='boolean'||typeof state.recovery_available!=='boolean'||state.unresolved_request_id!==null&&typeof state.unresolved_request_id!=='string')throw new Error('Invalid authoritative workspace status');
 return state as unknown as DesktopWorkspaceStatus;
}
export function closeBlocked(state:DesktopWorkspaceStatus):boolean{return state.unresolved_request_id!==null||['saving','save_unknown'].includes(state.status);}
export const desktopSecurityPreferences={sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false} as const;

// Startup IPC carries only fixed diagnostics. Never send arbitrary provider
// error text, capability URLs, image bytes or source paths through this port.
const desktopStartupMessages={
 PANEL_CLAIM_RETAINED:'未发布或不匹配的工作区启动占用记录已保留。请核对原启动记录；本应用不会自动解锁或重放计算。',
 PREVIOUS_HELPER_RUNNING:'先前工作区后台仍在运行，已拒绝重复启动。请返回原窗口或核对原后台状态。',
 RECOVERY_CONFLICT:'检测到不同的未保存工作状态和恢复副本，原件均已保留。请核对恢复记录后再打开工作区。',
 STARTUP_FAILED:'工作台启动未完成。原工作区和执行记录保留；请核对启动参数与原记录，不会自动重试。'
} as const;
export type DesktopStartupErrorCode=keyof typeof desktopStartupMessages;
export interface DesktopStartupError {type:'startup_error';schema_version:1;code:DesktopStartupErrorCode;message:string;}
export function desktopStartupError(error:unknown):DesktopStartupError {
 const value=error&&typeof error==='object'?error as {code?:unknown;message?:unknown}:{},message=typeof value.message==='string'?value.message:'';let code:DesktopStartupErrorCode='STARTUP_FAILED';
 if(typeof value.code==='string'&&Object.hasOwn(desktopStartupMessages,value.code))code=value.code as DesktopStartupErrorCode;
 else if(value.code==='EEXIST'&&['EEXIST: an unlaunched helper claim is retained; no published stopped helper can qualify it','EEXIST: unpublished or foreign helper claim retained without replacement'].includes(message)||message==='Published helper claim does not match its original exact registration; retained')code='PANEL_CLAIM_RETAINED';
 else if(message==='Previous owned helper PID is still present; no replacement or duplicate launch is permitted')code='PREVIOUS_HELPER_RUNNING';
 else if(message==='Distinct unsaved working state and unresolved recovery copy exist; preserve working.json and recovery.json for review before reopening')code='RECOVERY_CONFLICT';
 return {type:'startup_error',schema_version:1,code,message:desktopStartupMessages[code]};
}
export function readDesktopStartupError(value:unknown):DesktopStartupError {
 if(!isRow(value)||Object.keys(value).some(key=>!['type','schema_version','code','message'].includes(key))||value.type!=='startup_error'||value.schema_version!==1||typeof value.code!=='string'||!Object.hasOwn(desktopStartupMessages,value.code)||value.message!==desktopStartupMessages[value.code as DesktopStartupErrorCode])throw new Error('Invalid bounded desktop startup error');
 return {type:'startup_error',schema_version:1,code:value.code as DesktopStartupErrorCode,message:value.message as string};
}
