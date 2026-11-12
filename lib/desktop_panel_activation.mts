// Desktop activation receipts record a window observation, separate from scientific saves.
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {closeSync,fsyncSync,linkSync,lstatSync,openSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {desktopRuntimePath} from '../tools/desktop_launcher.mjs';
import {isRow,panelAddress} from './desktop_contracts.mjs';
import {assertOwnedPanelStopped,readOwnedPanelCheckpoint,readOwnedPanelConnection} from './panel_ownership.mjs';
import {withWorkspaceMetadataGate} from './workspace_metadata_gate.mjs';
import {ordinaryWorkspaceMetadataDirectory,ordinaryWorkspaceMetadataTarget} from './workspace_metadata_paths.mjs';

export interface DesktopPanelIdentity {
 workspace:string;
 panelId:string;
 helperSessionId:string;
 generation:number;
 requestId:string;
}

export interface DesktopPanelActivationInput extends DesktopPanelIdentity {
 url:string;
}

export type DesktopPanelActivation=
 | {status:'activated';visible:boolean;focused:boolean;reused:boolean}
 | {status:'refused';reason:'stale_viewer'|'viewer_start_failed'|'viewer_closed'|'renderer_gone'};

interface DesktopPanelWindow {
 isDestroyed():boolean;
 isMinimized():boolean;
 isVisible():boolean;
 isFocused():boolean;
 restore():void;
 show():void;
 focus():void;
}

export async function showDesktopPanelWindow(window:DesktopPanelWindow,reused:boolean,rendererGone:()=>boolean):Promise<DesktopPanelActivation> {
 if(window.isDestroyed())return {status:'refused',reason:'viewer_closed'};
 if(rendererGone())return {status:'refused',reason:'renderer_gone'};
 if(window.isMinimized())window.restore();
 if(!window.isVisible())window.show();
 window.focus();
 // Windows can decline foreground focus. Observe the result after the event loop can apply it.
 if(!window.isFocused())await delay(300);
 if(window.isDestroyed()||!window.isVisible())return {status:'refused',reason:'viewer_closed'};
 if(rendererGone())return {status:'refused',reason:'renderer_gone'};
 return {status:'activated',visible:true,focused:window.isFocused(),reused};
}

export class DesktopPanelNotDispatched extends Error {}

const isId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const isRequestId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const isGeneration=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=1;

export function desktopPanelIdentity(workspace:string,value:unknown):DesktopPanelIdentity {
 if(!path.isAbsolute(workspace)||!isRow(value)||!isId(value.panelId)||!isId(value.helperSessionId)||!isRequestId(value.requestId)||!isGeneration(value.generation))throw new Error('Invalid desktop Panel activation identity');
 return {workspace,panelId:value.panelId,helperSessionId:value.helperSessionId,generation:value.generation,requestId:value.requestId};
}

function panelDirectory(input:DesktopPanelIdentity) {
 return `panel-registry/desktop/${input.panelId}`;
}

export function desktopPanelProfile(input:DesktopPanelIdentity,create=false) {
 return ordinaryWorkspaceMetadataDirectory(input.workspace,`${panelDirectory(input)}/profile`,{create});
}

function receiptPath(input:DesktopPanelIdentity) {
 const directory=ordinaryWorkspaceMetadataDirectory(input.workspace,panelDirectory(input));
 const digest=createHash('sha256').update(input.requestId).digest('hex');
 return ordinaryWorkspaceMetadataTarget(input.workspace,path.join(directory,digest+'.json'));
}

function receiptIdentity(input:DesktopPanelIdentity) {
 return {schema_version:1,panel_id:input.panelId,helper_session_id:input.helperSessionId,generation:input.generation,request_id:input.requestId};
}

function readResult(value:unknown):DesktopPanelActivation {
 if(isRow(value)&&value.status==='activated'&&Object.keys(value).length===4&&typeof value.visible==='boolean'&&typeof value.focused==='boolean'&&typeof value.reused==='boolean'&&(!value.focused||value.visible)){
  return {status:'activated',visible:value.visible,focused:value.focused,reused:value.reused};
 }
 if(isRow(value)&&value.status==='refused'&&Object.keys(value).length===2&&(value.reason==='stale_viewer'||value.reason==='viewer_start_failed'||value.reason==='viewer_closed'||value.reason==='renderer_gone'))return {status:'refused',reason:value.reason};
 throw new Error('Invalid desktop Panel activation result');
}

export function readDesktopPanelActivation(input:DesktopPanelIdentity):DesktopPanelActivation|null {
 desktopPanelIdentity(input.workspace,input);
 try{
  const file=receiptPath(input);
  if(lstatSync(file).size>4096)throw new Error('Desktop Panel activation receipt exceeds its bound');
  const value:unknown=JSON.parse(readFileSync(file,'utf8'));
  const expected=receiptIdentity(input);
  if(!isRow(value)||Object.keys(value).length!==6||Object.entries(expected).some(([key,field])=>value[key]!==field))throw new Error('Desktop Panel activation receipt identity mismatch');
  return readResult(value.result);
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
  throw error;
 }
}

export function acknowledgeDesktopPanelActivation(input:DesktopPanelIdentity,result:DesktopPanelActivation):void {
 desktopPanelIdentity(input.workspace,input);
 const file=receiptPath(input),temporary=file+'.'+randomBytes(6).toString('hex')+'.tmp';
 const fd=openSync(temporary,'wx');
 try{
  try{
   writeFileSync(fd,JSON.stringify({...receiptIdentity(input),result:readResult(result)}));
   fsyncSync(fd);
  }finally{closeSync(fd);}
  linkSync(temporary,file);
 }catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST'||!readDesktopPanelActivation(input))throw error;
 }finally{unlinkSync(temporary);}
}

