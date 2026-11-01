// Opt-in real exported MCP/Python acceptance. Only the new disposable helper
// created by this run is interrupted; scientific journals are never edited.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const text=(value:unknown):string=>{assert.equal(typeof value,'string');return value as string;};
const list=(value:unknown):Row[]=>{assert.ok(Array.isArray(value));return value.map(row);};
const json=(file:string)=>row(JSON.parse(readFileSync(file,'utf8')));
const digest=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const root=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'registered-panel-recovery-'));
const inspectorBaseline=process.env.MICROSCOPY_INSPECTOR_RECOVERY_BASELINE;
if(inspectorBaseline&&(!path.isAbsolute(inspectorBaseline)||!existsSync(path.join(inspectorBaseline,'report.json'))))throw Error('MICROSCOPY_INSPECTOR_RECOVERY_BASELINE must name a completed registered-helper acceptance');
const qualifiedScience=process.env.MICROSCOPY_PANEL_RECOVERY_SCIENCE;
if(qualifiedScience&&(!path.isAbsolute(qualifiedScience)||!existsSync(path.join(qualifiedScience,'report.json'))))throw Error('MICROSCOPY_PANEL_RECOVERY_SCIENCE must name an existing qualified public science run');
const scienceDirectory=inspectorBaseline?text(json(path.join(inspectorBaseline,'report.json')).science_directory):qualifiedScience??path.join(directory,'science'),started=performance.now();
const report:Row={schema_version:1,scope:'Real exported plugin MCP -> independent Python -> default registered owned Node Panel; public analytic synthetic data; controlled forced disposable-helper termination',started_utc:new Date().toISOString(),checks:[],not_tested:['Normal helper exit','Interruption while a scientific worker is active','Actual MCP-process crash between resume submission and publication','Human/browser gestures','Real specimen, GMS, Mac/Linux process control']};
report.science_directory=scienceDirectory;report.science_fixture_mode=inspectorBaseline?'reuse_primary_qualified_public_science':qualifiedScience?'reuse_explicit_qualified_public_science':'fresh_actual_mcp_python_science';
const checks=report.checks as string[],calls:Row[]=[],clients:StdioImageClient[]=[];
let previousConfig:string|undefined,environmentChanged=false,helperToClean:Row|undefined;
const log=(message:string)=>console.log(message);
const files=(base:string):string[]=>existsSync(base)?readdirSync(base,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(base,entry.name)):[path.join(base,entry.name)]):[];
const snapshot=(roots:string[])=>Object.fromEntries(roots.flatMap(files).map(file=>[file,digest(file)]));
const unchanged=(saved:Record<string,string>)=>{for(const [file,hash] of Object.entries(saved))assert.equal(digest(file),hash,'Original file changed: '+file);};

// No shell-built filesystem/termination expression: all variable input is JSON
// on stdin. The stop script rechecks creation identity and exact stock CLI args.
function processControl(action:'inspect'|'stop',owned:Row):Row{
 assert.equal(process.platform,'win32','This acceptance has deliberately Windows-specific process control');
 const script=String.raw`
$ErrorActionPreference='Stop'
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$ownedHelperPid=[int]$request.pid
$candidate=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$ownedHelperPid)
if($null -eq $candidate){throw 'Owned helper process not found'}
if($candidate.Name -ne 'node.exe'){throw 'Owned helper is not Node'}
if([IO.Path]::GetFullPath($candidate.ExecutablePath) -ne [IO.Path]::GetFullPath($request.executable)){throw 'Node executable mismatch'}
if(-not ('OwnedArgv' -as [type])){Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class OwnedArgv {
 [DllImport("shell32.dll",SetLastError=true)]static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)]string s,out int n);
 [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr p);
 public static string[] Parse(string s){int n;var p=CommandLineToArgvW(s,out n);if(p==IntPtr.Zero)throw new Exception("Cannot parse Windows argv");try{var v=new string[n];for(int i=0;i<n;i++)v[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return v;}finally{LocalFree(p);}}
}
'@}
$actual=@([OwnedArgv]::Parse($candidate.CommandLine))
$expected=@($request.argv)
if($actual.Count -ne $expected.Count){throw 'Owned helper argument count mismatch'}
for($i=0;$i -lt $actual.Count;$i++){if($actual[$i] -cne $expected[$i]){throw ('Owned helper argument mismatch at '+$i)}}
$created=$candidate.CreationDate.ToUniversalTime().ToString('o')
if($request.action -eq 'stop'){
 if($created -cne $request.creation_utc){throw 'Owned helper creation identity changed'}
 Stop-Process -Id $ownedHelperPid -Force
}
[ordered]@{pid=$ownedHelperPid;creation_utc=$created;executable_verified=$true;exact_stock_argv_verified=$true;action=$request.action} | ConvertTo-Json -Compress
`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify({...owned,action}),encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message);return row(JSON.parse(result.stdout.trim()));
}

