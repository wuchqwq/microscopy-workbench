// Opt-in cold HELPER-PROCESS acceptance over an explicitly supplied saved public
// workspace. This is not a product restart/registration API or a science runner.
// The public createImagePanel API is also used by researcher_inspector. Its
// unregistered/null panel_id remains an explicit formal-reattachment HOLD.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createWriteStream,existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {createImagePanel,StdioImageClient} from './image_panel.mjs';
import {restoreCrystalEvidenceSnapshot} from '../lib/panel_crystal_evidence.mjs';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const json=(file:string,max=4*1024*1024):Row=>{assert.ok(statSync(file).size<=max,'Input exceeds bounded acceptance JSON');return row(JSON.parse(readFileSync(file,'utf8')));};
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null,(_k,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===JSON.stringify(b??null,(_k,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const dependency=(value:unknown)=>value==null?null:Object.fromEntries(['calibration_id','revision','status','source','coordinate_domain','centre_revision_id'].filter(key=>row(value)[key]!==undefined).map(key=>[key,row(value)[key]]));
const outputJSON=(file:string,value:unknown)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const self=fileURLToPath(import.meta.url),runtimeRoot=fileURLToPath(new URL('../',import.meta.url));

function protectedFiles(workspace:string):Record<string,string>{
 const result:Record<string,string>={};let totalBytes=0;
 const visit=(directory:string)=>{if(!existsSync(directory))return;for(const entry of readdirSync(directory,{withFileTypes:true})){
  assert.ok(!entry.isSymbolicLink(),'Acceptance input cannot contain linked scientific records');const file=path.join(directory,entry.name);
  if(entry.isDirectory())visit(file);else if(entry.isFile()){totalBytes+=statSync(file).size;assert.ok(totalBytes<=512*1024*1024&&Object.keys(result).length<20000,'Acceptance workspace exceeds budget');result[path.relative(workspace,file)]=sha(file);}
 }};
 for(const provider of ['images','structures'])for(const namespace of ['objects','requests'])visit(path.join(workspace,provider,namespace));
 return result;
}

async function childHelper(paramsFile:string){
 const params=json(paramsFile);assert.ok(typeof process.send==='function','Owned helper requires the private parent IPC channel');
 const token=String(params.owner_nonce);let panel:Awaited<ReturnType<typeof createImagePanel>>|undefined,closing=false;
 const close=async()=>{if(closing)return;closing=true;try{await panel?.close();process.send?.({kind:'closed',owner_nonce:token,pid:process.pid,normal_close:true});process.disconnect?.();}catch(error){process.send?.({kind:'failed',owner_nonce:token,pid:process.pid,error:String(error)});process.exitCode=1;process.disconnect?.();}};
 process.on('message',message=>{const value=row(message);if(value.action==='close-owned-helper'&&value.owner_nonce===token&&value.expected_pid===process.pid)void close();});
 process.once('SIGINT',()=>{void close();});
 try{
  process.env.MICROSCOPY_PLUGIN_CONFIG=String(params.config);
  const snapshot=json(String(params.snapshot));const client=new StdioImageClient({workspace:String(params.image_workspace),python:String(params.python),serverPath:String(params.server_path)});
  panel=await createImagePanel({workspace:String(params.image_workspace),python:String(params.python),object_id:String(params.object_id),client,journalDirectory:String(params.journal),crystal_evidence_snapshot:snapshot});
  // No panel_id override or custom registry assembly: exercise the public API.
  process.send?.({kind:'ready',owner_nonce:token,pid:process.pid,url:panel.url,journal:panel.journal,state:panel.state()});
 }catch(error){process.send?.({kind:'failed',owner_nonce:token,pid:process.pid,error:String(error)});process.exitCode=1;await close();}
}

interface OwnedHelper {child:ChildProcess;ready:Row;nonce:string;exit:Promise<{code:number|null;signal:string|null}>;}
async function startOwned(params:Row,directory:string):Promise<OwnedHelper>{
 mkdirSync(directory,{recursive:true});const nonce=randomBytes(16).toString('hex'),paramsFile=path.join(directory,'params.json');outputJSON(paramsFile,{...params,owner_nonce:nonce,journal:path.join(directory,'journal')});
 const child=spawn(process.execPath,[self,'--owned-helper',paramsFile],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 child.stdout!.pipe(createWriteStream(path.join(directory,'stdout.log'),{flags:'wx'}));child.stderr!.pipe(createWriteStream(path.join(directory,'stderr.log'),{flags:'wx'}));
 const exit=new Promise<{code:number|null;signal:string|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const ready=await new Promise<Row>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Owned helper readiness timed out; no kill/restart was attempted')),120000);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Owned helper exited before readiness: '+code));});child.on('message',message=>{const value=row(message);if(value.owner_nonce!==nonce||value.pid!==child.pid)return;if(value.kind==='ready'){clearTimeout(timeout);resolve(value);}else if(value.kind==='failed'){clearTimeout(timeout);reject(Error(String(value.error)));}});});
 return {child,ready,nonce,exit};
}
async function normalClose(helper:OwnedHelper){
 assert.ok(helper.child.connected,'Only the dedicated owned helper may be closed');helper.child.send({action:'close-owned-helper',owner_nonce:helper.nonce,expected_pid:helper.child.pid});
 const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Normal owned helper close not verified; no force kill attempted')),30000);helper.exit.then(value=>{clearTimeout(timer);resolve(value);},reject);});
 assert.equal(result.code,0,'Normal helper exit must be zero');assert.equal(result.signal,null,'Signal termination is not normal .close() evidence');return {pid:helper.child.pid,...result,close_method:'dedicated parent IPC -> existing panel.close(); no force kill'};
}
function helperState(helper:OwnedHelper){const state=row(helper.ready.state),evidence=row(state.crystal_evidence);return {state,evidence};}

