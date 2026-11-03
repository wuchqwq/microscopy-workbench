// Private owned-helper metadata only. Scientific records remain authoritative in
// their providers; a checkpoint is never an admission of its saved evidence.
import {randomBytes,createHash} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import type {OwnedPanelConnection} from './panel_manager_contracts.mjs';
import {withWorkspaceMetadataGate} from './workspace_metadata_gate.mjs';
import {ordinaryWorkspaceMetadataDirectory,ordinaryWorkspaceMetadataTarget} from './workspace_metadata_paths.mjs';

type Row=Record<string,unknown>;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const row=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid owned Panel record');return v as Row;};
function write(workspace:string,file:string,value:unknown,exclusive=false){file=ordinaryWorkspaceMetadataTarget(workspace,file);const target=exclusive?file:file+'.'+randomBytes(8).toString('hex')+'.tmp',fd=openSync(target,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}if(!exclusive)renameSync(target,ordinaryWorkspaceMetadataTarget(workspace,file));}
function dirs(workspace:string){if(!path.isAbsolute(workspace))throw new Error('Owned Panel requires absolute workspace');mkdirSync(workspace,{recursive:true});const root=realpathSync.native(workspace),registry=ordinaryWorkspaceMetadataDirectory(root,'panel-registry',{create:true});for(const relative of ['panel-registry/panels','panel-registry/registrations','panel-journals'])ordinaryWorkspaceMetadataDirectory(root,relative,{create:true});return {workspace:root,registry};}
function inside(root:string,file:string){const actual=realpathSync.native(file),relative=path.relative(root,actual);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!statSync(actual).isFile())throw new Error('Owned Panel reference escapes its workspace');return actual;}
function json(file:string,root:string,max=1024*1024):Row{const actual=inside(root,file);if(statSync(actual).size>max)throw new Error('Owned Panel record exceeds bound');return row(JSON.parse(readFileSync(actual,'utf8')));}
const connectionPath=(root:string,panel:string)=>path.join(root,'panels',panel+'.json');
export function validateOwnedConnection(value:unknown,panel:string):OwnedPanelConnection{
 const v=row(value),keys=['schema_version','panel_id','port','token','pid','evidence_token','helper_session_id','generation','checkpoint_file','status','closed_utc'];
 if(Object.keys(v).some(k=>!keys.includes(k))||![1,2].includes(v.schema_version as number)||v.panel_id!==panel||!id(panel)||!Number.isInteger(v.port)||(v.port as number)<1||(v.port as number)>65535||typeof v.token!=='string'||!/^[a-f0-9]{48,64}$/.test(v.token)||!Number.isSafeInteger(v.pid)||(v.pid as number)<1||v.evidence_token!==undefined&&(typeof v.evidence_token!=='string'||!/^[a-f0-9]{64}$/.test(v.evidence_token)))throw new Error('Invalid owned Panel connection');
 if(v.schema_version===2&&(!id(v.helper_session_id)||!Number.isSafeInteger(v.generation)||(v.generation as number)<1||typeof v.checkpoint_file!=='string'||!['running','closed'].includes(v.status as string)||v.status==='closed'&&typeof v.closed_utc!=='string'))throw new Error('Invalid owned Panel generation');
 if(v.schema_version===1&&Object.keys(v).some(k=>['helper_session_id','generation','checkpoint_file','status','closed_utc'].includes(k)))throw new Error('Legacy Panel connection cannot claim ownership');
 return v as unknown as OwnedPanelConnection;
}
export function readOwnedPanelConnection(workspace:string,panel:string){const d=dirs(workspace);if(!id(panel))throw new Error('Invalid panel_id');return validateOwnedConnection(json(connectionPath(d.registry,panel),d.registry,4096),panel);}
export function assertOwnedPanelStopped(conn:OwnedPanelConnection){
 if(conn.schema_version!==2)throw new Error('Legacy helper has no trusted owned checkpoint; open an explicit new Panel instead');
 if(conn.status==='closed')return;
 try{process.kill(conn.pid,0);}catch(error){if((error as {code?:string}).code==='ESRCH')return;throw new Error('Cannot verify previous owned helper has stopped');}
 throw new Error('Previous owned helper PID is still present; no replacement or duplicate launch is permitted');
}
export function readOwnedPanelCheckpoint(workspace:string,conn:OwnedPanelConnection):Row{
 const d=dirs(workspace);if(conn.schema_version!==2||!id(conn.helper_session_id))throw new Error('Legacy helper checkpoint is unqualified');
 const expected=path.join(d.workspace,'panel-journals',conn.helper_session_id,'current-selection.json');
 if(path.resolve(conn.checkpoint_file!)!==expected)throw new Error('Owned checkpoint path is not the exact helper journal');
 const value=json(expected,d.workspace);
 if(value.schema_version!==1||value.panel_id!==conn.panel_id||value.helper_session_id!==conn.helper_session_id||value.panel_generation!==conn.generation||!id(value.object_id))throw new Error('Owned checkpoint generation/Panel binding mismatch');
 return value;
}
interface RegistrationRecord extends Row {schema_version:1;workspace:string;panel_id:string;helper_session_id:string;generation:number;journal:string;nonce:string;previous?:OwnedPanelConnection;checkpoint_sha256?:string;}
export interface OwnedRegistration {
 readonly panel_id:string;readonly helper_session_id:string;readonly generation:number;readonly journalDirectory:string;readonly registration_file:string;readonly owner_nonce:string;readonly checkpoint:Row|null;
 readonly previousCheckpoint:Row|null;readonly previousConnection:OwnedPanelConnection|null;
 publish(panel:{server:{address():unknown};token:string;evidenceToken:string;state():unknown}):void;
 close(panel:{close():Promise<void>}):Promise<void>;
 // Only the preparing caller, before invoking any helper entry/launch.
 releaseUnlaunched():void;
}
function materialize(file:string,record:RegistrationRecord,allowUnlaunchedRelease=false):OwnedRegistration{
 const d=dirs(record.workspace),lock=path.join(d.registry,'panels',record.panel_id+'.lock');
 ordinaryWorkspaceMetadataDirectory(d.workspace,path.join('panel-journals',record.helper_session_id));
 const ownLock=()=>{ordinaryWorkspaceMetadataTarget(d.workspace,lock);const claim=json(lock,d.registry,4096);if(claim.schema_version!==1||claim.panel_id!==record.panel_id||claim.nonce!==record.nonce||claim.helper_session_id!==record.helper_session_id)throw new Error('Owned helper registration lock does not match');};
 let checkpoint:Row|null=null,publicationStarted=false;
 if(record.previous){checkpoint=readOwnedPanelCheckpoint(record.workspace,record.previous);const digest=createHash('sha256').update(readFileSync(record.previous.checkpoint_file!)).digest('hex');if(digest!==record.checkpoint_sha256)throw new Error('Owned checkpoint changed after explicit resume submission');}
 return {panel_id:record.panel_id,helper_session_id:record.helper_session_id,generation:record.generation,journalDirectory:record.journal,registration_file:file,owner_nonce:record.nonce,checkpoint,previousCheckpoint:checkpoint,previousConnection:record.previous??null,
  publish(panel){publicationStarted=true;ownLock();const state=row(panel.state());if(state.panel_id!==record.panel_id||state.helper_session_id!==record.helper_session_id||state.panel_generation!==record.generation)throw new Error('Actual created helper does not match owned registration');
   const currentFile=connectionPath(d.registry,record.panel_id);if(record.previous){const old=readOwnedPanelConnection(record.workspace,record.panel_id);if(JSON.stringify(old)!==JSON.stringify(record.previous))throw new Error('Previous owned connection changed during resume');assertOwnedPanelStopped(old);}else if(existsSync(currentFile))throw new Error('Owned Panel already registered');
   const checkpointFile=path.join(record.journal,'current-selection.json');const saved=json(checkpointFile,d.workspace);if(saved.panel_id!==record.panel_id||saved.helper_session_id!==record.helper_session_id||saved.panel_generation!==record.generation)throw new Error('New helper persisted checkpoint identity mismatch');
   const port=(panel.server.address() as {port?:number}|null)?.port;const conn=validateOwnedConnection({schema_version:2,panel_id:record.panel_id,helper_session_id:record.helper_session_id,generation:record.generation,port,token:panel.token,evidence_token:panel.evidenceToken,pid:process.pid,checkpoint_file:checkpointFile,status:'running'},record.panel_id);write(d.workspace,currentFile,conn);unlinkSync(lock);
  },
  releaseUnlaunched(){
   // A resumed child cannot release its parent's claim, nor can a handle that
   // has attempted publication. This is not a stale-lock or unknown-spawn API.
   if(!allowUnlaunchedRelease||publicationStarted)throw new Error('Owned helper claim cannot be released after helper handoff/publication');
   ownLock();
   if(JSON.stringify(json(file,d.registry,16384))!==JSON.stringify(record))throw new Error('Owned registration changed before prelaunch rollback');
   const currentFile=connectionPath(d.registry,record.panel_id);
   if(record.previous){if(JSON.stringify(readOwnedPanelConnection(record.workspace,record.panel_id))!==JSON.stringify(record.previous))throw new Error('Previous owned connection changed before prelaunch rollback');}
   else if(existsSync(currentFile))throw new Error('Owned helper already has a connection; claim retained');
   if(realpathSync.native(record.journal)!==record.journal||readdirSync(record.journal).length!==0)throw new Error('Owned helper journal is not untouched; claim retained');
   // Retain the attempt registration and empty journal for diagnosis. Release
   // only this exact nonce's lock; no old checkpoint or provider file changes.
   unlinkSync(lock);allowUnlaunchedRelease=false;
  },
  async close(panel){await panel.close();const current=readOwnedPanelConnection(record.workspace,record.panel_id);if(current.schema_version!==2||current.helper_session_id!==record.helper_session_id||current.generation!==record.generation||current.pid!==process.pid)throw new Error('Cannot close a different owned helper generation');write(d.workspace,connectionPath(d.registry,record.panel_id),{...current,status:'closed',closed_utc:new Date().toISOString()});}
 };
}
export function prepareOwnedPanelRegistration({workspace,panel_id}:{workspace:string;panel_id:string}):OwnedRegistration{
 const d=dirs(workspace);if(!id(panel_id))throw new Error('Invalid owned panel_id');return withWorkspaceMetadataGate(d.workspace,()=>{const file=connectionPath(d.registry,panel_id),previous=existsSync(file)?readOwnedPanelConnection(workspace,panel_id):undefined;
 if(previous){assertOwnedPanelStopped(previous);readOwnedPanelCheckpoint(workspace,previous);}
 const helper=randomBytes(16).toString('hex'),nonce=randomBytes(32).toString('hex'),lock=path.join(d.registry,'panels',panel_id+'.lock');
 if(existsSync(lock)){
  if(!previous||previous.schema_version!==2)throw Object.assign(new Error('EEXIST: an unlaunched helper claim is retained; no published stopped helper can qualify it'),{code:'EEXIST'});
  const claim=json(lock,d.registry,4096),registrationFile=path.join(d.registry,'registrations',previous.helper_session_id+'.json');
  if(claim.schema_version!==1||claim.panel_id!==panel_id||claim.helper_session_id!==previous.helper_session_id||typeof claim.nonce!=='string'||!/^[a-f0-9]{64}$/.test(claim.nonce)||Object.keys(claim).some(key=>!['schema_version','panel_id','helper_session_id','nonce'].includes(key)))throw Object.assign(new Error('EEXIST: unpublished or foreign helper claim retained without replacement'),{code:'EEXIST'});
  const registered=json(registrationFile,d.registry,16384);
  if(registered.schema_version!==1||registered.workspace!==d.workspace||registered.panel_id!==panel_id||registered.helper_session_id!==previous.helper_session_id||registered.generation!==previous.generation||registered.nonce!==claim.nonce||registered.journal!==path.dirname(previous.checkpoint_file!))throw new Error('Published helper claim does not match its original exact registration; retained');
  // Recheck the same connection/checkpoint under the short metadata gate. This
  // archives only a claim already published as the stopped previous helper;
  // an unlaunched/newer claim is never inferred safe from PID disappearance.
  if(JSON.stringify(readOwnedPanelConnection(workspace,panel_id))!==JSON.stringify(previous))throw new Error('Previous helper connection changed during recovery');assertOwnedPanelStopped(previous);readOwnedPanelCheckpoint(workspace,previous);
  renameSync(ordinaryWorkspaceMetadataTarget(d.workspace,lock),ordinaryWorkspaceMetadataTarget(d.workspace,path.join(d.registry,'registrations','stopped-published-lock-'+previous.helper_session_id+'-'+randomBytes(8).toString('hex')+'.json')));
 }
 const record:RegistrationRecord={schema_version:1,workspace:d.workspace,panel_id,helper_session_id:helper,generation:previous?(previous.generation!+1):1,journal:path.join(d.workspace,'panel-journals',helper),nonce,...(previous?{previous,checkpoint_sha256:createHash('sha256').update(readFileSync(previous.checkpoint_file!)).digest('hex')}:{})};
 write(d.workspace,lock,{schema_version:1,panel_id,helper_session_id:helper,nonce},true);
 const registrationFile=path.join(d.registry,'registrations',helper+'.json');write(d.workspace,registrationFile,record,true);ordinaryWorkspaceMetadataDirectory(d.workspace,'panel-journals');mkdirSync(record.journal,{recursive:false});return materialize(registrationFile,record,true);});
}
export function loadOwnedPanelRegistration(workspace:string,file:string):OwnedRegistration{
 const d=dirs(workspace);const v=json(file,d.registry,16384) as RegistrationRecord;
 if(v.schema_version!==1||v.workspace!==d.workspace||!id(v.panel_id)||!id(v.helper_session_id)||!Number.isSafeInteger(v.generation)||v.generation<1||typeof v.nonce!=='string'||!/^[a-f0-9]{64}$/.test(v.nonce)||path.resolve(file)!==path.join(d.registry,'registrations',v.helper_session_id+'.json')||v.journal!==path.join(d.workspace,'panel-journals',v.helper_session_id))throw new Error('Invalid internal owned helper registration');
 const claim=json(path.join(d.registry,'panels',v.panel_id+'.lock'),d.registry,4096);
 if(claim.schema_version!==1||claim.panel_id!==v.panel_id||claim.helper_session_id!==v.helper_session_id||claim.nonce!==v.nonce)throw new Error('Owned helper registration lock does not match');
 return materialize(file,v);
}
