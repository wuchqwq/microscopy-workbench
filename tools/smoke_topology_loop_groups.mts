// Actual MCP continuation of a captured public v1 object; no new FFT/GPA/GUI/DM.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Data=Record<string,unknown>;
const record=(value:unknown):Data=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Data;};
const rows=(value:unknown):Data[]=>{assert.ok(Array.isArray(value));return value.map(record);};
const identifier=(value:unknown):string=>{assert.equal(typeof value,'string');assert.match(value as string,/^[a-f0-9]{32}$/);return value as string;};
const repo=fileURLToPath(new URL('../',import.meta.url));
const receiptPath=process.env.MICROSCOPY_V1_TOPOLOGY_RECEIPT;
assert.ok(receiptPath&&path.isAbsolute(receiptPath),'Set MICROSCOPY_V1_TOPOLOGY_RECEIPT to the absolute pre-fix public synthetic receipt');
const receipt=record(JSON.parse(readFileSync(receiptPath,'utf8'))),original=record(receipt.request),legacy=record(receipt.response);
// JSON's MCP serialization turns -0 into 0. Compare the complete wire-level
// report while separately requiring every original persisted byte hash below.
const legacyWireReport:unknown=JSON.parse(JSON.stringify(legacy.report));
assert.equal(receipt.schema,'public-synthetic-topology-v1-pre-fix-receipt');
assert.equal(receipt.algorithm,'saved-wrapped-phase-rectangular-topology-v1');
assert.equal(original.action,'topology');
const workspace=String(original.workspace),goldenRoot=String(receipt.root),ids=record(receipt.ids);
assert.ok(path.isAbsolute(workspace)&&path.isAbsolute(goldenRoot));
assert.equal(receipt.workspace,workspace);
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'topology-loop-groups-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(code:string,args:string[]=[]):string=>{
 const reply=spawnSync(candidate,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
 if(reply.error)throw reply.error;assert.equal(reply.status,0,reply.stderr);return reply.stdout.trim();
};
const python=execute('import sys;print(sys.executable)');
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const existingFiles=record(receipt.files_sha256);
const assertOriginalBytes=()=>{
 for(const [name,digest] of Object.entries(existingFiles))assert.equal(hash(path.join(goldenRoot,name)),digest,name);
 assert.equal(hash(String(receipt.source)),receipt.source_sha256);
};
const objectRows=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))).map(id=>record(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8'))));
const counts=()=>{const all=objectRows();return {objects:all.length,fft:all.filter(row=>row.kind==='fft').length,gpa:all.filter(row=>row.kind==='gpa').length,topology:all.filter(row=>row.kind==='topology').length,exports:all.filter(row=>row.kind==='export').length};};
// The captured workspace is path-bound and named "workspace", whereas plugin
// config always appends "images". Use the same formal scientific MCP runtime's
// direct entry point so the exact original absolute workspace remains intact.
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;
delete process.env.MICROSCOPY_PLUGIN_CONFIG;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'server.mjs')});
const clients=[makeClient()],first=clients[0],started=performance.now(),timings:Data[]=[],checks:string[]=[];
const report:Data={schema:'public-synthetic-topology-loop-groups-mcp-v2',started_utc:new Date().toISOString(),scope:'Actual MCP stdio continuation of exact captured public v1 FFT/GPA/topology, grouped v2 revision, scientific export and fresh-client recovery',checks,timings,not_tested:['new FFT/GPA qualification','browser/GUI/Panel gestures or computer use','fresh ordinary model session','real specimen/material defect accuracy','cancellation/lost-response/worker interruption injection','native DM/GMS/vendor/hardware','unique conventional 3D Burgers vector','automatic core or domain localization']};
let serial=0;
const call=async(name:string,args:Data={},client=first)=>{
 const request_id=name==='image_info'?undefined:typeof args.request_id==='string'?args.request_id:`topology-groups-${path.basename(directory)}-${++serial}`,t=performance.now();
 try{return await client.tool(name,request_id===undefined?args:{...args,request_id});}finally{timings.push({tool:name,request_id:request_id??null,elapsed_ms:performance.now()-t});}
};
const data=async(name:string,args:Data={},client=first)=>record((await call(name,args,client)).data);
const assertLegacy=async(client:StdioImageClient)=>{
 const recovered=await data('image_result',{request_id:original.request_id},client);
 assert.equal(recovered.object_id,ids.topology);assert.deepEqual(recovered.report,legacyWireReport);
 const info=await data('image_info',{object_id:ids.topology},client);
 assert.equal(info.object_id,ids.topology);assert.deepEqual(info.report,legacyWireReport);
 assert.equal(record(info.report).algorithm,'saved-wrapped-phase-rectangular-topology-v1');
 assert.equal(record(info.report).status,'inconsistent_or_partial_evidence');
};
try{
 assertOriginalBytes();const before=counts(),beforeIds=new Set(objectRows().map(row=>row.object_id));
 await first.rpc('initialize');await assertLegacy(first);
 assert.deepEqual(counts(),before);
 checks.push('Original request and image_info recover the exact captured v1 report, including its historical global-loop inconsistency; no rewrite or reinterpretation.');
 const parameters=Object.fromEntries(Object.entries(original).filter(([key])=>!['action','workspace','request_id'].includes(key)));
 const reply=await call('image_topology',{...parameters,previous_topology_id:identifier(ids.topology),max_size:512,burgers_candidates:[{label:'b8x',b_pixel_xy:[8,0]},{label:'wrong8y',b_pixel_xy:[0,8]}]}),saved=record(reply.data),newId=identifier(saved.object_id),newReport=record(saved.report);
 assert.notEqual(newId,ids.topology);assert.equal(newReport.algorithm,'saved-wrapped-phase-rectangular-topology-v2');
 assert.equal(newReport.status,'spatially_grouped_evidence');assert.equal(newReport.projected_burgers,null);
 assert.deepEqual(newReport.reflections,[]);assert.deepEqual(newReport.burgers_candidates,[]);
 assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.material_dislocation_confirmed,false);assert.equal(saved.burgers_3d_unique,false);
 for(const key of ['fft_recomputed','gpa_recomputed','source_arrays_modified'])assert.equal(saved[key],false);
 const grouping=record(newReport.grouping),groups=rows(newReport.loop_groups);
 assert.equal(grouping.policy,'strict_nesting_components_v1');assert.equal(grouping.group_count,2);assert.equal(groups.length,2);
 assert.deepEqual(rows(grouping.inter_group_relations).map(relation=>relation.relation),['disjoint_support']);
 const core=groups.find(group=>JSON.stringify(group.loop_indices)==='[0,1]'),remote=groups.find(group=>JSON.stringify(group.loop_indices)==='[2]');
 assert.ok(core&&remote);assert.equal(core.status,'projected_topological_evidence');assert.equal(remote.status,'insufficient_loop_stability');
 assert.deepEqual(core.strictly_nested_loop_pairs,[[0,1]]);assert.deepEqual(remote.strictly_nested_loop_pairs,[]);
 const fit=record(core.projected_burgers);assert.equal(fit.rank,2);assert.equal(fit.redundancy_validated,true);assert.equal(fit.direction_family_count,3);
 assert.equal(record(remote.projected_burgers).b_pixel_xy,null);
 assert.ok((fit.b_pixel_xy as number[]).every((value,index)=>Math.abs(value-[8,0][index])<1e-6));
 assert.deepEqual(rows(core.burgers_candidates).map(row=>row.matches_saved_constraints),[true,false]);
 for(const summary of rows(remote.reflections)){assert.equal(summary.status,'insufficient_nested_loops');assert.deepEqual(summary.canonical_winding_integers,[0]);assert.deepEqual(summary.valid_loop_indices,[2]);}
 const loops=rows(newReport.loops);
 for(let index=0;index<loops.length;index++){
  assert.equal(loops[index].group_index,index===2?remote.group_index:core.group_index);
  assert.deepEqual(rows(loops[index].reflections).map(row=>row.canonical_winding_integer),index===2?[0,0,0]:[-1,0,-1]);
  assert.ok(rows(loops[index].reflections).every(row=>row.valid===true));
 }
 assert.ok(rows(saved.history).some(entry=>entry.object_id===ids.topology));
 assert.equal(typeof reply.png,'string');writeFileSync(path.join(directory,'grouped-preview.png'),Buffer.from(reply.png as string,'base64'));
 checks.push('V2 preserves all three valid winding vectors, evaluates the same-core nested pair independently of the remote zero loop, exposes both group statuses and no global fitted vector/candidates.');
 const exported=await data('image_export',{object_id:newId,output_dir:path.join(directory,'grouped-export')}),files=record(exported.exported_files_sha256);
 for(const [name,digest] of Object.entries(files))assert.equal(hash(path.join(String(exported.output_dir),name)),digest,name);
 for(const name of ['topology-report.json','topology-circuits.csv','loop_valid.npy','loop_winding_cycles.npy','manifest.json','provenance.json'])assert.ok(name in files,name);
 execute(String.raw`
import sys,pathlib,json,csv,numpy as np
d=pathlib.Path(sys.argv[1]);r=json.loads((d/'topology-report.json').read_text(encoding='utf8'));rows=list(csv.DictReader((d/'topology-circuits.csv').open(encoding='utf8',newline='')))
assert r['algorithm']=='saved-wrapped-phase-rectangular-topology-v2' and r['status']=='spatially_grouped_evidence'
assert len(r['loop_groups'])==2 and r['projected_burgers'] is None
assert len(rows)==9 and {'group_index','group_status'}.issubset(rows[0])
assert {int(row['group_index']) for row in rows}=={0,1}
assert {row['group_status'] for row in rows}=={'projected_topological_evidence','insufficient_loop_stability'}
v=np.load(d/'loop_valid.npy');w=np.load(d/'loop_winding_cycles.npy')
assert v.shape==(3,3) and v.all() and w.shape==(3,3)
assert np.max(np.abs(w-np.array([[-1,0,-1],[-1,0,-1],[0,0,0]])))<1e-6
`,[String(exported.output_dir)]);
 await assert.rejects(data('image_export',{object_id:newId,output_dir:exported.output_dir}),/OUTPUT_EXISTS|already exists/);
 checks.push('Grouped v2 export verifies file hashes, group-tagged CSV rows, all nine valid scientific winding observations and overwrite refusal.');
 const fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 await assertLegacy(fresh);
 const recovered=await data('image_result',{request_id:saved.request_id},fresh),reopened=await data('image_info',{object_id:newId},fresh);
 assert.equal(recovered.object_id,newId);assert.deepEqual(recovered.report,newReport);assert.deepEqual(reopened.report,newReport);
 const after=counts();assert.deepEqual(after,{objects:before.objects+2,fft:before.fft,gpa:before.gpa,topology:before.topology+1,exports:before.exports+1});
 assert.deepEqual(objectRows().filter(row=>!beforeIds.has(row.object_id)).map(row=>row.kind).sort(),['export','topology']);assertOriginalBytes();
 checks.push('Fresh MCP client recovers exact v1 and v2 original-request/object reports; every captured historical file/source hash is unchanged and the only new objects are one topology and its export receipt, with no FFT/GPA added.');
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;report.legacy={algorithm:receipt.algorithm,status:record(legacy.report).status,checked_original_file_count:Object.keys(existingFiles).length,source_hash_unchanged:true};
 report.grouped=newReport;report.counts={before,after};report.references={legacy_topology:ids.topology,legacy_request_id:original.request_id,v2_topology:newId,v2_request_id:saved.request_id,gpa:ids.gpa,fft:ids.fft};report.export=exported;
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS: actual MCP v1 preservation, per-group v2 continuation, scientific group export and fresh recovery; no new FFT/GPA.');
}catch(caught){report.result='FAIL';report.error=caught instanceof Error?caught.stack:String(caught);report.runtime_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw caught;}
finally{
 for(const client of clients)await client.close();
 if(previousConfig!==undefined)process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
 console.log('Retained evidence: '+path.join(directory,'report.json'));
}
