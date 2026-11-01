// Private owned-helper metadata only. Scientific records remain authoritative in
// their providers; a checkpoint is never an admission of its saved evidence.
import {randomBytes,createHash} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import type {OwnedPanelConnection} from './panel_manager_contracts.mjs';

type Row=Record<string,unknown>;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const row=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid owned Panel record');return v as Row;};
function write(file:string,value:unknown,exclusive=false){const target=exclusive?file:file+'.'+randomBytes(8).toString('hex')+'.tmp',fd=openSync(target,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}if(!exclusive)renameSync(target,file);}
function dirs(workspace:string){if(!path.isAbsolute(workspace))throw new Error('Owned Panel requires absolute workspace');mkdirSync(path.join(workspace,'panel-registry','panels'),{recursive:true});mkdirSync(path.join(workspace,'panel-registry','registrations'),{recursive:true});mkdirSync(path.join(workspace,'panel-journals'),{recursive:true});return {workspace:realpathSync.native(workspace),registry:realpathSync.native(path.join(workspace,'panel-registry'))};}
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
}
function materialize(file:string,record:RegistrationRecord):OwnedRegistration{
 const d=dirs(record.workspace),lock=path.join(d.registry,'panels',record.panel_id+'.lock');
 const ownLock=()=>{const claim=json(lock,d.registry,4096);if(claim.nonce!==record.nonce||claim.helper_session_id!==record.helper_session_id)throw new Error('Owned helper registration lock does not match');};
 let checkpoint:Row|null=null;
 if(record.previous){checkpoint=readOwnedPanelCheckpoint(record.workspace,record.previous);const digest=createHash('sha256').update(readFileSync(record.previous.checkpoint_file!)).digest('hex');if(digest!==record.checkpoint_sha256)throw new Error('Owned checkpoint changed after explicit resume submission');}
 return {panel_id:record.panel_id,helper_session_id:record.helper_session_id,generation:record.generation,journalDirectory:record.journal,registration_file:file,owner_nonce:record.nonce,checkpoint,previousCheckpoint:checkpoint,previousConnection:record.previous??null,
  publish(panel){ownLock();const state=row(panel.state());if(state.panel_id!==record.panel_id||state.helper_session_id!==record.helper_session_id||state.panel_generation!==record.generation)throw new Error('Actual created helper does not match owned registration');
   const currentFile=connectionPath(d.registry,record.panel_id);if(record.previous){const old=readOwnedPanelConnection(record.workspace,record.panel_id);if(JSON.stringify(old)!==JSON.stringify(record.previous))throw new Error('Previous owned connection changed during resume');assertOwnedPanelStopped(old);}else if(existsSync(currentFile))throw new Error('Owned Panel already registered');
   const checkpointFile=path.join(record.journal,'current-selection.json');const saved=json(checkpointFile,d.workspace);if(saved.panel_id!==record.panel_id||saved.helper_session_id!==record.helper_session_id||saved.panel_generation!==record.generation)throw new Error('New helper persisted checkpoint identity mismatch');
   const port=(panel.server.address() as {port?:number}|null)?.port;const conn=validateOwnedConnection({schema_version:2,panel_id:record.panel_id,helper_session_id:record.helper_session_id,generation:record.generation,port,token:panel.token,evidence_token:panel.evidenceToken,pid:process.pid,checkpoint_file:checkpointFile,status:'running'},record.panel_id);write(currentFile,conn);unlinkSync(lock);
  },
  async close(panel){await panel.close();const current=readOwnedPanelConnection(record.workspace,record.panel_id);if(current.schema_version!==2||current.helper_session_id!==record.helper_session_id||current.generation!==record.generation||current.pid!==process.pid)throw new Error('Cannot close a different owned helper generation');write(connectionPath(d.registry,record.panel_id),{...current,status:'closed',closed_utc:new Date().toISOString()});}
 };
}
export function prepareOwnedPanelRegistration({workspace,panel_id}:{workspace:string;panel_id:string}):OwnedRegistration{
 const d=dirs(workspace);if(!id(panel_id))throw new Error('Invalid owned panel_id');const file=connectionPath(d.registry,panel_id),previous=existsSync(file)?readOwnedPanelConnection(workspace,panel_id):undefined;
 if(previous){assertOwnedPanelStopped(previous);readOwnedPanelCheckpoint(workspace,previous);}
 const helper=randomBytes(16).toString('hex'),nonce=randomBytes(32).toString('hex'),lock=path.join(d.registry,'panels',panel_id+'.lock');
 const record:RegistrationRecord={schema_version:1,workspace:d.workspace,panel_id,helper_session_id:helper,generation:previous?(previous.generation!+1):1,journal:path.join(d.workspace,'panel-journals',helper),nonce,...(previous?{previous,checkpoint_sha256:createHash('sha256').update(readFileSync(previous.checkpoint_file!)).digest('hex')}:{})};
 write(lock,{schema_version:1,panel_id,helper_session_id:helper,nonce},true);
 const registrationFile=path.join(d.registry,'registrations',helper+'.json');write(registrationFile,record,true);mkdirSync(record.journal,{recursive:false});return materialize(registrationFile,record);
}
export function loadOwnedPanelRegistration(workspace:string,file:string):OwnedRegistration{
 const d=dirs(workspace);const v=json(file,d.registry,16384) as RegistrationRecord;
 if(v.schema_version!==1||v.workspace!==d.workspace||!id(v.panel_id)||!id(v.helper_session_id)||!Number.isSafeInteger(v.generation)||v.generation<1||typeof v.nonce!=='string'||!/^[a-f0-9]{64}$/.test(v.nonce)||path.resolve(file)!==path.join(d.registry,'registrations',v.helper_session_id+'.json')||v.journal!==path.join(d.workspace,'panel-journals',v.helper_session_id))throw new Error('Invalid internal owned helper registration');return materialize(file,v);
}