try{
 assert.equal(process.platform,'win32');
 if(inspectorBaseline)assert.equal(json(path.join(inspectorBaseline,'report.json')).result,'PASS');
 else if(qualifiedScience)assert.equal(json(path.join(qualifiedScience,'report.json')).result,'PASS');
 else{
 log('Creating fresh public science records using the existing manual-crystal acceptance tool.');
 const science=spawnSync(process.execPath,[path.join(root,'tools/smoke_manual_crystal.mjs')],{cwd:root,env:{...process.env,MICROSCOPY_SMOKE_OUTPUT:scienceDirectory},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:8*1024*1024});
 writeFileSync(path.join(directory,'science.stdout.log'),science.stdout??'');writeFileSync(path.join(directory,'science.stderr.log'),science.stderr??'');
 assert.equal(science.status,0,science.stderr||science.error?.message);
 }
 const baseline=json(path.join(scienceDirectory,'report.json'));assert.equal(baseline.result,'PASS');
 const references=row(baseline.references),images=path.join(scienceDirectory,'workspace','images'),structures=path.join(scienceDirectory,'workspace','structures'),python=text(json(path.join(scienceDirectory,'plugin-config.json')).python);
 previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=path.join(scienceDirectory,'plugin-config.json');environmentChanged=true;
 const makeClient=()=>{const client=new StdioImageClient({workspace:images,python,serverPath:path.join(root,'tools/plugin_server.mjs')});clients.push(client);return client;};
 const first=makeClient();await first.rpc('initialize');
 const catalog=list(row(row(await first.rpc('tools/list')).result).tools);
 for(const name of ['image_panel_open','image_panel_current','image_panel_evidence','image_panel_resume'])assert.ok(catalog.some(tool=>tool.name===name),'Formal tool missing: '+name);
 const call=async(name:string,args:Row,client=first)=>{
  const before=performance.now();let state='failed_or_unknown';
  appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before_dispatch',name,arguments:args})+'\n');
  log('MCP '+name+' '+(args.request_id??'read-only'));
  try{const reply=await client.tool(name,args);state='completed';return row(reply.data);}
  finally{calls.push({name,request_id:args.request_id??null,state,elapsed_ms:performance.now()-before});}
 };
 const refuse=async(name:string,args:Row,pattern:RegExp,client=first)=>{let message='';try{await call(name,args,client);}catch(error){message=error instanceof Error?error.message:String(error);}assert.match(message,pattern);return message;};
 const metadata=(workspace:string,id:string)=>json(path.join(workspace,'objects',id,'object.json'));
 const completed=(workspace:string)=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json')));
 const counts=()=>({fft:completed(images).filter(id=>metadata(images,id).kind==='fft').length,simulate:completed(structures).filter(id=>metadata(structures,id).kind==='simulate').length});
 assert.deepEqual(counts(),{fft:2,simulate:2});
 if(inspectorBaseline){
  report.scope='Actual stock researcher_inspector CLI registration -> formal exported MCP show/evidence -> controlled owned helper termination -> documented cold CLI reopen -> full evidence revalidation; previously fresh public science records reused byte-for-byte';
  const qualified=json(path.join(inspectorBaseline,'report.json')),originals=row(qualified.references),observationId=text(originals.observation_view_object_id),source=text(references.source_path),inspectorTool=path.join(root,'tools/researcher_inspector.mjs');
  const priorScience=snapshot([path.join(images,'objects'),path.join(images,'requests'),path.join(structures,'objects'),path.join(structures,'requests'),path.join(scienceDirectory,'fixture')]);
  const originalPanelId=text(originals.logical_panel_id),originalConnPath=path.join(images,'panel-registry','panels',originalPanelId+'.json'),unrelatedConnectionHash=digest(originalConnPath);
  const launchInspector=(arguments_:string[],label:string)=>{
   const args=[inspectorTool,...arguments_],child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',(chunk:Buffer)=>appendFileSync(path.join(directory,label+'.stdout.private.log'),chunk));
   child.stderr.on('data',(chunk:Buffer)=>appendFileSync(path.join(directory,label+'.stderr.log'),chunk));
   child.on('error',error=>appendFileSync(path.join(directory,label+'.stderr.log'),String(error)+'\n'));
   return {child,argv:[process.execPath,...args]};
  };
  const waitRegistered=async(child:ReturnType<typeof launchInspector>['child'],generation:number)=>{
   const before=performance.now();
   while(performance.now()-before<120000){
    if(child.exitCode!==null)throw Error('Actual Inspector exited before registration: '+child.exitCode);
    const sessionFile=path.join(images,'researcher-inspector','session.json');
    if(existsSync(sessionFile)){
     const session=json(sessionFile),connectionFile=path.join(images,'panel-registry','panels',text(session.session_id)+'.json');
     if(existsSync(connectionFile)){const connection=json(connectionFile);if(connection.generation===generation){assert.equal(connection.pid,child.pid);return {session,connection,connectionFile};}}
    }
    await pause(50);
   }
   throw Error('Actual Inspector registration remains unverified; do not automatically launch again');
  };
  const checkpointIdentity=(connection:Row,argv:string[])=>{
   const sessionId=text(connection.helper_session_id),descriptor=json(path.join(images,'panel-registry','registrations',sessionId+'.json'));
   assert.equal(descriptor.panel_id,connection.panel_id);assert.equal(descriptor.helper_session_id,sessionId);assert.equal(descriptor.generation,connection.generation);assert.equal(path.resolve(text(descriptor.workspace)),path.resolve(images));
   assert.equal(path.resolve(text(connection.checkpoint_file)),path.resolve(images,'panel-journals',sessionId,'current-selection.json'));
   const checkpoint=json(text(connection.checkpoint_file));assert.equal(checkpoint.panel_id,connection.panel_id);assert.equal(checkpoint.helper_session_id,sessionId);assert.equal(checkpoint.panel_generation,connection.generation);assert.equal(checkpoint.object_id,observationId);assert.equal(row(checkpoint.edit_state).dirty,false);assert.notEqual(row(checkpoint.last_operation??{}).state,'submitted');
   const identity={pid:connection.pid,executable:process.execPath,argv};return {...identity,...processControl('inspect',identity)};
  };
  const initialLaunch=launchInspector(['--source',source,'--workspace',images,'--python',python],'inspector-first');
  const initial=await waitRegistered(initialLaunch.child,1),panelId=text(initial.session.session_id);assert.notEqual(panelId,originalPanelId);assert.equal(initial.connection.panel_id,panelId);
  const initialCurrent=await call('image_panel_current',{panel_id:panelId}),initialView=row(initialCurrent.view);
  const showArgs={panel_id:panelId,object_id:observationId,expected_object_id:row(initialView.object).object_id,draft_revision:row(initialView.edit_state).draft_revision,request_id:'inspector-existing-observations'};
  const shown=await call('image_panel_show',showArgs),shownView=row(shown.view);assert.equal(row(shownView.object).object_id,observationId);
  const evidenceArgs={panel_id:panelId,comparison_object_id:references.comparison,observation_view_object_id:observationId,expected_object_id:observationId,draft_revision:row(shownView.edit_state).draft_revision,request_id:'inspector-evidence-before'};
  const attached=await call('image_panel_evidence',evidenceArgs);assert.equal(row(row(attached.view).crystal_evidence).currentness,'current');
  const initialIdentity=checkpointIdentity(initial.connection,initialLaunch.argv);helperToClean=initialIdentity;
  const oldCheckpointHash=digest(text(initial.connection.checkpoint_file)),oldConnectionHash=digest(initial.connectionFile),startupSnapshot=snapshot([path.join(images,'researcher-inspector','startup')]);
  const beforeCold=snapshot([path.join(images,'objects'),path.join(images,'requests'),path.join(structures,'objects'),path.join(structures,'requests'),path.join(images,'panel-registry','requests')]);
  const terminated=processControl('stop',initialIdentity);helperToClean=undefined;
  for(let i=0;i<100;i++){try{process.kill(Number(initial.connection.pid),0);await pause(30);}catch(error){if((error as {code?:string}).code==='ESRCH')break;throw error;}}
  assert.throws(()=>process.kill(Number(initial.connection.pid),0));
  await refuse('image_panel_current',{panel_id:panelId},/fetch failed|connect|ECONNREFUSED/);assert.equal(digest(initial.connectionFile),oldConnectionHash);
  const coldLaunch=launchInspector(['--workspace',images,'--python',python],'inspector-cold'),cold=await waitRegistered(coldLaunch.child,2);assert.equal(cold.session.session_id,panelId);assert.notEqual(cold.connection.pid,initial.connection.pid);assert.notEqual(cold.connection.helper_session_id,initial.connection.helper_session_id);
  const restored=await call('image_panel_current',{panel_id:panelId}),restoredView=row(restored.view);assert.equal(row(restoredView.object).object_id,observationId);assert.equal(row(restoredView.crystal_evidence).currentness,'unvalidated_snapshot');assert.equal(row(restoredView.crystal_evidence).attachment_status,'restored_unvalidated');
  const coldIdentity=checkpointIdentity(cold.connection,coldLaunch.argv);helperToClean=coldIdentity;unchanged(beforeCold);unchanged(startupSnapshot);assert.equal(digest(text(initial.connection.checkpoint_file)),oldCheckpointHash);
  const afterArgs={...evidenceArgs,draft_revision:row(restoredView.edit_state).draft_revision,request_id:'inspector-evidence-after'};
  const reattached=await call('image_panel_evidence',afterArgs);assert.equal(row(row(reattached.view).crystal_evidence).currentness,'current');
  const recoverySnapshot=snapshot([path.join(images,'objects'),path.join(images,'requests'),path.join(structures,'objects'),path.join(structures,'requests'),path.join(images,'panel-registry','requests')]),fresh=makeClient();await fresh.rpc('initialize');
  for(const reference of list(row(baseline.integrity).recovery)){const result=await call(reference.provider==='structure'?'structure_result':'image_result',{request_id:reference.request_id},fresh);assert.equal(result.object_id,reference.object_id);}
  const startup=path.join(images,'researcher-inspector','startup');
  for(const label of ['open','frame','preview']){const request=json(path.join(startup,label+'.request.json')),receipt=json(path.join(startup,label+'.response.json'));const result=await call('image_result',{request_id:row(request.arguments).request_id},fresh);assert.equal(result.object_id,receipt.object_id);}
  const originalShow=await call('image_panel_show',showArgs,fresh);assert.deepEqual(originalShow.view,shownView);
  const originalAttachment=await call('image_panel_evidence',evidenceArgs,fresh);assert.deepEqual(originalAttachment.view,attached.view);
  const finalAttachment=await call('image_panel_evidence',afterArgs,fresh);assert.deepEqual(finalAttachment.view,reattached.view);
  const finalCurrent=await call('image_panel_current',{panel_id:panelId},fresh);assert.equal(row(row(finalCurrent.view).crystal_evidence).currentness,'current');
  unchanged(priorScience);unchanged(beforeCold);unchanged(recoverySnapshot);unchanged(startupSnapshot);assert.equal(digest(text(initial.connection.checkpoint_file)),oldCheckpointHash);assert.equal(digest(originalConnPath),unrelatedConnectionHash);assert.deepEqual(counts(),{fft:2,simulate:2});
  checks.push('The actual default Inspector CLI, without injected provider/Panel ports, publishes its own session ID through the official registrar. Formal MCP current/show/evidence attaches saved scientific two-ROI evidence to this same Inspector.');
  checks.push('Only the exact verified disposable Inspector PID is force-terminated. The documented no-source cold reopen preserves logical Panel and exact saved scientific object, creates generation 2/new OS/helper identity, and restores only unvalidated evidence snapshot.');
  checks.push('A new full image_panel_evidence admission restores current; a fresh MCP client recovers all original science, Inspector startup and same-window presentation request objects. No FFT/simulation or old file changes; unrelated prior helper connection is untouched.');
  report.result='PASS';report.references={logical_panel_id:panelId,observation_view_object_id:observationId,source_frame:references.frame,calibrated_frame:references.calibrated_frame,ffts:references.ffts,comparison:references.comparison,show_request:showArgs.request_id,original_evidence_request:evidenceArgs.request_id,new_evidence_request:afterArgs.request_id};
  report.helpers={before:{...initialIdentity,argv:undefined,executable:undefined,helper_session_id:initial.connection.helper_session_id,generation:1},after:{...coldIdentity,argv:undefined,executable:undefined,helper_session_id:cold.connection.helper_session_id,generation:2},stop:{...terminated,classification:'controlled_forced_inspector_termination_at_idle_checkpoint',normal_exit:false}};
  report.integrity={science_counts:counts(),old_scientific_files_preserved:Object.keys(priorScience).length,cold_reopen_files_preserved:Object.keys(beforeCold).length,recovery_files_unchanged:Object.keys(recoverySnapshot).length,startup_files_preserved:Object.keys(startupSnapshot).length,original_checkpoint_sha256:oldCheckpointHash,independent_numeric:baseline.independent_numeric};
  report.stages={before:'current',after_cold_reopen:'unvalidated_snapshot',after_full_reattachment:'current'};
 }else{
 const rects=[[0,0,64,64],[64,0,128,64]];
 const overview=await call('image_info',{object_id:row(baseline.discovery).overview_object_id});assert.equal(overview.kind,'annotate');
 assert.equal(row(overview.xy_calibration).calibration_id,references.calibrated_frame);
 assert.deepEqual(row(row(overview.xy_calibration).xy_scale),row(row(baseline.discovery).xy_calibration).xy_scale);
 assert.deepEqual(list(overview.panels).map(panel=>[panel.source_object_id,panel.source_rect_xyxy]),[[references.frame,[0,0,128,64]]]);
 const priorInvalid=path.join(images,'requests','registered-observations.json');
 if(existsSync(priorInvalid)){
  const failed=json(priorInvalid),before=digest(priorInvalid);assert.equal(failed.state,'failed');assert.equal(row(failed.parameters).object_id,references.calibrated_frame);
  await refuse('image_result',{request_id:'registered-observations'},/INVALID_ARGUMENT.*annotate requires a rendered view/);
  assert.equal(digest(priorInvalid),before);report.retained_harness_failure={request_id:'registered-observations',state:'failed',queried_without_replay:true,sha256:before};
 }
 const annotations=rects.map((rect,i)=>({annotation_id:'registered-roi-'+(i+1),kind:'rectangle',coordinate_space:'source_pixels',source_object_id:references.frame,coordinates:rect,text:'ROI '+(i+1),note:'Public synthetic operator observation; material interpretation remains unconfirmed.',status:'hypothesized',presentation:{layer:'experimental'}}));
 const observationArgs={object_id:row(baseline.discovery).overview_object_id,annotations,request_id:'registered-observations-view'};
 const observation=await call('image_annotate',observationArgs);assert.equal(observation.backend,'external-image-workspace');
 const protectedScience=snapshot([path.join(images,'objects'),path.join(images,'requests'),path.join(structures,'objects'),path.join(structures,'requests'),path.join(scienceDirectory,'fixture')]);
 const openArgs={object_id:observation.object_id,request_id:'registered-open'};
 const opened=await call('image_panel_open',openArgs),panelId=text(opened.panel_id);
 const current=await call('image_panel_current',{panel_id:panelId}),view=row(current.view);
 assert.equal(row(view.object).object_id,observation.object_id);assert.equal(row(view.edit_state).dirty,false);
 assert.equal(list(row(current.roi_handoff).saved_rectangles).length,2);
 const evidenceArgs={panel_id:panelId,comparison_object_id:references.comparison,observation_view_object_id:observation.object_id,expected_object_id:row(view.object).object_id,draft_revision:row(view.edit_state).draft_revision,request_id:'registered-evidence-before'};
 const attached=await call('image_panel_evidence',evidenceArgs),attachedView=row(attached.view),envelope=row(attachedView.crystal_evidence);
 assert.equal(envelope.currentness,'current');assert.equal(envelope.attachment_status,'validated');assert.equal(row(envelope.payload).object_id,references.comparison);
 assert.deepEqual(list(row(envelope.payload).observations).map(value=>value.rect_xyxy),rects);
 checks.push('Fresh formal MCP/Python creates analytic source, signed XY calibration, two saved ROI supports, exactly two FFTs/two actual simulations; formal registered default helper fully admits the original comparison as current.');
 const connFile=path.join(images,'panel-registry','panels',panelId+'.json'),conn=()=>json(connFile),initial=conn();
 assert.equal(initial.schema_version,2);assert.equal(initial.panel_id,panelId);assert.equal(initial.generation,1);
 const checkOwnership=(connection:Row)=>{
  const helper=text(connection.helper_session_id),registrationFile=path.join(images,'panel-registry','registrations',helper+'.json'),registration=json(registrationFile);
  assert.equal(registration.panel_id,panelId);assert.equal(registration.helper_session_id,helper);assert.equal(registration.generation,connection.generation);assert.equal(path.resolve(text(registration.workspace)),path.resolve(images));
  assert.equal(path.resolve(text(connection.checkpoint_file)),path.resolve(images,'panel-journals',helper,'current-selection.json'));
  const checkpoint=json(text(connection.checkpoint_file));assert.equal(checkpoint.panel_id,panelId);assert.equal(checkpoint.helper_session_id,helper);assert.equal(checkpoint.panel_generation,connection.generation);assert.equal(checkpoint.object_id,observation.object_id);
  assert.equal(row(checkpoint.edit_state).dirty,false);assert.notEqual(row(checkpoint.last_operation??{}).state,'submitted');
  const owned={pid:connection.pid,executable:process.execPath,argv:[process.execPath,path.join(root,'tools/image_panel.mjs'),'--workspace',images,'--python',python,'--object',observation.object_id,'--owned-registration',registrationFile]};
  return {...owned,...processControl('inspect',owned)};
 };
 const originalIdentity=checkOwnership(initial);helperToClean=originalIdentity;
 const failedResumeArgs={panel_id:panelId,request_id:'registered-refuse-live'};
 const failedLive=await refuse('image_panel_resume',failedResumeArgs,/still present/);
 const panelRequests=path.join(images,'panel-registry','requests'),protectedReceipts=snapshot([panelRequests]);
 const oldConnectionHash=digest(connFile),oldCheckpointHash=digest(text(initial.checkpoint_file)),registrationCount=readdirSync(path.join(images,'panel-registry','registrations')).length;
 const stopped=processControl('stop',originalIdentity);helperToClean=undefined;
 for(let i=0;i<100;i++){try{process.kill(Number(initial.pid),0);await pause(30);}catch(error){if((error as {code?:string}).code==='ESRCH')break;throw error;}}
 assert.throws(()=>process.kill(Number(initial.pid),0));
 await refuse('image_panel_open',openArgs,/fetch failed|connect|ECONNREFUSED/);
 await refuse('image_panel_current',{panel_id:panelId},/fetch failed|connect|ECONNREFUSED/);
 const failedAgain=await refuse('image_panel_resume',failedResumeArgs,/still present/);assert.equal(failedAgain,failedLive);
 assert.equal(digest(connFile),oldConnectionHash);assert.equal(digest(text(initial.checkpoint_file)),oldCheckpointHash);unchanged(protectedReceipts);
 assert.equal(readdirSync(path.join(images,'panel-registry','registrations')).length,registrationCount);
 checks.push('One verified disposable helper is force-terminated at an idle saved checkpoint. Original open/current fail without launching; a failed live-resume original ID remains failed after death, with connection/checkpoint/receipts unchanged.');
 const resumeArgs={panel_id:panelId,request_id:'registered-explicit-resume'};
 const resumed=await call('image_panel_resume',resumeArgs),resumedView=row(resumed.view),resumedEnvelope=row(resumedView.crystal_evidence),next=conn();
 assert.equal(resumed.panel_id,panelId);assert.equal(next.panel_id,panelId);assert.equal(next.generation,2);assert.notEqual(next.pid,initial.pid);assert.notEqual(next.helper_session_id,initial.helper_session_id);
 assert.equal(resumed.panel_generation,2);assert.equal(resumed.helper_session_id,next.helper_session_id);assert.equal(resumedView.helper_session_id,next.helper_session_id);assert.equal(resumedView.panel_generation,2);
 assert.equal(row(resumedView.object).object_id,observation.object_id);assert.equal(resumedEnvelope.attachment_status,'restored_unvalidated');assert.equal(resumedEnvelope.currentness,'unvalidated_snapshot');
 assert.equal(row(resumedEnvelope.payload).object_id,references.comparison);assert.deepEqual(list(row(resumedEnvelope.payload).observations).map(value=>value.rect_xyxy),rects);
 const nextIdentity=checkOwnership(next);helperToClean=nextIdentity;
 const reattachArgs={...evidenceArgs,expected_object_id:row(resumedView.object).object_id,draft_revision:row(resumedView.edit_state).draft_revision,request_id:'registered-evidence-after'};
 const reattached=await call('image_panel_evidence',reattachArgs),newEnvelope=row(row(reattached.view).crystal_evidence);
 assert.equal(newEnvelope.currentness,'current');assert.equal(newEnvelope.attachment_status,'validated');assert.equal(row(newEnvelope.payload).object_id,references.comparison);
 checks.push('Only explicit new saved resume ID creates generation 2/new OS PID and helper identity for the same logical Panel. Restored evidence is unvalidated_snapshot until a new full formal evidence admission restores current. No new scientific computation.');
 const beforeRecovery=snapshot([path.join(images,'objects'),path.join(images,'requests'),path.join(structures,'objects'),path.join(structures,'requests'),panelRequests]),fresh=makeClient();await fresh.rpc('initialize');
 const recovered:Row[]=[];
 for(const reference of list(row(baseline.integrity).recovery)){
  const result=await call(reference.provider==='structure'?'structure_result':'image_result',{request_id:reference.request_id},fresh);assert.equal(result.object_id,reference.object_id);recovered.push(reference);
 }
 const restoredObservation=await call('image_result',{request_id:observationArgs.request_id},fresh);assert.equal(restoredObservation.object_id,observation.object_id);
 const restoredOldEvidence=await call('image_panel_evidence',evidenceArgs,fresh);assert.equal(restoredOldEvidence.recovered,true);assert.deepEqual(restoredOldEvidence.view,attachedView);
 const restoredResume=await call('image_panel_resume',resumeArgs,fresh);assert.equal(restoredResume.recovered,true);assert.deepEqual(restoredResume.view,resumedView);assert.equal(row(row(restoredResume.view).crystal_evidence).currentness,'unvalidated_snapshot');
 const restoredNewEvidence=await call('image_panel_evidence',reattachArgs,fresh);assert.deepEqual(restoredNewEvidence.view,reattached.view);
 const liveAfterRecovery=await call('image_panel_current',{panel_id:panelId},fresh);assert.equal(row(row(liveAfterRecovery.view).crystal_evidence).currentness,'current');
 await refuse('image_panel_resume',failedResumeArgs,/still present/,fresh);
 const oldFailure=row(baseline.refusals),wrongRoiRequest=text(oldFailure.wrong_roi_original_request);
 const failedScientific=await refuse('image_result',{request_id:wrongRoiRequest},/DISCOVERY_SCOPE_MISMATCH/,fresh);assert.equal(failedScientific,oldFailure.wrong_roi);
 unchanged(protectedScience);unchanged(protectedReceipts);unchanged(beforeRecovery);assert.equal(digest(text(initial.checkpoint_file)),oldCheckpointHash);
 assert.deepEqual(counts(),{fft:2,simulate:2});assert.equal(conn().pid,next.pid);assert.equal(conn().helper_session_id,next.helper_session_id);
 const finalCheckpoint=json(text(next.checkpoint_file));assert.equal(row(finalCheckpoint.crystal_evidence).currentness,'current');
 checks.push('Fresh exported MCP client recovers all original science IDs, original attachment and immutable unvalidated resume receipts, while a separate current query remains fully validated. Original failed scientific/resume outcomes remain failed; every original science/receipt byte stays unchanged.');
 report.result='PASS';report.references={logical_panel_id:panelId,observation_view_object_id:observation.object_id,calibrated_frame:references.calibrated_frame,source_frame:references.frame,ffts:references.ffts,comparison:references.comparison,original_open_request:openArgs.request_id,original_evidence_request:evidenceArgs.request_id,failed_resume_request:failedResumeArgs.request_id,resume_request:resumeArgs.request_id,new_evidence_request:reattachArgs.request_id};
 report.helpers={before:{...originalIdentity,argv:undefined,executable:undefined,helper_session_id:initial.helper_session_id,generation:initial.generation},after:{...nextIdentity,argv:undefined,executable:undefined,helper_session_id:next.helper_session_id,generation:next.generation},stop:{...stopped,classification:'controlled_forced_helper_termination_at_idle_checkpoint',normal_exit:false}};
 report.integrity={science_counts:counts(),protected_science_files:Object.keys(protectedScience).length,protected_original_panel_receipts:Object.keys(protectedReceipts).length,recovery_files_unchanged:Object.keys(beforeRecovery).length,recovered_original_scientific_requests:recovered.length,original_checkpoint_sha256:oldCheckpointHash,source_sha256:row(baseline.oracle).source_sha256,independent_numeric:baseline.independent_numeric};
 report.stages={before:'current',after_resume:'unvalidated_snapshot',after_full_reattachment:'current',original_resume_receipt_after_full_reattachment:'unvalidated_snapshot'};
 }
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);throw error;}
finally{
 // Cleanup is also restricted to the exact currently-owned disposable process.
 if(helperToClean){try{processControl('stop',helperToClean);report.cleanup={result:'PASS',classification:'controlled_forced_owned_test_helper_cleanup',pid:helperToClean.pid};}catch(error){report.cleanup={result:'HOLD',pid:helperToClean.pid,error:error instanceof Error?error.message:String(error)};}}
 for(const client of clients)await client.close();
 if(environmentChanged){if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;}
 report.calls=calls;report.runtime_ms=performance.now()-started;report.completed_utc=new Date().toISOString();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');log(String(report.result)+': retained at '+path.join(directory,'report.json'));
}
