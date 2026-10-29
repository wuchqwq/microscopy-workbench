// A small optional presentation attachment. Scientific work is already complete;
// missing viewer dependencies never relabel its ASE projection as interactive3D.
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {existsSync,mkdirSync,lstatSync,realpathSync,readFileSync,readdirSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {validateStructureSnapshot,read3DmolAsset} from '../tools/structure_viewer.mjs';
import type {BinaryLike} from 'node:crypto';
import type {ToolResult,ToolDefinition,TextContent} from './runtime/contracts.mjs';
import type {CartesianRotation,StructureCoordinates,StructureSnapshot,StructureViewerOptions,ViewerAttachment,ViewerCloseOptions,ViewerCloseArguments} from './structure_contracts.mjs';
// Unvalidated persisted/HTTP records keep unknown fields. Property/native-path
// views only preserve the original JS operations and errors, never attest data.
type RawRecord=Record<string,unknown>;
const fields=(value:unknown)=>value as RawRecord;
const nativeString=(value:unknown)=>value as string;
const nativeNumber=(value:unknown)=>value as number;
const test=(pattern:RegExp,value:unknown)=>pattern.test(value as string);
const errorCode=(error:unknown)=>(error as {code?:unknown}).code;
const errorMessage=(error:unknown)=>(error as Error).message;

const id=/^[a-f0-9]{32}$/,sha=(bytes:BinaryLike)=>createHash('sha256').update(bytes).digest('hex'),active=new Map<string,Promise<ViewerAttachment>>();
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function require(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function readJson(file:string,directory:string,maxBytes=2*1024*1024):RawRecord{const stat=lstatSync(file),real=realpathSync.native(file),relative=path.relative(directory,real);require(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maxBytes&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Invalid private viewer record');return fields(JSON.parse(readFileSync(real,'utf8')));}
function newFile(file:string,bytes:Buffer){const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp',fd=openSync(temp,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}try{linkSync(temp,file);}finally{unlinkSync(temp);}}
function privateDirectory(workspace:unknown):string{require(typeof workspace==='string'&&path.isAbsolute(workspace),'Configured absolute structure workspace required');const root=realpathSync.native(workspace),directory=path.join(root,'viewer-connections');mkdirSync(directory,{recursive:true});const stat=lstatSync(directory);require(stat.isDirectory()&&!stat.isSymbolicLink(),'Viewer registry must be an ordinary owned directory');return realpathSync.native(directory);}
function parseResult(result:ToolResult){require(result&&!result.isError&&Array.isArray(result.content),'A completed structure_view MCP result is required');const index=result.content.findIndex(c=>c.type==='text');require(index>=0,'Missing structure view metadata');const data=fields(JSON.parse((result.content[index] as TextContent).text));require(data.backend==='external-structure-workspace'&&data.state==='completed'&&data.kind==='view'&&test(id,data.object_id??'')&&test(id,data.structure_object_id??''),'Interactive viewer requires an exact completed structure view');return {data,index};}
function attach(result:ToolResult,index:number,data:RawRecord,viewer:RawRecord):ToolResult{const content=[...result.content];content[index]={...(content[index] as TextContent),text:JSON.stringify({...data,...viewer,automatic_model_wake:false},null,2)};return {...result,content};}
async function connectionState(file:string,directory:string,viewId:unknown,snapshotHash:unknown,assetHash:unknown,signal?:AbortSignal):Promise<ViewerAttachment>{
 const started=Date.now();while(!existsSync(file)){if(signal?.aborted)throw new Error('Stopped waiting; the original owned viewer may still start. It will not be relaunched.');if(Date.now()-started>10000)throw new Error('Original viewer launch remains unverified; it will not be relaunched.');await wait(40);}
 const conn=readJson(file,directory,8192);require(conn.schema_version===1&&conn.object_id===viewId&&conn.snapshot_sha256===snapshotHash&&fields(conn.renderer)?.name==='3Dmol.js'&&fields(conn.renderer)?.asset_sha256===assetHash&&Number.isInteger(conn.port)&&nativeNumber(conn.port)>=1&&nativeNumber(conn.port)<=65535&&typeof conn.token==='string'&&test(/^[a-f0-9]{48}$/,conn.token)&&Number.isSafeInteger(conn.pid)&&nativeNumber(conn.pid)>0,'Owned viewer connection identity mismatch');
 const origin='http://127.0.0.1:'+conn.port,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 try{
  if(signal?.aborted)abort();const response=await fetch(origin+'/api/structure',{headers:{'X-Viewer-Token':nativeString(conn.token),Origin:origin},signal:controller.signal});require(response.ok,'Owned viewer is no longer available; it will not be relaunched');
  const reader=response.body!.getReader(),chunks:Buffer[]=[];let count=0;for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>2*1024*1024){await reader.cancel();throw new Error('Viewer reply exceeds bounded snapshot budget');}chunks.push(Buffer.from(value));}
  const body=fields(JSON.parse(Buffer.concat(chunks).toString('utf8')));require(fields(body.structure)?.object_id===viewId&&body.snapshot_sha256===snapshotHash&&sha(Buffer.from(JSON.stringify(body.structure)))===snapshotHash&&fields(body.renderer)?.name==='3Dmol.js'&&fields(body.renderer)?.asset_sha256===assetHash&&body.read_only===true,'Live viewer snapshot does not match its original structure view');
  return {interactive_3d:'AVAILABLE_NOT_OBSERVED',viewer_state:'ready',viewer_url:origin+'/#'+conn.token,viewer_renderer:body.renderer,viewer_snapshot_sha256:snapshotHash,viewer_process_id:conn.pid,viewer_owner_view_object_id:viewId,viewer_initial_orientation:fields(body.structure).display_orientation??null,viewer_semantics:'Owned local 3Dmol display copy of fixed ASE atoms; URL readiness is not browser/WebGL acceptance. Camera changes do not alter scientific coordinates.'};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function inspectData(inspect:NonNullable<StructureViewerOptions['inspect']>,view:RawRecord){
 const viewId=view.object_id,sourceId=view.structure_object_id;
 const response=await inspect(nativeString(viewId)),raw=(fields(response)?.content as RawRecord[]|undefined)?.find(c=>c.type==='text')?.text,data=fields(raw===undefined?response:JSON.parse(nativeString(raw)));require(!fields(response)?.isError&&data?.object_id===viewId&&data.structure_object_id===sourceId&&data.atoms,'Exact structure_info view/atom ancestry is required');
 const atoms=fields(data.atoms),snapshot:RawRecord={object_id:viewId,symbols:atoms.symbols,positions_angstrom:atoms.positions_angstrom,cell_angstrom:atoms.cell_angstrom,pbc:atoms.pbc};
 validateStructureSnapshot(snapshot);
 if(view.orientation){
  const orientation=fields(view.orientation);require(orientation.structure_object_id===sourceId,'View orientation belongs to a different source structure');
  const {object_id:ignored,...sourceCoordinates}=snapshot;
  const display={orientation_id:orientation.orientation_id,rotation_matrix_cartesian:orientation.rotation_matrix_cartesian,source_coordinates_sha256:sha(Buffer.from(JSON.stringify(sourceCoordinates))),initial_orientation_applied:true,scientific_source_coordinates_modified:false,display_coordinates_transformed:true,convention:'Display copy v_lab = v_source @ R.T; x right, y up; default camera observes from +z towards origin'};
  validateStructureSnapshot({...snapshot,display_orientation:display});
  // The original display validator above attests this exact source matrix.
  const matrix=orientation.rotation_matrix_cartesian as CartesianRotation,rotate=(v:readonly number[])=>matrix.map(row=>row.reduce((s,x,k)=>s+x*v[k],0));
  snapshot.positions_angstrom=(atoms.positions_angstrom as StructureCoordinates['positions_angstrom']).map(rotate);snapshot.cell_angstrom=(atoms.cell_angstrom as StructureCoordinates['cell_angstrom']).map(rotate);snapshot.display_orientation=display;
 }else if(Array.isArray(view.rotation_deg_xyz)&&view.rotation_deg_xyz.some((v:unknown)=>v!==0)){
  snapshot.display_orientation={initial_orientation_applied:false,scientific_source_coordinates_modified:false,display_coordinates_transformed:false,requested_rotation_deg_xyz:view.rotation_deg_xyz,convention:'Legacy ASE projection rotation is separate from the interactive camera',reason:'Legacy Cartesian projection rotation was not applied to this interactive view; use a shared orientation record'};
 }
 const normalized=validateStructureSnapshot(snapshot);return {snapshot,normalized};
}
const semanticSnapshotHash=(snapshot:StructureSnapshot)=>{const {object_id:ignored,...content}=snapshot;return sha(Buffer.from(JSON.stringify(content)));};
function intentAt(directory:string,viewId:string):RawRecord{
 const prior=readJson(path.join(directory,viewId+'.intent.json'),directory,16384);
 require([1,2].includes(nativeNumber(prior.schema_version))&&prior.view_object_id===viewId&&test(id,prior.structure_object_id??'')&&test(/^[a-f0-9]{64}$/,prior.snapshot_sha256??'')&&test(/^[a-f0-9]{64}$/,prior.asset_sha256??''),'Original viewer intent identity mismatch');
 if(prior.schema_version===2){
  require(test(id,prior.owner_view_object_id??'')&&test(/^[a-f0-9]{64}$/,prior.shared_key??''),'Malformed shared viewer identity');
  const shared=readJson(path.join(directory,'shared-'+prior.shared_key+'.intent.json'),directory,16384);
  require(shared.schema_version===2&&shared.shared_key===prior.shared_key&&shared.owner_view_object_id===prior.owner_view_object_id&&shared.structure_object_id===prior.structure_object_id&&shared.snapshot_sha256===prior.snapshot_sha256&&shared.asset_sha256===prior.asset_sha256,'Shared viewer intent identity mismatch');
 }
 return {...prior,owner_view_object_id:prior.owner_view_object_id??viewId};
}
async function obtainViewer(data:RawRecord,{workspace,assetPath,inspect,signal}:StructureViewerOptions):Promise<ViewerAttachment>{
 const directory=privateDirectory(workspace),viewId=nativeString(data.object_id),sourceId=data.structure_object_id,intentFile=path.join(directory,viewId+'.intent.json'),snapshotFile=path.join(directory,viewId+'.snapshot.json'),connectionFile=path.join(directory,viewId+'.connection.json');
 if(existsSync(intentFile)){const prior=intentAt(directory,viewId);require(prior.structure_object_id===sourceId,'Original viewer source identity mismatch');const owner=prior.owner_view_object_id;return connectionState(path.join(directory,owner+'.connection.json'),directory,owner,prior.snapshot_sha256,prior.asset_sha256,signal);}
 const asset=read3DmolAsset(assetPath);require(typeof inspect==='function','Existing structure_info inspector required');const {snapshot,normalized}=await inspectData(inspect,data),snapshotBytes=Buffer.from(JSON.stringify(snapshot)),snapshotHash=sha(Buffer.from(JSON.stringify(normalized)));
 if(signal?.aborted)return {interactive_3d:'NOT_STARTED',viewer_state:'cancelled_before_launch',viewer_url:null};
 try{newFile(snapshotFile,snapshotBytes);}catch(error){if(errorCode(error)!=='EEXIST')throw error;const prior=readJson(snapshotFile,directory);require(sha(Buffer.from(JSON.stringify(prior)))===sha(snapshotBytes),'Viewer fixed-snapshot identity conflict');}
 let sharedKey=sha(Buffer.from(JSON.stringify({structure_object_id:sourceId,content_sha256:semanticSnapshotHash(normalized),asset_sha256:asset.sha256}))),shared:RawRecord|null|undefined,ownsLaunch=false;
 for(let generation=0;generation<256;generation++){
  const sharedFile=path.join(directory,'shared-'+sharedKey+'.intent.json');shared={schema_version:2,shared_key:sharedKey,owner_view_object_id:viewId,structure_object_id:sourceId,snapshot_sha256:snapshotHash,asset_sha256:asset.sha256};
  try{newFile(sharedFile,Buffer.from(JSON.stringify(shared)));ownsLaunch=true;break;}catch(error){
   if(errorCode(error)!=='EEXIST')throw error;shared=readJson(sharedFile,directory,16384);require(shared.schema_version===2&&shared.shared_key===sharedKey&&test(id,shared.owner_view_object_id??'')&&shared.structure_object_id===sourceId&&shared.asset_sha256===asset.sha256,'Shared viewer launch identity conflict');const owner=shared.owner_view_object_id,ownerSnapshot=validateStructureSnapshot(readJson(path.join(directory,owner+'.snapshot.json'),directory));require(sha(Buffer.from(JSON.stringify(ownerSnapshot)))===shared.snapshot_sha256&&semanticSnapshotHash(ownerSnapshot)===semanticSnapshotHash(normalized),'Shared viewer fixed scientific/display snapshot mismatch');
   const connection=path.join(directory,owner+'.connection.json');
   if(!existsSync(connection))break; // Uncertain launch is recovered, never repeated.
   const conn=readJson(connection,directory,8192);require(conn.object_id===owner&&conn.snapshot_sha256===shared.snapshot_sha256&&fields(conn.renderer)?.asset_sha256===shared.asset_sha256,'Shared helper connection mismatch');
   if(!await closedHelper(directory,owner,shared.snapshot_sha256,conn,signal))break;
   // Only a NEW explicit view request may start a fresh generation after a
   // verified shutdown. Historical aliases always keep their original owner.
   sharedKey=sha(Buffer.from('after-confirmed-close\0'+sharedKey+'\0'+owner));shared=null;
  }
 }
 require(shared,'Owned viewer generation history exceeds its bounded lookup budget');
 const intent={...shared,view_object_id:viewId,snapshot_file_sha256:sha(snapshotBytes),original_request_id:data.request_id??null,state:'launch_requested',created_utc:new Date().toISOString()};
 try{newFile(intentFile,Buffer.from(JSON.stringify(intent)));}catch(error){if(errorCode(error)!=='EEXIST')throw error;const prior=intentAt(directory,viewId);require(prior.structure_object_id===sourceId&&prior.snapshot_sha256===shared.snapshot_sha256&&prior.owner_view_object_id===shared.owner_view_object_id,'Viewer launch identity conflict');}
 if(ownsLaunch){const child=spawn(process.execPath,[fileURLToPath(new URL('../tools/structure_viewer.mjs',import.meta.url)),'--snapshot',snapshotFile,'--asset',assetPath!,'--connection-file',connectionFile],{detached:true,windowsHide:true,stdio:'ignore'});await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);});child.unref();}
 return connectionState(path.join(directory,shared.owner_view_object_id+'.connection.json'),directory,shared.owner_view_object_id,shared.snapshot_sha256,asset.sha256,signal);
}
export async function attachStructureViewer(result:ToolResult,{workspace,assetPath,inspect,signal}:StructureViewerOptions={}):Promise<ToolResult>{
 const {data,index}=parseResult(result);
 if(!assetPath)return attach(result,index,data,{interactive_3d:'NOT_CONFIGURED',viewer_state:'not_configured',viewer_url:null,viewer_limitation:'The returned image remains the ASE2D projection. Configure the independent local3dmol asset to request interactive3D.'});
 if(signal?.aborted)return attach(result,index,data,{interactive_3d:'NOT_STARTED',viewer_state:'cancelled_before_launch',viewer_url:null});
 const key=String(workspace)+'|'+data.object_id;
 try{let pending=active.get(key);if(!pending){pending=obtainViewer(data,{workspace,assetPath,inspect,signal});active.set(key,pending);pending.finally(()=>{if(active.get(key)===pending)active.delete(key);}).catch(()=>{});}const viewer=await pending;return attach(result,index,data,{...viewer,viewer_reused:viewer.viewer_owner_view_object_id!==data.object_id,viewer_source:{view_object_id:data.object_id,structure_object_id:data.structure_object_id,viewer_owner_view_object_id:viewer.viewer_owner_view_object_id??null}});}
 catch(error){return attach(result,index,data,{interactive_3d:'UNVERIFIED',viewer_state:'unavailable_or_unknown',viewer_url:null,viewer_limitation:errorMessage(error)});}
}

export const structureViewerTools:ToolDefinition[]=[{name:'structure_viewer_close',description:'Close the owned local3D helper for an exact saved structure_view. Views of the same source/display snapshot may share it: closure affects all listed aliases, never DM or scientific files. Save request_id first. Repeating this tool with the SAME ID and object_id queries that close only, without sending again; conflicting arguments are refused. A missing acknowledgement or a still-running process/port remains unknown, never a successful close.',inputSchema:{type:'object',additionalProperties:false,properties:{object_id:{type:'string',pattern:'^[a-f0-9]{32}$',minLength:32,maxLength:32},request_id:{type:'string',pattern:'^[A-Za-z0-9_-]+$',minLength:1,maxLength:64}},required:['object_id','request_id']}}];
function aliasesFor(directory:string,owner:unknown){
 return readdirSync(directory).filter(name=>/^[a-f0-9]{32}\.intent\.json$/.test(name)).map(name=>intentAt(directory,name.slice(0,32))).filter(row=>row.owner_view_object_id===owner).map(row=>row.view_object_id).sort();
}
function processAlive(pid:unknown){try{process.kill(nativeNumber(pid),0);return true;}catch(error){if(errorCode(error)==='ESRCH')return false;throw error;}}
async function portAlive(port:unknown):Promise<boolean>{return new Promise<boolean>(resolve=>{let done=false;const socket=net.createConnection({host:'127.0.0.1',port:nativeNumber(port)});const finish=(value:boolean)=>{if(done)return;done=true;socket.destroy();resolve(value);};socket.once('connect',()=>finish(true));socket.once('error',error=>finish(errorCode(error)!=='ECONNREFUSED'));socket.setTimeout(300,()=>finish(true));});}
async function closedHelper(directory:string,owner:unknown,snapshotHash:unknown,conn:RawRecord,signal?:AbortSignal){
 require(Number.isSafeInteger(conn.pid)&&nativeNumber(conn.pid)>0&&Number.isInteger(conn.port)&&nativeNumber(conn.port)>=1&&nativeNumber(conn.port)<=65535,'Invalid owned helper process/port');
 const closedFile=path.join(directory,owner+'.connection.json.closed.json');
 if(!existsSync(closedFile))return null;
 const closed=readJson(closedFile,directory,8192);require(closed.schema_version===1&&closed.state==='closed'&&closed.object_id===owner&&closed.snapshot_sha256===snapshotHash&&closed.pid===conn.pid&&(closed.request_id===null||test(/^[A-Za-z0-9_-]{1,64}$/,closed.request_id??'')),'Owned helper closure record identity mismatch');
 if(signal?.aborted)throw new Error('Stopped waiting for owned viewer closure; query this original close ID');
 if(processAlive(conn.pid)||await portAlive(conn.port))return null;
 return closed;
}
async function completedClose(directory:string,request:RawRecord,signal?:AbortSignal){
 const {owner_view_object_id:owner,snapshot_sha256:snapshotHash,connection:rawConnection}=request,conn=fields(rawConnection),closed=await closedHelper(directory,owner,snapshotHash,conn,signal);if(!closed)return null;
 if(closed.request_id!==request.request_id&&!(request.closed_before_submission===true&&closed.request_id===request.preexisting_closure_request_id&&sha(readFileSync(path.join(directory,owner+'.connection.json.closed.json')))===request.preexisting_closure_sha256))return null;
 return {backend:'external-structure-workspace',state:'completed',kind:'viewer_close',request_id:request.request_id,object_id:request.object_id,viewer_owner_view_object_id:owner,viewer_snapshot_sha256:snapshotHash,viewer_state:'closed',viewer_process_stopped:true,viewer_port_stopped:true,closure_receipt_request_id:closed.request_id,closed_now:closed.request_id===request.request_id,affected_view_object_ids:aliasesFor(directory,owner),shared_helper:true,scientific_data_modified:false,dm_called:false,automatic_restart:false,recovery_tool:'structure_viewer_close',recovery:'Call the same tool with the original request_id and object_id; this only queries the saved close record.'};
}
const mcpText=(data:RawRecord):ToolResult=>({content:[{type:'text',text:JSON.stringify(data,null,2)}]});
export async function closeStructureViewer(args:ViewerCloseArguments,{workspace,signal}:ViewerCloseOptions={}):Promise<ToolResult>{
 require(args&&Object.keys(args).every(k=>['object_id','request_id'].includes(k))&&test(id,args.object_id??'')&&test(/^[A-Za-z0-9_-]{1,64}$/,args.request_id??''),'Exact view object_id and pre-saved bounded close request_id required');
 const directory=privateDirectory(workspace),requests=path.join(directory,'close-requests');mkdirSync(requests,{recursive:true});require(lstatSync(requests).isDirectory()&&!lstatSync(requests).isSymbolicLink()&&realpathSync.native(requests)===requests,'Ordinary owned close-request directory required');
 const requestFile=path.join(requests,args.request_id+'.request.json'),resultFile=path.join(requests,args.request_id+'.result.json');let request:RawRecord,ownsDispatch=false;
 if(existsSync(requestFile)){
  request=readJson(requestFile,requests,16384);require(request.schema_version===1&&request.operation==='structure_viewer_close'&&request.request_id===args.request_id&&request.object_id===args.object_id,'VIEWER_CLOSE_CONFLICT: same ID has different original arguments');
  if(existsSync(resultFile)){const saved=readJson(resultFile,requests,16384);require(saved.request_id===args.request_id&&saved.object_id===args.object_id&&saved.viewer_owner_view_object_id===request.owner_view_object_id&&saved.viewer_snapshot_sha256===request.snapshot_sha256&&saved.state==='completed'&&saved.viewer_state==='closed','Saved close receipt identity mismatch');return mcpText({...saved,historical:true});}
 }else{
  if(signal?.aborted)throw new Error('Cancelled before owned viewer close submission');
  const intent=intentAt(directory,args.object_id),owner=intent.owner_view_object_id,conn=readJson(path.join(directory,owner+'.connection.json'),directory,8192);
  require(conn.schema_version===1&&conn.object_id===owner&&conn.snapshot_sha256===intent.snapshot_sha256&&fields(conn.renderer)?.asset_sha256===intent.asset_sha256&&Number.isSafeInteger(conn.pid)&&nativeNumber(conn.pid)>0&&Number.isInteger(conn.port)&&nativeNumber(conn.port)>=1&&nativeNumber(conn.port)<=65535&&test(/^[a-f0-9]{48}$/,conn.token??''),'Owned viewer close connection mismatch');
  const priorClosure=await closedHelper(directory,owner,intent.snapshot_sha256,conn,signal);
  request={schema_version:1,operation:'structure_viewer_close',request_id:args.request_id,object_id:args.object_id,owner_view_object_id:owner,snapshot_sha256:intent.snapshot_sha256,connection:conn,closed_before_submission:!!priorClosure,preexisting_closure_request_id:priorClosure?.request_id??null,preexisting_closure_sha256:priorClosure?sha(readFileSync(path.join(directory,owner+'.connection.json.closed.json'))):null,created_utc:new Date().toISOString()};
  try{newFile(requestFile,Buffer.from(JSON.stringify(request)));ownsDispatch=true;}catch(error){if(errorCode(error)!=='EEXIST')throw error;return closeStructureViewer(args,{workspace,signal});}
 }
 const unknown=(reason:string)=>mcpText({backend:'external-structure-workspace',state:'unknown',kind:'viewer_close',request_id:args.request_id,object_id:args.object_id,viewer_state:'closure_unverified',viewer_owner_view_object_id:request.owner_view_object_id,affected_view_object_ids:aliasesFor(directory,request.owner_view_object_id),reason,automatic_retry:false,automatic_restart:false,scientific_data_modified:false,dm_called:false,recovery_tool:'structure_viewer_close'});
 const saveComplete=(closed:NonNullable<Awaited<ReturnType<typeof completedClose>>>)=>{try{newFile(resultFile,Buffer.from(JSON.stringify(closed)));}catch(error){if(errorCode(error)!=='EEXIST')throw error;const prior=readJson(resultFile,requests,16384);require(prior.request_id===args.request_id&&prior.object_id===args.object_id&&prior.viewer_owner_view_object_id===closed.viewer_owner_view_object_id&&prior.viewer_snapshot_sha256===closed.viewer_snapshot_sha256,'Concurrent close receipt identity mismatch');}return mcpText(closed);};
 try{
  let closed=await completedClose(directory,request,signal);if(closed)return saveComplete(closed);
  if(ownsDispatch){
   if(signal?.aborted)return unknown('Cancelled after durable close intent; no automatic resubmission');
   const conn=fields(request.connection),origin='http://127.0.0.1:'+conn.port,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
   try{const response=await fetch(origin+'/api/close',{method:'POST',headers:{'X-Viewer-Token':nativeString(conn.token),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({request_id:args.request_id,object_id:request.owner_view_object_id,snapshot_sha256:request.snapshot_sha256}),signal:controller.signal});require(response.ok,'Owned helper did not accept its exact close request');const ack=fields(await response.json());require(ack.state==='closing'&&ack.request_id===args.request_id&&ack.object_id===request.owner_view_object_id&&ack.snapshot_sha256===request.snapshot_sha256,'Owned helper close acknowledgement mismatch');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  const start=Date.now();do{closed=await completedClose(directory,request,signal);if(closed)return saveComplete(closed);if(signal?.aborted)return unknown('Cancelled while waiting for helper shutdown');await wait(40);}while(Date.now()-start<5000);
  return unknown('The original close has no independently confirmed helper exit/closed port; it was not sent again');
 }catch(error){return unknown(errorMessage(error));}
}
