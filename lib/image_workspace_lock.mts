// Cross-process admission for the existing provider. This is an execution lock,
// not the GUI's working-state owner and not another scientific journal.
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,realpathSync,unlinkSync,writeFileSync} from 'node:fs';
import {withWorkspaceMetadataGate} from './workspace_metadata_gate.mjs';
interface Claim {schema_version:1;nonce:string;request_id:string;pid:number;}
function file(workspace:string,create=true){if(!path.isAbsolute(workspace))throw new Error('Absolute provider workspace required');if(create)mkdirSync(workspace,{recursive:true});return path.join(realpathSync.native(workspace),'provider-execution.lock');}
function read(target:string):Claim {const value=JSON.parse(readFileSync(target,'utf8')) as Claim;if(value.schema_version!==1||!/^[a-f0-9]{32}$/.test(value.nonce)||typeof value.request_id!=='string'||value.request_id.length>128||!Number.isSafeInteger(value.pid)||value.pid<1)throw new Error('Invalid provider execution lock; keep it for diagnosis');return value;}
export function acquireImageWorkspaceWrite(workspace:string,requestId:unknown){
 const target=file(workspace);if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(requestId))throw new Error('Provider mutation needs its original valid request_id');
 const claim:Claim={schema_version:1,nonce:randomBytes(16).toString('hex'),request_id:requestId,pid:process.pid};let fd:number;
 withWorkspaceMetadataGate(workspace,()=>{try{fd=openSync(target,'wx');}catch(error){if((error as {code?:string}).code==='EEXIST'){const prior=read(target);throw Object.assign(new Error('Provider is owned by an admitted operation; query original request_id='+prior.request_id+'. This new operation was not submitted.'),{code:'WORKSPACE_WRITE_CONFLICT',original_request_id:prior.request_id,submission_state:'not_submitted'});}throw error;}try{writeFileSync(fd,JSON.stringify(claim));fsyncSync(fd);}finally{closeSync(fd);}});
 let released=false;return {release(){if(released)return;withWorkspaceMetadataGate(workspace,()=>{if(!existsSync(target)){released=true;return;}const actual=read(target);if(actual.nonce!==claim.nonce)return;unlinkSync(target);released=true;});}};
}
// Call only after a provider-qualified completed result for this exact request.
// PID disappearance alone never proves a request did not execute or release it.
export function releaseCompletedImageWorkspaceWrite(workspace:string,requestId:unknown){const target=file(workspace,false);if(!existsSync(target))return;return withWorkspaceMetadataGate(workspace,()=>{if(!existsSync(target))return;const prior=read(target);if(prior.request_id===requestId)unlinkSync(target);});}
