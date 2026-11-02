// Actual formal MCP + saved Python + registered Panel protocol. No browser/model.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';
import {redactInterventionLog} from './qualify_route_a_intervention.mjs';
import {observationReadback} from '../ui/image-panel/observation-contract.mjs';
import type {PanelRoiSnapshot} from '../ui/image-panel/roi-observations.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const string=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const json=(f:string)=>row(JSON.parse(readFileSync(f,'utf8'))),hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const dump=(f:string,v:unknown)=>writeFileSync(f,JSON.stringify(redactInterventionLog(v),null,2)+'\n');
const runtime=fileURLToPath(new URL('../',import.meta.url)),directory=process.env.MICROSCOPY_SMOKE_OUTPUT,python=process.env.MICROSCOPY_PYTHON;
assert.ok(directory&&path.isAbsolute(directory)&&!existsSync(directory),'Set new absolute MICROSCOPY_SMOKE_OUTPUT');assert.ok(python&&path.isAbsolute(python),'Use explicit locked MICROSCOPY_PYTHON');mkdirSync(directory,{recursive:true});
const source=path.join(directory,'public.tiff'),workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images'),config=path.join(directory,'config.json');
const generated=spawnSync(python,['-B','-c','import numpy as np,tifffile,sys;tifffile.imwrite(sys.argv[1],np.arange(64*64,dtype=np.float32).reshape(64,64),metadata=None)',source],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
dump(config,{schema_version:1,python,workspace_root:workspaceRoot,structures:false});
const oldConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const client=new StdioImageClient({workspace,python,serverPath:path.join(runtime,'tools/plugin_server.mjs')}),clients=[client];
const report:Row={scope:'Actual formal MCP and registered Panel protocol; test_operator_protocol_simulation, no human-author claim',GUI:'NOT_TESTED',model:'NOT_TESTED',source_sha256:hash(source),checks:[]};
const checks=report.checks as string[],runTag=createHash('sha256').update(directory).digest('hex').slice(0,10);let serial=0,panelPid:number|undefined;
const call=async(name:string,args:Row={},transport=client)=>{
 const parameters=['image_info','image_result','image_panel_current'].includes(name)?args:{request_id:'resumable-'+runTag+'-'+(++serial),...args};
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before',name,arguments:parameters})+'\n');
 try{const data=row((await transport.tool(name,parameters)).data);appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify(redactInterventionLog({phase:'after',name,data}))+'\n');return data;}catch(e){appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'error',name,error:(e as Error).message,replay:false})+'\n');throw e;}
};
const files=(d:string):string[]=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):e.isFile()?[path.join(d,e.name)]:[]);
// Original science is immutable; the operational current-owner index may advance.
const inventory=(d:string)=>Object.fromEntries(['objects','requests'].flatMap(n=>files(path.join(d,n))).map(f=>[f,hash(f)]));
const unchanged=(old:Record<string,string>)=>{for(const [f,h]of Object.entries(old))assert.equal(hash(f),h,f);};
try{
 await client.rpc('initialize');const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0}),view=await call('image_preview',{object_id:frame.object_id,max_size:128});
 const sourceHistory=inventory(workspace),input={annotation_id:'test-operator-roi',purpose:'resumable_observation',selection_origin:'unspecified',kind:'rectangle',status:'hypothesized',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[8,8,40,40],note:'test_operator_protocol_simulation: inspect this supplied support; not a browser gesture or known material truth.'};
 for(const patch of [{annotation_id:undefined},{selection_origin:undefined},{note:'😀'.repeat(501)}]){
  const bad={...input,...patch};for(const key of Object.keys(bad))if(bad[key as keyof typeof bad]===undefined)delete bad[key as keyof typeof bad];
  const request_id='resumable-invalid-'+(++serial);await assert.rejects(call('image_annotate',{object_id:view.object_id,request_id,annotations:[bad]}),/not_submitted/);assert.equal(existsSync(path.join(workspace,'requests',request_id+'.json')),false);
 }
 checks.push('Required stable ID/origin and 1002 UTF-16 note rejected before worker journal; no truncation or replay.');
 const saved=await call('image_annotate',{object_id:view.object_id,annotations:[input]}),savedHistory=inventory(workspace);assert.equal(row((saved.annotations as unknown[])[0]).selection_origin,'unspecified');
 const panel=await call('image_panel_open',{object_id:saved.object_id});const panelId=string(panel.panel_id),connection=json(path.join(workspace,'panel-registry','panels',panelId+'.json'));panelPid=Number(connection.pid);
 let current=await call('image_panel_current',{panel_id:panelId});
 const expected={object_id:string(saved.object_id),annotation_id:input.annotation_id,source_object_id:string(frame.object_id),coordinates:input.coordinates,note:input.note,selection_origin:'unspecified',xy_calibration:null};
 assert.equal(observationReadback(row(current.view) as unknown as PanelRoiSnapshot,expected).ready,true);
 const rectangle=row((row(current.roi_handoff).saved_rectangles as unknown[])[0]);assert.equal(rectangle.purpose,input.purpose);assert.equal(rectangle.selection_origin_basis,'caller_reported_not_authenticated');
 // Test-operator calls the same Panel mark route; this is protocol simulation,
 // never a browser gesture or a researcher identity claim.
 const origin=`http://127.0.0.1:${connection.port}`,headers={'X-Panel-Token':string(connection.token),Origin:origin,'Content-Type':'application/json'};
 const selection={kind:'rectangle',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[42,8,60,40],panel:(row(row(current.view).object).panels as unknown[])[0]};
 const body={action:'mark',expected_object_id:saved.object_id,draft_revision:row(row(current.view).edit_state).draft_revision,
  params:{selection,annotation_id:'test-operator-second',purpose:'resumable_observation',selection_origin:'unspecified',note:'test_operator_protocol_simulation: second supplied support; no human author claim.'}};
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before',protocol:'Panel action; NOT_BROWSER',body})+'\n');
 const markedReply=await fetch(origin+'/api/action',{method:'POST',headers,body:JSON.stringify(body)}),marked=row(await markedReply.json());assert.equal(markedReply.status,200,JSON.stringify(marked));
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify(redactInterventionLog({phase:'after',protocol:'Panel action; NOT_BROWSER',data:marked}))+'\n');
 const kept=row((row(marked.object).annotations as unknown[])[0]);assert.equal(kept.purpose,input.purpose);assert.equal(kept.selection_origin,'unspecified');assert.equal(kept.observation_contract_version,1);assert.equal(kept.note,input.note);
 current=await call('image_panel_current',{panel_id:panelId});assert.equal((row(current.roi_handoff).saved_rectangles as unknown[]).length,2);
 checks.push('Actual Panel mark/originalMark replacement preserves the preceding observation intent, version, actor and scientific note. Protocol test uses unspecified, not researcher.');
 const styled=await call('image_annotate',{object_id:saved.object_id,updates:[{annotation_id:input.annotation_id,presentation:{label:{offset:[2,3]}}}]});
 const shown=await call('image_preview',{object_id:styled.object_id,gamma:1.2,max_size:256});assert.equal(row((shown.annotations as unknown[])[0]).selection_origin,'unspecified');
 const revised=await call('image_annotate',{object_id:shown.object_id,updates:[{annotation_id:input.annotation_id,coordinates:[9,8,41,40],selection_origin:'agent'}]});assert.equal(row((revised.annotations as unknown[])[0]).selection_origin,'agent');
 const changed=await call('image_annotate',{object_id:revised.object_id,updates:[{annotation_id:input.annotation_id,note:input.note+' Revised reason without an actor claim.'}]});assert.equal(row((changed.annotations as unknown[])[0]).selection_origin,'unspecified');
 const cv=row(current.view),draft=row(cv.edit_state);await call('image_panel_show',{panel_id:panelId,object_id:changed.object_id,expected_object_id:row(cv.object).object_id,draft_revision:draft.draft_revision});
 current=await call('image_panel_current',{panel_id:panelId});assert.equal(observationReadback(row(current.view) as unknown as PanelRoiSnapshot,{...expected,object_id:string(changed.object_id),coordinates:[9,8,41,40],note:input.note+' Revised reason without an actor claim.'}).ready,true);
 await assert.rejects(call('image_panel_show',{panel_id:panelId,object_id:saved.object_id,expected_object_id:saved.object_id,draft_revision:draft.draft_revision}),/stale/i);
 checks.push('Actual saved current handoff, sparse layout, reprojection, explicit actor, omitted actor on note revision and stale presentation guard pass.');
 unchanged(savedHistory);unchanged(sourceHistory);assert.equal(hash(source),report.source_sha256);
 const reconnected=new StdioImageClient({workspace,python,serverPath:path.join(runtime,'tools/plugin_server.mjs')});clients.push(reconnected);await reconnected.rpc('initialize');
 const recovered=await call('image_result',{request_id:saved.request_id},reconnected);assert.deepEqual(recovered.annotations,saved.annotations);unchanged(savedHistory);
 const unknownId='never-dispatched-observation';await assert.rejects(call('image_result',{request_id:unknownId},reconnected),/REQUEST_NOT_FOUND/);assert.equal(existsSync(path.join(workspace,'requests',unknownId+'.json')),false);
 checks.push('New-client original request recovery is exact; source/old arrays/manifests/journals unchanged; unknown request is queried only.');
 // A normal owned-helper close/reopen reads the existing checkpoint/object;
 // it must not create another scientific annotation or invent old actor fields.
 const beforeReopen=Object.fromEntries(['objects','requests'].flatMap(n=>files(path.join(workspace,n))).map(f=>[f,hash(f)]));
 process.kill(panelPid,'SIGTERM');panelPid=undefined;
 for(let attempt=0;attempt<100;attempt++){if(json(path.join(workspace,'panel-registry','panels',panelId+'.json')).status==='closed')break;await new Promise(resolve=>setTimeout(resolve,50));}
 assert.equal(json(path.join(workspace,'panel-registry','panels',panelId+'.json')).status,'closed');
 await call('image_panel_resume',{panel_id:panelId});const reopenedConnection=json(path.join(workspace,'panel-registry','panels',panelId+'.json'));panelPid=Number(reopenedConnection.pid);
 const reopened=await call('image_panel_current',{panel_id:panelId});assert.equal(row(row(reopened.view).object).object_id,changed.object_id);assert.deepEqual(row(row(reopened.view).object).annotations,changed.annotations);unchanged(beforeReopen);assert.deepEqual(Object.fromEntries(['objects','requests'].flatMap(n=>files(path.join(workspace,n))).map(f=>[f,hash(f)])),beforeReopen);
 checks.push('Normal owned Panel close/resume keeps exact annotation identity/origin and creates no new scientific records.');
 const legacy=process.env.MICROSCOPY_LEGACY_OBSERVATIONS;
 if(legacy){
  const old=json(path.join(legacy,'records.json')),before=json(path.join(legacy,'hashes.json'));
  for(const [f,h]of Object.entries(before))assert.equal(hash(path.join(legacy,f)),h);
  const legacyWorkspace=path.join(legacy,'workspace'),legacyClient=new StdioImageClient({workspace:legacyWorkspace,python});clients.push(legacyClient);await legacyClient.rpc('initialize');
  const oldRecords=Object.values(old).map(row).filter(v=>v.kind==='annotate');assert.equal(oldRecords.length,2);
  const results:Row[]=[];
  for(const record of oldRecords){const info=await call('image_info',{object_id:record.object_id},legacyClient),restored=await call('image_result',{request_id:record.request_id},legacyClient);assert.deepEqual(info.annotations,record.annotations);assert.deepEqual(restored.annotations,record.annotations);
   const redraw=await call('image_preview',{object_id:record.object_id,gamma:1.3,max_size:128},legacyClient),mark=row((redraw.annotations as unknown[])[0]),original=row((record.annotations as unknown[])[0]);assert.equal(mark.note,original.note);assert.equal(mark.annotation_id,original.annotation_id);
   for(const field of ['purpose','observation_contract_version','selection_origin','selection_origin_basis'])assert.equal(Object.hasOwn(mark,field),false);
   results.push({original_object_id:record.object_id,original_request_id:record.request_id,new_display_id:redraw.object_id,note_length_utf16:string(mark.note).length,anonymous:mark.annotation_id===undefined});
  }
  for(const [f,h]of Object.entries(before))assert.equal(hash(path.join(legacy,f)),h);
  report.legacy={frozen_base:json(path.join(legacy,'baseline.json')),results,files_unchanged:Object.keys(before).length};checks.push('Frozen baseline anonymous ROI/2048-codepoint annotation actual MCP reads, original-request recovery, reprojection and every original hash unchanged.');
 }else report.legacy='NOT_TESTED: set MICROSCOPY_LEGACY_OBSERVATIONS';
 report.status='PASS';report.current={panel_id:panelId,object_id:changed.object_id};dump(path.join(directory,'science-sha256.json'),{...sourceHistory,...savedHistory});
}catch(e){report.status='FAIL';report.error=(e as Error).stack;throw e;}
finally{dump(path.join(directory,'report.json'),report);for(const c of clients)await c.close();if(panelPid&&Number.isSafeInteger(panelPid))process.kill(panelPid,'SIGTERM');if(oldConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=oldConfig;console.log(JSON.stringify({status:report.status,report:path.join(directory,'report.json'),GUI:'NOT_TESTED',model:'NOT_TESTED'}));}
