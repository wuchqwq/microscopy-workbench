// A short, synchronous gate protects lock-file compare/remove/admit sequences.
// It never surrounds scientific work. An interrupted gate stays fail-closed;
// PID disappearance is not used as permission to replay a scientific request.
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {openSync,closeSync,writeFileSync,fsyncSync,unlinkSync,mkdirSync,realpathSync} from 'node:fs';
const waiter=new Int32Array(new SharedArrayBuffer(4));
export function withWorkspaceMetadataGate<T,>(workspace:string,run:()=>T):T {
 if(!path.isAbsolute(workspace))throw new Error('Absolute workspace metadata root required');mkdirSync(workspace,{recursive:true});const file=path.join(realpathSync.native(workspace),'workspace-metadata.lock');let fd:number|undefined;
 for(let attempt=0;attempt<40;attempt++){
  try{fd=openSync(file,'wx');break;}catch(error){if((error as {code?:string}).code!=='EEXIST')throw error;if(attempt<39)Atomics.wait(waiter,0,0,5);}
 }
 if(fd===undefined)throw Object.assign(new Error('Workspace metadata admission is busy or interrupted; existing scientific requests remain query-only'),{code:'WORKSPACE_METADATA_BUSY',submission_state:'not_submitted'});
 try{writeFileSync(fd,JSON.stringify({schema_version:1,nonce:randomBytes(16).toString('hex'),pid:process.pid}));fsyncSync(fd);return run();}finally{closeSync(fd);unlinkSync(file);}
}