export function desktopPanelAddress(input:DesktopPanelIdentity) {
 const conn=readOwnedPanelConnection(input.workspace,input.panelId);
 if(conn.schema_version!==2||conn.status!=='running'||conn.helper_session_id!==input.helperSessionId||conn.generation!==input.generation)throw new Error('The exact owned Panel helper is unavailable');
 return panelAddress(`http://127.0.0.1:${conn.port}/#${conn.token}`);
}

export function attachedDesktopPanelStopped(input:DesktopPanelIdentity):boolean {
 try{
  desktopPanelIdentity(input.workspace,input);
  ordinaryWorkspaceMetadataDirectory(input.workspace,'panel-registry/panels');
  const current=readOwnedPanelConnection(input.workspace,input.panelId);
  if(current.schema_version!==2)return false;
  if(current.helper_session_id===input.helperSessionId&&current.generation===input.generation){
   assertOwnedPanelStopped(current);
   return true;
  }
  if(current.helper_session_id===input.helperSessionId||current.generation!<=input.generation)return false;
  // Publication of a successor requires proof that the predecessor stopped.
  readOwnedPanelCheckpoint(input.workspace,current);
  return true;
 }catch{return false;}
}

export function assertDesktopPanelIntent(input:DesktopPanelIdentity):void {
 desktopPanelIdentity(input.workspace,input);
 const directory=ordinaryWorkspaceMetadataDirectory(input.workspace,'panel-registry/requests');
 const file=ordinaryWorkspaceMetadataTarget(input.workspace,path.join(directory,input.requestId+'.json'));
 if(lstatSync(file).size>4096)throw new Error('Desktop Panel intent exceeds its bound');
 const value:unknown=JSON.parse(readFileSync(file,'utf8'));
 if(!isRow(value)||value.schema_version!==1||value.name!=='image_panel_activate'||value.status!=='submitted'||value.stage!=='dispatching'||
  value.request_id!==input.requestId||value.panel_id!==input.panelId||value.helper_session_id!==input.helperSessionId||value.generation!==input.generation||
  !isRow(value.arguments)||value.arguments.panel_id!==input.panelId||value.arguments.request_id!==input.requestId){
  throw new Error('Desktop Panel activation requires its original submitted intent');
 }
}

export async function activateDesktopPanel(input:DesktopPanelActivationInput):Promise<DesktopPanelActivation> {
 // The caller owns the submitted intent. An existing receipt is query-only.
 const existing=readDesktopPanelActivation(input);
 if(existing)return existing;
 try{
  if(process.platform!=='win32')throw new Error('Desktop Panel activation is available on Windows');
  const owned=desktopPanelAddress(input);
  if(owned.url!==panelAddress(input.url).url)throw new Error('Desktop address changed before activation');
  assertDesktopPanelIntent(input);
  const runtime=desktopRuntimePath();
  withWorkspaceMetadataGate(input.workspace,()=>desktopPanelProfile(input,true));
  const entry=fileURLToPath(new URL('../tools/desktop_panel_viewer.mjs',import.meta.url));
  const child=spawn(runtime,[entry,input.workspace,input.panelId,input.helperSessionId,String(input.generation),input.requestId],{
   detached:true,stdio:'ignore',windowsHide:false,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},
  });
  await new Promise<void>((resolve,reject)=>{
   child.once('error',reject);
   child.once('spawn',resolve);
  });
  child.unref();
 }catch(error){
  throw new DesktopPanelNotDispatched(error instanceof Error?error.message:'Desktop Panel activation could not be dispatched');
 }
 const deadline=Date.now()+10000;
 do{
  const receipt=readDesktopPanelActivation(input);
  if(receipt)return receipt;
  await delay(50);
 }while(Date.now()<deadline);
 throw new Error('Desktop Panel activation outcome is unknown; query the original activation request');
}