async function run(argv:readonly string[]){
 const options:Record<string,string|boolean>={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--keep-open'){options.keep=true;continue;}assert.ok(['--config','--snapshot','--output'].includes(key)&&argv[i+1], 'Usage: --config ABS_PUBLIC_PLUGIN_JSON --snapshot ABS_SAVED_PANEL_JSON --output NEW_ABS_DIRECTORY [--keep-open]');assert.equal(options[key],undefined);options[key]=argv[++i];}
 for(const key of ['--config','--snapshot','--output'])assert.ok(typeof options[key]==='string'&&path.isAbsolute(options[key] as string),'Explicit absolute '+key+' required');
 if(options.keep)assert.equal(process.stdin.isTTY,true,'--keep-open requires an interactive TTY; rerun with tty=true or omit it for automatic normal close');
 const output=String(options['--output']);assert.ok(!existsSync(output),'Use a new output directory; old evidence is never overwritten');mkdirSync(output,{recursive:true});
 const configFile=String(options['--config']),config=json(configFile),raw=json(String(options['--snapshot'])),view=raw.view?row(raw.view):raw;
 const envelope=restoreCrystalEvidenceSnapshot(view.crystal_evidence??raw.crystal_evidence??raw);assert.ok(envelope,'A saved evidence snapshot is required');
 const objectId=String(row(view.object??{object_id:envelope.attached_object_id}).object_id),workspace=String(config.workspace_root),python=String(config.python),imageWorkspace=path.join(workspace,'images'),server=path.join(runtimeRoot,'tools','plugin_server.mjs');
 assert.ok(path.isAbsolute(workspace)&&path.isAbsolute(python)&&existsSync(server),'Built standalone runtime and explicit independent environment required');
 const snapshotFile=path.join(output,'input-evidence-snapshot.json');outputJSON(snapshotFile,envelope);
 const before=protectedFiles(workspace);outputJSON(path.join(output,'protected-before.json'),before);
 const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=configFile;
 let first:OwnedHelper|undefined,second:OwnedHelper|undefined;let secondClosed=false;
 const protocol=new StdioImageClient({workspace:imageWorkspace,python,serverPath:server});
 try{
  await protocol.rpc('initialize');
  const source=(await protocol.tool('image_info',{object_id:objectId})).data as Row;assert.ok(source.object_id===objectId,'Selected saved scientific object differs');
  const saved=await protocol.tool('image_info',{object_id:objectId});assert.ok(typeof saved.png==='string'&&!['frame','calibration','tiff_source','dm_source'].includes(String(row(saved.data).kind)),'Use an existing saved PNG view; acceptance never creates a preview');
  const full=(await protocol.tool('structure_info',{object_id:envelope.payload.object_id})).data as Row;assert.equal(full.object_id,envelope.payload.object_id);assert.equal(full.kind,'crystal_evidence');assert.equal(full.request_id,envelope.payload.request_id);
  const binding=row(full.source_binding);assert.equal(binding.frame_object_id,envelope.payload.source.frame_object_id);assert.ok(same(binding.calibration_dependency,envelope.payload.source.calibration_dependency));assert.ok(same(dependency(source.xy_calibration),binding.calibration_dependency));
  const frame=(await protocol.tool('image_info',{object_id:String(binding.frame_object_id)})).data as Row;assert.equal(row(frame.files_sha256)['data.npy'],binding.source_array_sha256);
  const sourceFile=String(row(frame.source_identity).path),sourceHashBefore=sha(sourceFile);assert.equal(sourceHashBefore,row(frame.source_identity).sha256);
  const params={config:configFile,image_workspace:imageWorkspace,python,server_path:server,object_id:objectId,snapshot:snapshotFile};
  first=await startOwned(params,path.join(output,'first-helper'));const initial=helperState(first);assert.equal(initial.state.panel_id,null);assert.equal(initial.evidence.attachment_status,'restored_unvalidated');assert.equal(initial.evidence.currentness,'unvalidated_snapshot');
  const closed=await normalClose(first);const selected=json(path.join(String(first.ready.journal),'current-selection.json'));assert.equal(selected.object_id,objectId);assert.equal(row(row(selected.crystal_evidence).payload).image_png_base64,undefined);
  assert.equal(row(row(selected.crystal_evidence).payload).object_id,envelope.payload.object_id);assert.deepEqual(protectedFiles(workspace),before);
  const persisted=path.join(output,'persisted-evidence-snapshot.json');outputJSON(persisted,selected.crystal_evidence);
  second=await startOwned({...params,snapshot:persisted},path.join(output,'second-helper'));assert.notEqual(second.child.pid,first.child.pid,'A cold reopen must be a distinct process');
  const reopened=helperState(second);assert.equal(reopened.state.panel_id,null);assert.equal(row(reopened.state.object).object_id,objectId);assert.equal(reopened.evidence.currentness,'unvalidated_snapshot');assert.equal(reopened.evidence.attachment_status,'restored_unvalidated');assert.ok(same(row(reopened.evidence.payload).source,envelope.payload.source));
  const query=(await protocol.tool('structure_result',{request_id:envelope.payload.request_id})).data as Row;assert.equal(query.object_id,envelope.payload.object_id);
  assert.deepEqual(protectedFiles(workspace),before);assert.equal(sha(sourceFile),sourceHashBefore);
  const report:Row={schema_version:1,scope:'Actual public createImagePanel API cold helper-process close/reopen; same API is used by inspector, not ordinary registered MCP helper restart',result:'PASS_SAFE_COLD_SNAPSHOT_RESTORE_WITH_READMISSION_HOLD',normal_first_close:closed,second_helper:{pid:second.child.pid,distinct_process:true,panel_id:null,attachment_status:reopened.evidence.attachment_status,currentness:reopened.evidence.currentness},full_structure_info_readmission:'PASS exact saved comparison/source/frame/calibration; this does not attach it to the unregistered helper',original_structure_request_recovered:true,ordinary_formal_panel_attachment:'HOLD_UNREGISTERED_PANEL',hold_reason:'Public createImagePanel/researcher_inspector helper has null panel_id and no owned PanelManager registration; no private registry was forged and no product registration API was added',source_file_unchanged:true,scientific_and_request_files_unchanged:Object.keys(before).length,object_id:objectId,comparison_object_id:envelope.payload.object_id,comparison_request_id:envelope.payload.request_id,source_frame_object_id:binding.frame_object_id,source_array_sha256:binding.source_array_sha256,calibration_dependency:binding.calibration_dependency,new_scientific_objects:0,new_fft:0,not_tested:['ordinary registered-MCP cold helper recovery','browser gestures in this runner','human usability','Mac desktop']};
  const reportFile=path.join(output,'report.json');outputJSON(reportFile,report);outputJSON(path.join(output,'browser-handoff.json'),{url:second.ready.url,pid:second.child.pid,object_id:objectId,comparison_object_id:envelope.payload.object_id,report:reportFile,scope:'Dedicated second helper only; safe unvalidated snapshot, not a current scientific qualification'});
  console.log(JSON.stringify({result:report.result,report:reportFile,browser_handoff:path.join(output,'browser-handoff.json'),first_pid:first.child.pid,second_pid:second.child.pid,formal_attachment:'HOLD_UNREGISTERED_PANEL'}));
  if(options.keep){
   console.log('Dedicated second helper remains available for root browser validation. Send close-owned-helper on this runner stdin to close normally.');
   await new Promise<void>(resolve=>{
    let buffer='',finished=false;
    const finish=()=>{if(finished)return;finished=true;process.stdin.off('data',data);process.stdin.off('end',finish);process.stdin.off('error',finish);process.off('SIGINT',finish);process.stdin.pause();resolve();};
    const data=(chunk:string)=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const command=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);if(command==='close-owned-helper'){finish();return;}}};
    process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stdin.once('end',finish);process.stdin.once('error',finish);process.once('SIGINT',finish);
    if(process.stdin.readableEnded||process.stdin.destroyed)finish();else process.stdin.resume();
   });
  }
  const finalClose=await normalClose(second);secondClosed=true;outputJSON(path.join(output,'second-normal-close.json'),finalClose);assert.deepEqual(protectedFiles(workspace),before);console.log(JSON.stringify({second_normal_close:finalClose,result:'PASS normal close; public formal reattachment remains HOLD'}));
 }finally{
  await protocol.close();if(first?.child.connected)await normalClose(first);if(second?.child.connected&&!secondClosed)await normalClose(second);
  if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
 }
}

if(isDirectInvocation(import.meta.url)){
 if(process.argv[2]==='--owned-helper')void childHelper(process.argv[3]);
 else void run(process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
}
